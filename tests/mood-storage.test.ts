import { describe, expect, it } from 'vitest';
import {
  createEmptyData,
  id,
  moodEntriesSchema,
  moodEntrySchema,
  preferencesSchema,
  workspaceDataSchema,
} from '@/lib/model';
import {
  addMutationHistory,
  isPreferencesOnlyChange,
  loadLocal,
  prepareImport,
  previewImport,
  saveLocal,
  serializeExport,
  storageKey,
} from '@/lib/persistence';
import {
  documentRpcPayload,
  preferenceRpcPayload,
  preserveLegacyDocumentFields,
  serializeDocument,
  serializePreferences,
  supportsMoodPreferences,
} from '@/lib/server/legacy-fields';

const entry = {
  date: '2026-09-20',
  mood: 4,
  energy: null,
  note: 'Une journée calme.',
  updatedAt: '2026-09-20T18:00:00+02:00',
};

describe('private mood data validation and persistence', () => {
  it('loads older workspaces empty and accepts leap dates, optional energy and Unicode notes', () => {
    const raw = structuredClone(createEmptyData()) as unknown as {
      preferences: Record<string, unknown>;
    };
    delete raw.preferences.moodEntries;
    expect(workspaceDataSchema.parse(raw).preferences.moodEntries).toEqual([]);
    expect(moodEntrySchema.parse({ ...entry, date: '2024-02-29', energy: 5 })).toMatchObject({
      energy: 5,
    });
    expect(moodEntrySchema.safeParse({ ...entry, note: '🌱'.repeat(140) }).success).toBe(true);
  });

  it('rejects invalid dates, scores, timestamps, lengths, extra identities and duplicate days', () => {
    for (const patch of [
      { date: '2025-02-29' },
      { date: '0000-01-01' },
      { date: '2026-13-01' },
      { mood: 0 },
      { mood: 6 },
      { mood: 2.5 },
      { energy: 0 },
      { energy: undefined },
      { energy: '3' },
      { note: 'a'.repeat(281) },
      { updatedAt: 'yesterday' },
      { userId: id() },
    ])
      expect(moodEntrySchema.safeParse({ ...entry, ...patch }).success).toBe(false);
    expect(moodEntriesSchema.safeParse([entry, { ...entry, mood: 1 }]).success).toBe(false);
    const entries = Array.from({ length: 731 }, (_, index) => ({
      ...entry,
      date: new Date(Date.UTC(2022, 0, 1 + index)).toISOString().slice(0, 10),
    }));
    expect(moodEntriesSchema.safeParse(entries.slice(0, 730)).success).toBe(true);
    expect(moodEntriesSchema.safeParse(entries).success).toBe(false);
  });

  it('round-trips only within the selected account/workspace and adds no productivity history', () => {
    const before = createEmptyData(),
      after = structuredClone(before);
    after.preferences.moodEntries = [entry];
    const changed = addMutationHistory(before, after, id());
    expect(isPreferencesOnlyChange(before, changed)).toBe(true);
    expect(changed.events).toEqual(before.events);
    expect(changed.focusSessions).toEqual([]);
    const cache = new Map<string, string>();
    const storage = {
      getItem: (key: string) => cache.get(key) ?? null,
      setItem: (key: string, value: string) => {
        cache.set(key, value);
      },
    };
    const userId = id(),
      key = storageKey(after.workspaceId, userId);
    saveLocal(key, changed, 0, storage);
    expect(loadLocal(key, storage)?.data.preferences.moodEntries).toEqual([entry]);
    expect(loadLocal(storageKey(after.workspaceId, id()), storage)).toBeNull();
    expect(loadLocal(storageKey(id(), userId), storage)).toBeNull();
    expect(createEmptyData(id()).preferences.moodEntries).toEqual([]);
  });

  it('includes moods in private exports while general import preserves destination preferences', () => {
    const source = createEmptyData(),
      destination = createEmptyData(id());
    source.preferences.moodEntries = [entry];
    destination.preferences.moodEntries = [{ ...entry, mood: 2, note: 'Mon espace actuel.' }];
    const preview = previewImport(serializeExport(source));
    expect(preview.data.preferences.moodEntries).toEqual([entry]);
    expect(prepareImport(preview, destination).preferences.moodEntries).toEqual(
      destination.preferences.moodEntries,
    );
  });
});

describe('separately negotiated mood compatibility', () => {
  it('keeps strict existing v2 clients unaware of moods until the separate capability is sent', () => {
    const data = createEmptyData();
    data.preferences.moodEntries = [entry];
    expect(
      supportsMoodPreferences(
        new Request('http://localhost', { headers: { 'X-Folia-Document-Version': '2' } }),
      ),
    ).toBe(false);
    expect(
      supportsMoodPreferences(
        new Request('http://localhost', { headers: { 'X-Folia-Mood-Version': '1' } }),
      ),
    ).toBe(true);
    for (const modern of [false, true]) {
      expect(serializeDocument(data, modern).preferences).not.toHaveProperty('moodEntries');
      expect(serializePreferences(data.preferences, modern)).not.toHaveProperty('moodEntries');
    }
    expect(serializeDocument(data, true, true)).toEqual(data);
    expect(data.preferences.moodEntries).toEqual([entry]);
  });

  it('preserves old-client omissions without changing retry payloads, and permits explicit removal', () => {
    const prior = createEmptyData();
    prior.preferences.moodEntries = [entry];
    const raw = serializeDocument(prior, true);
    const parsed = workspaceDataSchema.parse(preserveLegacyDocumentFields(raw, prior));
    expect(parsed.preferences.moodEntries).toEqual([entry]);
    expect(documentRpcPayload(parsed, raw).preferences).not.toHaveProperty('moodEntries');
    const defaulted = preferencesSchema.parse(raw.preferences);
    expect(preferenceRpcPayload(defaulted, raw.preferences)).not.toHaveProperty('moodEntries');
    const changed = structuredClone(prior);
    changed.preferences.moodEntries = [];
    expect(
      workspaceDataSchema.parse(preserveLegacyDocumentFields(changed, prior)).preferences
        .moodEntries,
    ).toEqual([]);
    expect(documentRpcPayload(changed, changed).preferences).toHaveProperty('moodEntries', []);
  });
});
