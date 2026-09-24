import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDemoData, id, LOCAL_USER_ID, type WorkspaceData } from '@/lib/model';
import { makeDocumentPatch, type DocumentPatch } from '@/lib/sync-transfer';

const state = vi.hoisted(() => ({
  data: null as WorkspaceData | null,
  version: 3,
  rpc: vi.fn(),
  reads: 0,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/auth', () => ({
  requireWorkspace: vi.fn(async () => ({ user: { id: '00000000-0000-4000-8000-000000000002' } })),
  durableRateLimit: vi.fn(async () => undefined),
}));
vi.mock('@/lib/supabase/server', () => ({
  getAdminSupabase: () => ({
    rpc: state.rpc,
    from: (table: string) => {
      const result = () => {
        if (table === 'workspace_documents') {
          state.reads++;
          return {
            data: { data: structuredClone(state.data), version: state.version },
            error: null,
          };
        }
        if (table === 'preferences')
          return {
            data: { data: state.data!.preferences, timer_state: state.data!.timer },
            error: null,
          };
        if (table === 'workspace_memberships')
          return { data: [{ user_id: '00000000-0000-4000-8000-000000000002' }], error: null };
        return { data: null, error: null };
      };
      const query = {
        select: () => query,
        eq: () => query,
        single: async () => result(),
        maybeSingle: async () => result(),
        then: (resolve: (value: ReturnType<typeof result>) => unknown) =>
          Promise.resolve(result()).then(resolve),
      };
      return query;
    },
  }),
}));

import { GET, PATCH } from '@/app/api/sync/route';
import { requireWorkspace } from '@/lib/server/auth';
import { HttpError } from '@/lib/server/http';

function request(patch: DocumentPatch, expectedVersion = 3, operationId = id()) {
  return new Request(`http://localhost/api/sync?workspaceId=${state.data!.workspaceId}`, {
    method: 'PATCH',
    headers: { origin: 'http://localhost', 'content-type': 'application/json' },
    body: JSON.stringify({ patch, expectedVersion, operationId }),
  });
}
function changedTaskPatch() {
  const next = structuredClone(state.data!);
  next.tasks[0].title = 'Une tâche modifiée';
  return makeDocumentPatch(state.data!, next);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost');
  state.data = createDemoData(new Date('2026-09-14T08:00:00Z'));
  state.version = 3;
  state.data.revision = state.version;
  state.reads = 0;
  state.rpc.mockResolvedValue({ data: { version: 4, committedVersion: 4 }, error: null });
});
afterEach(() => vi.unstubAllEnvs());

describe('compact sync PATCH permission and version boundary', () => {
  it('sends the same canonical entity values on the initial request and a stale replay', async () => {
    const patch = changedTaskPatch();
    patch.collections.tasks!.replace[0].title = '  Titre à normaliser  ';
    const operationId = id();
    expect((await PATCH(request(patch, 3, operationId))).status).toBe(200);
    const originalPayload = structuredClone(state.rpc.mock.calls[0][1]);
    expect(originalPayload.p_patch.collections.tasks.replace[0].title).toBe('Titre à normaliser');
    expect(patch.collections.tasks!.replace[0].title).toBe('  Titre à normaliser  ');
    state.version = 9;
    state.rpc.mockResolvedValueOnce({
      data: { version: 9, committedVersion: 4, replayed: true },
      error: null,
    });
    expect((await PATCH(request(patch, 3, operationId))).status).toBe(200);
    expect(state.rpc.mock.calls[1][1]).toEqual(originalPayload);
  });

  it('validates against the current version and sends an immutable patch with actor and operation', async () => {
    const patch = changedTaskPatch();
    const operationId = id();
    const response = await PATCH(request(patch, 3, operationId));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(await response.json()).toEqual({ version: 4, committedVersion: 4, replayed: false });
    expect(vi.mocked(requireWorkspace)).toHaveBeenCalledWith(state.data!.workspaceId, {
      roles: ['owner', 'admin', 'member'],
    });
    expect(state.rpc).toHaveBeenCalledExactlyOnceWith('folia_commit_patch', {
      p_actor: LOCAL_USER_ID,
      p_workspace: state.data!.workspaceId,
      p_patch: patch,
      p_expected_version: 3,
      p_operation: operationId,
    });
  });

  it('rejects cross-origin requests and read-only roles before any document write', async () => {
    const foreign = request(changedTaskPatch());
    foreign.headers.set('origin', 'https://foreign.example');
    expect((await PATCH(foreign)).status).toBe(403);
    expect(requireWorkspace).not.toHaveBeenCalled();
    vi.mocked(requireWorkspace).mockRejectedValueOnce(new HttpError(403, 'Lecture seule'));
    expect((await PATCH(request(changedTaskPatch()))).status).toBe(403);
    expect(state.rpc).not.toHaveBeenCalled();
    expect(state.reads).toBe(0);
  });

  it('rejects foreign document identifiers and unknown collection writes', async () => {
    const patch = changedTaskPatch();
    patch.metadata.workspaceId = id();
    expect((await PATCH(request(patch))).status).toBe(400);
    const invalid = changedTaskPatch();
    Object.assign(invalid.collections, { memberships: { remove: [], replace: [], insert: [] } });
    expect((await PATCH(request(invalid))).status).toBe(400);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it('rejects changing another member’s plan before calling the commit transaction', async () => {
    state.data!.plannedSessions[0].userId = id();
    const next = structuredClone(state.data!);
    next.plannedSessions[0].title = 'Modification interdite';
    expect((await PATCH(request(makeDocumentPatch(state.data!, next)))).status).toBe(403);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it('passes stale requests to the transaction for durable replay and reports real CAS conflicts', async () => {
    const patch = changedTaskPatch();
    state.version = 9;
    state.rpc.mockResolvedValueOnce({
      data: { version: 9, committedVersion: 4, replayed: true },
      error: null,
    });
    const replay = await PATCH(request(patch));
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({ version: 9, committedVersion: 4, replayed: true });
    state.rpc.mockResolvedValueOnce({ data: { conflict: true, version: 9 }, error: null });
    const conflict = await PATCH(request(patch));
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ version: 9 });
  });

  it('surfaces the SQL rejection of reused operation identifiers', async () => {
    state.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '23505', message: 'Identifiant déjà utilisé pour une autre modification.' },
    });
    const response = await PATCH(request(changedTaskPatch()));
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain('Identifiant');
  });

  it('rejects duplicate replacements so JS last-wins and SQL first-wins cannot diverge', async () => {
    const patch = changedTaskPatch();
    patch.collections.tasks!.replace.unshift({
      ...state.data!.tasks[0],
      title: 'Version différente de celle validée',
    });
    expect((await PATCH(request(patch))).status).toBe(400);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it('rejects equal insertion positions whose SQL ordering would be ambiguous', async () => {
    const patch = makeDocumentPatch(state.data!, state.data!);
    patch.collections.tasks = {
      remove: [],
      replace: [],
      insert: [
        { at: 0, value: { ...state.data!.tasks[0], id: id(), checklist: [] } },
        { at: 0, value: { ...state.data!.tasks[0], id: id(), checklist: [] } },
      ],
    };
    expect((await PATCH(request(patch))).status).toBe(400);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it('keeps omitted moods absent from legacy PATCH retries while validating against private history', async () => {
    state.data!.preferences.moodEntries = [
      {
        date: '2026-09-13',
        mood: 4,
        energy: null,
        note: 'Private',
        updatedAt: '2026-09-13T18:00:00Z',
      },
    ];
    const patch = changedTaskPatch();
    delete (patch.metadata.preferences as Partial<typeof patch.metadata.preferences>).moodEntries;
    const operationId = id();
    expect((await PATCH(request(patch, 3, operationId))).status).toBe(200);
    const first = structuredClone(state.rpc.mock.calls[0][1]);
    expect(first.p_patch.metadata.preferences).not.toHaveProperty('moodEntries');
    state.version = 5;
    state.data!.preferences.moodEntries[0].note = 'Later private edit';
    expect((await PATCH(request(patch, 3, operationId))).status).toBe(200);
    expect(state.rpc.mock.calls[1][1]).toEqual(first);
  });
});

describe('paged GET boundaries', () => {
  const getPage = (suffix: string) =>
    GET(
      new Request(
        `http://localhost/api/sync?workspaceId=${state.data!.workspaceId}&transfer=paged${suffix}`,
      ),
    );
  it('requires membership, returns private versioned pages and rejects missing or stale versions', async () => {
    const first = await getPage('&cursor=0');
    expect(first.status).toBe(200);
    expect(first.headers.get('cache-control')).toContain('private');
    const body = await first.json();
    expect(body.version).toBe(3);
    expect(body.metadata.workspaceId).toBe(state.data!.workspaceId);
    expect(body.entries.length).toBeGreaterThan(0);
    expect((await getPage('&cursor=1')).status).toBe(400);
    expect((await getPage('&cursor=1&version=2')).status).toBe(409);
    expect((await getPage('&cursor=999999&version=3')).status).toBe(400);
    vi.mocked(requireWorkspace).mockRejectedValueOnce(new HttpError(403, 'Accès refusé'));
    expect((await getPage('&cursor=0')).status).toBe(403);
  });
  it('omits mood metadata for existing paged clients and exposes only the requesting user preferences to capable clients', async () => {
    state.data!.preferences.moodEntries = [
      {
        date: '2026-09-13',
        mood: 4,
        energy: 2,
        note: 'Private',
        updatedAt: '2026-09-13T18:00:00Z',
      },
    ];
    expect((await (await getPage('&cursor=0')).json()).metadata.preferences).not.toHaveProperty(
      'moodEntries',
    );
    const response = await GET(
      new Request(
        `http://localhost/api/sync?workspaceId=${state.data!.workspaceId}&transfer=paged&cursor=0`,
        { headers: { 'X-Folia-Document-Version': '2', 'X-Folia-Mood-Version': '1' } },
      ),
    );
    expect((await response.json()).metadata.preferences.moodEntries).toEqual(
      state.data!.preferences.moodEntries,
    );
  });
});
