import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyData, id, workspaceDataSchema, type WorkspaceData } from '@/lib/model';
import { validateDocumentChange } from '@/lib/server/document';
import {
  documentRpcPayload,
  preferenceRpcPayload,
  preserveLegacyDocumentFields,
  serializeDocument,
  serializePreferences,
  supportsLearningDocument,
} from '@/lib/server/legacy-fields';
import { HttpError } from '@/lib/server/http';
import { resolveEntitlements } from '@/lib/billing/entitlements';

const mocks = vi.hoisted(() => ({
  requireWorkspace: vi.fn(),
  feature: vi.fn(),
  single: vi.fn(),
  eq: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/auth', () => ({
  requireWorkspace: mocks.requireWorkspace,
  durableRateLimit: vi.fn(async () => undefined),
}));
vi.mock('@/lib/billing/server', () => ({ assertWorkspaceFeature: mocks.feature }));
import { GET as study } from '@/app/api/flashcards/study/route';

const actor = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const workspace = '33333333-3333-4333-8333-333333333333';
const members = new Set([actor, other]);
const stamp = '2026-09-10T09:00:00Z';
function fixture(): WorkspaceData {
  const data = createEmptyData(workspace);
  const common = { workspaceId: workspace, userId: actor, createdAt: stamp, updatedAt: stamp };
  data.noteSheets.push({
    ...common,
    id: id(),
    title: 'Observation',
    content: 'Original content',
    kind: 'note',
    revisions: [],
  });
  data.flashcardDecks.push({ ...common, id: id(), title: 'Deck', description: '' });
  data.flashcards.push({
    ...common,
    id: id(),
    deckId: data.flashcardDecks[0].id,
    front: 'Question',
    back: 'Answer',
  });
  data.preferences.accentColor = '#123456';
  data.preferences.background = {
    kind: 'image',
    preset: 'aurora',
    image: 'data:image/png;base64,aGVsbG8=',
    overlay: 70,
    blur: 0,
  };
  return data;
}

describe('learning author and history protections', () => {
  it('accepts own new notes and flashcards', () => {
    expect(() => validateDocumentChange(null, fixture(), actor, members)).not.toThrow();
  });
  it('keeps author and original creation time immutable', () => {
    for (const key of ['noteSheets', 'flashcardDecks', 'flashcards'] as const) {
      const previous = fixture(),
        next = structuredClone(previous);
      next[key][0].userId = other;
      expect(() => validateDocumentChange(previous, next, actor, members)).toThrow(
        'original author',
      );
      next[key][0].userId = actor;
      next[key][0].createdAt = '2026-09-11T09:00:00Z';
      expect(() => validateDocumentChange(previous, next, actor, members)).toThrow(
        'creation timestamp',
      );
    }
  });
  it('does not let organization owners edit or delete another author records', () => {
    for (const key of ['noteSheets', 'flashcardDecks', 'flashcards'] as const) {
      const previous = fixture(),
        next = structuredClone(previous);
      next[key][0].updatedAt = '2026-09-11T09:00:00Z';
      expect(() => validateDocumentChange(previous, next, other, members)).toThrow(
        'own notes and flashcards',
      );
      next[key] = [];
      expect(() => validateDocumentChange(previous, next, other, members)).toThrow(
        'another member',
      );
    }
  });
  it('requires one append-only revision for title or content changes', () => {
    const previous = fixture(),
      next = structuredClone(previous);
    next.noteSheets[0].title = 'Refined observation';
    expect(() => validateDocumentChange(previous, next, actor, members)).toThrow(
      'revision history',
    );
    next.noteSheets[0].revisions.push({
      title: previous.noteSheets[0].title,
      content: previous.noteSheets[0].content,
      editedAt: stamp,
    });
    expect(() => validateDocumentChange(previous, next, actor, members)).not.toThrow();
    const changed = structuredClone(next);
    changed.noteSheets[0].revisions[0].content = 'Rewritten past';
    expect(() => validateDocumentChange(next, changed, actor, members)).toThrow(
      'cannot be rewritten',
    );
  });
  it('cannot place an owned card in a different author deck', () => {
    const data = fixture();
    data.flashcardDecks[0].userId = other;
    const next = structuredClone(data);
    next.flashcards.push({ ...next.flashcards[0], id: id() });
    expect(() => validateDocumentChange(data, next, actor, members)).toThrow('same author');
  });
});

describe('legacy cloud document compatibility', () => {
  it('negotiates the modern document explicitly and serializes a strict legacy shape by default', () => {
    const data = fixture();
    data.preferences.accent = 'blurple';
    data.events.push({
      id: id(),
      workspaceId: workspace,
      userId: actor,
      timestamp: stamp,
      type: 'note_created',
      details: 'Created a note',
    });
    const legacy = serializeDocument(data, false);
    expect(legacy).not.toHaveProperty('noteSheets');
    expect(legacy).not.toHaveProperty('flashcardDecks');
    expect(legacy).not.toHaveProperty('flashcards');
    expect(legacy.preferences).not.toHaveProperty('accentColor');
    expect(legacy.preferences).not.toHaveProperty('background');
    expect(legacy.preferences).toMatchObject({ accent: 'blue' });
    expect(legacy.events).toEqual([]);
    expect(serializePreferences(data.preferences, false)).toEqual(legacy.preferences);
    expect(supportsLearningDocument(new Request('http://localhost'))).toBe(false);
    expect(
      supportsLearningDocument(
        new Request('http://localhost', { headers: { 'x-folia-document-version': '2' } }),
      ),
    ).toBe(true);
    expect(serializeDocument(data, true, true)).toEqual(data);
  });
  it('restores hidden learning events for validation while retaining raw events for stable retries', () => {
    const previous = fixture();
    previous.events.push({
      id: id(),
      workspaceId: workspace,
      userId: actor,
      timestamp: stamp,
      type: 'note_created',
      details: 'Created a note',
    });
    const legacy = serializeDocument(previous, false);
    const parsed = workspaceDataSchema.parse(preserveLegacyDocumentFields(legacy, previous));
    expect(parsed.events).toEqual(previous.events);
    expect(() => validateDocumentChange(previous, parsed, actor, members)).not.toThrow();
    expect(documentRpcPayload(parsed, legacy).events).toEqual([]);
    previous.events.push({ ...previous.events[0], id: id(), type: 'note_updated' });
    const replay = workspaceDataSchema.parse(preserveLegacyDocumentFields(legacy, previous));
    expect(documentRpcPayload(replay, legacy)).toEqual(documentRpcPayload(parsed, legacy));
  });
  it('preserves omitted new collections and private appearance without changing retry payload shape', () => {
    const previous = fixture();
    const raw = structuredClone(previous) as unknown as Record<string, unknown>;
    delete raw.noteSheets;
    delete raw.flashcardDecks;
    delete raw.flashcards;
    const preferences = raw.preferences as Record<string, unknown>;
    delete preferences.background;
    delete preferences.accentColor;
    const parsed = workspaceDataSchema.parse(preserveLegacyDocumentFields(raw, previous));
    expect(parsed.noteSheets).toEqual(previous.noteSheets);
    expect(parsed.flashcards).toEqual(previous.flashcards);
    expect(parsed.preferences.background).toEqual(previous.preferences.background);
    expect(parsed.preferences.accentColor).toBe('#123456');
    const payload = documentRpcPayload(parsed, raw);
    expect(payload).not.toHaveProperty('noteSheets');
    expect(payload).not.toHaveProperty('flashcards');
    expect(payload.preferences).not.toHaveProperty('background');
    expect(payload.preferences).not.toHaveProperty('accentColor');
  });
  it('preserves legacy completion but respects deliberate modern reopening', () => {
    const previous = fixture();
    previous.subjects.push({
      id: id(),
      workspaceId: workspace,
      name: 'Topic',
      description: '',
      icon: 'leaf',
      color: '#123456',
      archived: false,
      completedAt: stamp,
      weeklyGoal: 0,
      resources: [],
      order: 0,
      createdAt: stamp,
      updatedAt: stamp,
    });
    const legacy = structuredClone(previous) as unknown as Record<string, unknown>;
    delete legacy.noteSheets;
    delete (legacy.subjects as Record<string, unknown>[])[0].completedAt;
    const parsed = workspaceDataSchema.parse(preserveLegacyDocumentFields(legacy, previous));
    expect(parsed.subjects[0].completedAt).toBe(stamp);
    expect(
      (documentRpcPayload(parsed, legacy).subjects as Record<string, unknown>[])[0],
    ).not.toHaveProperty('completedAt');
    const modern = structuredClone(previous);
    delete modern.subjects[0].completedAt;
    expect(
      workspaceDataSchema.parse(preserveLegacyDocumentFields(modern, previous)).subjects[0]
        .completedAt,
    ).toBeUndefined();
  });
  it('allows explicit collection removal instead of treating empty arrays as omitted', () => {
    const previous = fixture(),
      next = structuredClone(previous);
    next.noteSheets = [];
    next.flashcards = [];
    next.flashcardDecks = [];
    const parsed = workspaceDataSchema.parse(preserveLegacyDocumentFields(next, previous));
    expect(parsed.noteSheets).toEqual([]);
    expect(documentRpcPayload(parsed, next).flashcards).toEqual([]);
  });
  it('keeps legacy preference omissions visible to the SQL guard', () => {
    const preferences = fixture().preferences;
    const raw = structuredClone(preferences) as Record<string, unknown>;
    delete raw.background;
    delete raw.accentColor;
    const payload = preferenceRpcPayload(preferences, raw);
    expect(payload).not.toHaveProperty('background');
    expect(payload).not.toHaveProperty('accentColor');
    expect(payload.appearance).toBe(preferences.appearance);
  });
});

describe('protected flashcard study', () => {
  let data: WorkspaceData;
  beforeEach(() => {
    vi.clearAllMocks();
    data = fixture();
    const query = { select: () => query, eq: mocks.eq, single: mocks.single };
    mocks.eq.mockReturnValue(query);
    mocks.requireWorkspace.mockResolvedValue({
      user: { id: actor },
      role: 'viewer',
      supabase: { from: () => query },
    });
    mocks.feature.mockResolvedValue({ features: { flashcards: true } });
    mocks.single.mockImplementation(async () => ({ data: { data }, error: null }));
  });
  const request = (deckId: string, extra = '') =>
    new Request(
      `http://localhost/api/flashcards/study?workspaceId=${workspace}&deckId=${deckId}${extra}`,
    );
  it('requires current membership before entitlements or data reads', async () => {
    mocks.requireWorkspace.mockRejectedValue(new HttpError(403, 'Workspace access denied.'));
    expect((await study(request(data.flashcardDecks[0].id))).status).toBe(403);
    expect(mocks.feature).not.toHaveBeenCalled();
    expect(mocks.single).not.toHaveBeenCalled();
  });
  it('denies Free and downgraded study starts before reading cards', async () => {
    mocks.feature.mockRejectedValue(new HttpError(403, 'A paid plan is required.'));
    expect((await study(request(data.flashcardDecks[0].id))).status).toBe(403);
    expect(mocks.feature).toHaveBeenCalledWith(workspace, 'flashcards');
    expect(mocks.single).not.toHaveBeenCalled();
  });
  it('returns only the selected permitted deck with private no-store caching', async () => {
    const deck = data.flashcardDecks[0];
    data.flashcardDecks.push({ ...deck, id: id(), title: 'Second' });
    data.flashcards.push({ ...data.flashcards[0], id: id(), deckId: data.flashcardDecks[1].id });
    const response = await study(request(deck.id));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect((await response.json()).cards).toEqual([data.flashcards[0]]);
    expect(mocks.eq).toHaveBeenCalledWith('workspace_id', workspace);
  });
  it('does not truncate decks at PostgREST default row limits', async () => {
    data.flashcards = Array.from({ length: 1001 }, () => ({ ...data.flashcards[0], id: id() }));
    const response = await study(request(data.flashcardDecks[0].id));
    expect((await response.json()).cards).toHaveLength(1001);
    expect(mocks.single).toHaveBeenCalledTimes(1);
  });
  it('rejects unknown deck identity and client paid claims', async () => {
    expect((await study(request(id()))).status).toBe(404);
    mocks.single.mockClear();
    expect((await study(request(data.flashcardDecks[0].id, '&paid=true'))).status).toBe(400);
    expect(mocks.single).not.toHaveBeenCalled();
  });
  it('never returns cards from a mismatched workspace snapshot', async () => {
    data.workspaceId = id();
    expect((await study(request(data.flashcardDecks[0].id))).status).toBe(503);
  });
});

describe('learning feature entitlement matrix', () => {
  it('grants new paid features only for trusted paid periods in the matching scope', () => {
    const now = Date.parse(stamp);
    const subscription = {
      tier: 'pro' as const,
      paid_tier: 'pro' as const,
      status: 'active',
      paid_through: '2026-10-01T00:00:00Z',
      current_period_end: '2026-10-01T00:00:00Z',
    };
    expect(resolveEntitlements(null, 'personal', now).features).toMatchObject({
      backgrounds: false,
      flashcards: false,
    });
    expect(resolveEntitlements(subscription, 'personal', now).features).toMatchObject({
      backgrounds: true,
      flashcards: true,
    });
    expect(resolveEntitlements(subscription, 'organization', now).features).toMatchObject({
      backgrounds: false,
      flashcards: false,
    });
    expect(
      resolveEntitlements({ ...subscription, tier: 'team', paid_tier: 'team' }, 'organization', now)
        .features,
    ).toMatchObject({ backgrounds: true, flashcards: true });
    expect(
      resolveEntitlements(subscription, 'personal', Date.parse(subscription.paid_through)).features,
    ).toMatchObject({ backgrounds: false, flashcards: false });
  });
});
