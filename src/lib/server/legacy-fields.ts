import type { Preferences, WorkspaceData } from '@/lib/model';

const learningKeys = ['noteSheets', 'flashcardDecks', 'flashcards'] as const;
const preferenceKeys = ['accentColor', 'background'] as const;
export const learningEventTypes = new Set([
  'subject_completed',
  'subject_reopened',
  'note_created',
  'note_updated',
  'note_deleted',
  'flashcard_deck_created',
  'flashcard_deck_updated',
  'flashcard_deck_deleted',
  'flashcard_created',
  'flashcard_updated',
  'flashcard_deleted',
]);
const legacyAccents: Record<string, string> = { blurple: 'blue', rose: 'plum', cyan: 'blue' };
const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export function supportsLearningDocument(request: Request): boolean {
  return request.headers.get('x-folia-document-version') === '2';
}

export function serializePreferences(
  preferences: Preferences,
  modern: boolean,
): Record<string, unknown> {
  const result = structuredClone(preferences) as Record<string, unknown>;
  if (!modern) {
    for (const key of preferenceKeys) delete result[key];
    result.accent = legacyAccents[preferences.accent] || preferences.accent;
  }
  return result;
}

/** Previously deployed clients validate strict schemas, including enum values. */
export function serializeDocument(data: WorkspaceData, modern: boolean): Record<string, unknown> {
  const result = structuredClone(data) as unknown as Record<string, unknown>;
  if (!modern) {
    for (const key of learningKeys) delete result[key];
    result.subjects = data.subjects.map((subject) => {
      const copy = { ...subject };
      delete copy.completedAt;
      return copy;
    });
    result.events = data.events.filter((event) => !learningEventTypes.has(event.type));
  }
  result.preferences = serializePreferences(data.preferences, modern);
  return result;
}

/** Old clients omit new fields. Only an explicitly supplied value can replace them. */
export function preserveLegacyDocumentFields(
  raw: unknown,
  previous: WorkspaceData | null,
): unknown {
  if (!record(raw)) return raw;
  const result = { ...raw };
  for (const key of learningKeys) if (!(key in raw)) result[key] = previous?.[key] || [];
  if (!('noteSheets' in raw) && Array.isArray(raw.events)) {
    const ids = new Set(raw.events.filter(record).map((event) => event.id));
    result.events = [
      ...raw.events,
      ...(previous?.events || []).filter(
        (event) => learningEventTypes.has(event.type) && !ids.has(event.id),
      ),
    ];
  }
  if (record(raw.preferences)) {
    result.preferences = { ...raw.preferences };
    for (const key of preferenceKeys)
      if (!(key in raw.preferences) && previous)
        (result.preferences as Record<string, unknown>)[key] = previous.preferences[key];
  }
  if (!('noteSheets' in raw) && Array.isArray(raw.subjects))
    result.subjects = raw.subjects.map((subject) => {
      if (!record(subject) || 'completedAt' in subject) return subject;
      const prior = previous?.subjects.find((item) => item.id === subject.id);
      return prior?.completedAt ? { ...subject, completedAt: prior.completedAt } : subject;
    });
  return result;
}

export function preferenceRpcPayload(
  preferences: Preferences,
  raw: unknown,
): Record<string, unknown> {
  const result = { ...preferences } as Record<string, unknown>;
  if (record(raw)) for (const key of preferenceKeys) if (!(key in raw)) delete result[key];
  return result;
}

/** Keep omissions visible to the SQL compatibility layer and its stable retry hash. */
export function documentRpcPayload(data: WorkspaceData, raw: unknown): Record<string, unknown> {
  const result = structuredClone(data) as unknown as Record<string, unknown>;
  if (!record(raw)) return result;
  for (const key of learningKeys) if (!(key in raw)) delete result[key];
  result.preferences = preferenceRpcPayload(data.preferences, raw.preferences);
  if (!('noteSheets' in raw) && Array.isArray(raw.subjects)) {
    const supplied = new Map(raw.subjects.filter(record).map((subject) => [subject.id, subject]));
    result.subjects = data.subjects.map((subject) => {
      const next = { ...subject };
      if (!supplied.get(subject.id)?.completedAt) delete next.completedAt;
      return next;
    });
  }
  if (!('noteSheets' in raw)) result.events = raw.events;
  return result;
}
