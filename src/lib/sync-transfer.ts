import { z } from 'zod';
import { workspaceDataSchema, type WorkspaceData } from './model';

export const syncCollections = ['subjects', 'projects', 'tasks', 'plannedSessions', 'focusSessions', 'journal', 'noteSheets', 'flashcardDecks', 'flashcards', 'events'] as const;
type Collection = (typeof syncCollections)[number];
type RecordData = { id: string; [key: string]: unknown };
const entity = z.object({ id: z.string().uuid() }).passthrough();
const collectionPatch = z.object({
  remove: z.array(z.string().uuid()),
  replace: z.array(entity),
  insert: z.array(z.object({ at: z.number().int().min(0).max(500000), value: entity }).strict()),
  order: z.array(z.string().uuid()).optional(),
}).strict().superRefine((change, context) => {
  for (const values of [change.remove, change.replace.map((item) => item.id), change.insert.map((item) => item.value.id), change.insert.map((item) => item.at)]) {
    if (new Set(values).size !== values.length) context.addIssue({ code: 'custom', message: 'La modification contient des identifiants ou positions en double.' });
  }
});
export const documentPatchSchema = z.object({
  metadata: z.object({
    schemaVersion: z.literal(1), workspaceId: z.string().uuid(), revision: z.number().int().min(0),
    updatedAt: z.string().datetime({ offset: true }), preferences: z.unknown(), timer: z.unknown(),
  }).strict(),
  collections: z.partialRecord(z.enum(syncCollections), collectionPatch),
}).strict();
export type DocumentPatch = z.infer<typeof documentPatchSchema>;

export function documentMetadata(data: WorkspaceData) {
  const { schemaVersion, workspaceId, revision, updatedAt, preferences, timer } = data;
  return { schemaVersion, workspaceId, revision, updatedAt, preferences, timer };
}

export function makeDocumentPatch(previous: WorkspaceData, next: WorkspaceData): DocumentPatch {
  if (previous.workspaceId !== next.workspaceId) throw new Error('Les espaces à synchroniser ne correspondent pas.');
  const collections: DocumentPatch['collections'] = {};
  for (const key of syncCollections) {
    const before = previous[key] as RecordData[], after = next[key] as RecordData[];
    const original = new Map(before.map((item) => [item.id, item]));
    const retained = new Set(after.map((item) => item.id));
    const remove = before.filter((item) => !retained.has(item.id)).map((item) => item.id);
    const replace = after.filter((item) => original.has(item.id) && JSON.stringify(original.get(item.id)) !== JSON.stringify(item));
    const insert = after.flatMap((value, at) => original.has(value.id) ? [] : [{ at, value }]);
    const oldOrder = before.filter((item) => retained.has(item.id)).map((item) => item.id);
    const newOrder = after.filter((item) => original.has(item.id)).map((item) => item.id);
    const reordered = JSON.stringify(oldOrder) !== JSON.stringify(newOrder);
    if (remove.length || replace.length || insert.length || reordered)
      collections[key] = { remove, replace, insert, ...(reordered ? { order: after.map((item) => item.id) } : {}) };
  }
  return { metadata: documentMetadata(next), collections };
}

export function applyDocumentPatch(previous: WorkspaceData, input: unknown): WorkspaceData {
  const patch = documentPatchSchema.parse(input);
  if (patch.metadata.workspaceId !== previous.workspaceId) throw new Error('Le document appartient à un autre espace.');
  const next: Record<string, unknown> = { ...previous, ...patch.metadata };
  for (const key of syncCollections) {
    const change = patch.collections[key];
    if (!change) continue;
    const removed = new Set(change.remove);
    const replacements = new Map(change.replace.map((item) => [item.id, item]));
    let items = (previous[key] as RecordData[]).filter((item) => !removed.has(item.id)).map((item) => replacements.get(item.id) || item);
    for (const entry of [...change.insert].sort((a, b) => a.at - b.at)) items.splice(entry.at, 0, entry.value);
    if (change.order) {
      const values = new Map(items.map((item) => [item.id, item]));
      if (change.order.length !== items.length || new Set(change.order).size !== items.length || change.order.some((key) => !values.has(key)))
        throw new Error('L’ordre des éléments de synchronisation est invalide.');
      items = change.order.map((key) => values.get(key)!);
    }
    next[key] = items;
  }
  return workspaceDataSchema.parse(next);
}

export function snapshotPage(data: WorkspaceData, cursor = 0, maxBytes = 450_000) {
  const total = syncCollections.reduce((count, key) => count + data[key].length, 0);
  if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > total) throw new Error('Page de synchronisation invalide.');
  const entries: { collection: Collection; value: RecordData }[] = [];
  let position = 0, bytes = 0;
  outer: for (const collection of syncCollections) {
    for (const value of data[collection] as RecordData[]) {
      if (position++ < cursor) continue;
      const size = new TextEncoder().encode(JSON.stringify(value)).length + 64;
      // A single entity stays whole, even when a long note exceeds the page target.
      if (entries.length && (bytes + size > maxBytes || entries.length >= 250)) break outer;
      entries.push({ collection, value });
      bytes += size;
    }
  }
  const end = cursor + entries.length;
  return { metadata: cursor === 0 ? documentMetadata(data) : undefined, entries, cursor, nextCursor: end < total ? end : null, total };
}

export async function fetchWorkspaceSnapshot(workspaceId: string, fetcher: typeof fetch = fetch) {
  for (let attempt = 0; attempt < 3; attempt++) {
    let cursor = 0, version: number | undefined, expectedTotal: number | undefined;
    let result: Record<string, unknown> = Object.fromEntries(syncCollections.map((key) => [key, []]));
    while (true) {
      const query = new URLSearchParams({ workspaceId, transfer: 'paged', cursor: String(cursor) });
      if (version !== undefined) query.set('version', String(version));
      const response = await fetcher(`/api/sync?${query}`, { cache: 'no-store', headers: { 'X-Folia-Document-Version': '2' } });
      const body = await response.json();
      if (response.status === 409) break;
      if (!response.ok) throw new Error(body.error || 'Impossible de charger cet espace.');
      // A previous server release may still return a complete snapshot during rollout.
      if (body.data) {
        const data = workspaceDataSchema.parse(body.data);
        if (data.workspaceId !== workspaceId || !Number.isSafeInteger(body.version) || body.version < 0) throw new Error('La réponse de synchronisation est incohérente.');
        return { data, version: body.version as number };
      }
      if (!Number.isSafeInteger(body.version) || body.cursor !== cursor || !Array.isArray(body.entries) || (version !== undefined && version !== body.version))
        throw new Error('La réponse de synchronisation est incohérente.');
      version = body.version;
      if (cursor === 0) { result = { ...result, ...body.metadata }; expectedTotal = body.total; }
      if (body.total !== expectedTotal) throw new Error('Le nombre d’éléments a changé pendant le chargement.');
      for (const entry of body.entries) {
        if (!syncCollections.includes(entry.collection)) throw new Error('Collection de synchronisation inconnue.');
        (result[entry.collection] as unknown[]).push(entry.value);
      }
      const next = cursor + body.entries.length;
      if (body.nextCursor === null) {
        if (next !== expectedTotal) throw new Error('Le chargement de cet espace est incomplet.');
        const data = workspaceDataSchema.parse(result);
        if (data.workspaceId !== workspaceId) throw new Error('Le document appartient à un autre espace.');
        return { data, version: version! };
      }
      if (body.nextCursor !== next || next <= cursor) throw new Error('Page de synchronisation invalide.');
      cursor = next;
    }
  }
  throw new Error('Cet espace change pendant le chargement. Réessayez dans un instant.');
}
