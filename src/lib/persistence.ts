import { z } from 'zod';
import { en } from './i18n/en';
import { eventLabel } from './i18n/dynamic';
import {
  emptyTimer,
  id,
  LOCAL_USER_ID,
  workspaceDataSchema,
  type ActivityEvent,
  type WorkspaceData,
} from './model';

export const STORAGE_PREFIX = 'folia:v1:';
export type PendingMetadata = {
  expectedVersion: number;
  createdAt: string;
  kind?: 'document' | 'preferences';
};
export type LocalEnvelope = {
  version: number;
  operationId: string;
  data: WorkspaceData;
  pending?: PendingMetadata;
};
const envelopeSchema = z
  .object({
    version: z.number().int().min(0),
    operationId: z.string().uuid(),
    data: workspaceDataSchema,
    pending: z
      .object({
        expectedVersion: z.number().int().min(0),
        createdAt: z.string().datetime(),
        kind: z.enum(['document', 'preferences']).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export class ConflictError extends Error {
  constructor(public current: LocalEnvelope) {
    super('This workspace changed in another tab. Review the saved version before continuing.');
    this.name = 'ConflictError';
  }
}
export function storageKey(workspaceId: string, accountId?: string) {
  return `${STORAGE_PREFIX}${accountId ? `account:${accountId}` : 'local'}:${workspaceId}`;
}
export function loadLocal(
  key: string,
  storage: Pick<Storage, 'getItem'> = localStorage,
): LocalEnvelope | null {
  const raw = storage.getItem(key);
  return raw ? envelopeSchema.parse(JSON.parse(raw)) : null;
}
export function saveLocal(
  key: string,
  data: WorkspaceData,
  expectedVersion: number,
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
  operationId = id(),
  pending?: PendingMetadata,
): LocalEnvelope {
  const current = loadLocal(key, storage);
  if (current && current.operationId === operationId) return current;
  if ((current?.version ?? 0) !== expectedVersion) throw new ConflictError(current!);
  const envelope = {
    version: expectedVersion + 1,
    operationId,
    data: workspaceDataSchema.parse(data),
    ...(pending ? { pending } : {}),
  };
  storage.setItem(key, JSON.stringify(envelope));
  return envelope;
}
export async function withWorkspaceLock<T>(key: string, work: () => T | Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks)
    return navigator.locks.request(key, work);
  return work();
}
export function findActiveTimerConflict(data: WorkspaceData, otherWorkspaces: WorkspaceData[]) {
  const timer = data.timer;
  if (timer.status === 'idle' || !timer.context) return undefined;
  return otherWorkspaces.find(
    (other) =>
      other.workspaceId !== data.workspaceId &&
      other.timer.status !== 'idle' &&
      other.timer.context?.userId === timer.context?.userId,
  );
}
const exportSchema = z
  .object({
    format: z.literal('folia-productivity'),
    schemaVersion: z.literal(1),
    exportedAt: z.string().datetime(),
    data: workspaceDataSchema,
  })
  .strict();
export function serializeExport(data: WorkspaceData): string {
  return JSON.stringify(
    { format: 'folia-productivity', schemaVersion: 1, exportedAt: new Date().toISOString(), data },
    null,
    2,
  );
}
export type ImportPreview = {
  data: WorkspaceData;
  subjects: number;
  projects: number;
  tasks: number;
  plannedSessions: number;
  focusSessions: number;
  journalEntries: number;
  noteSheets: number;
  flashcardDecks: number;
  flashcards: number;
  warning: string;
};
export function previewImport(raw: string): ImportPreview {
  if (raw.length > 25 * 1024 * 1024) throw new Error('The import exceeds the 25 MB size limit.');
  const parsed = exportSchema.parse(JSON.parse(raw));
  const data = parsed.data;
  return {
    data,
    subjects: data.subjects.length,
    projects: data.projects.length,
    tasks: data.tasks.length,
    plannedSessions: data.plannedSessions.length,
    focusSessions: data.focusSessions.length,
    journalEntries: data.journal.length,
    noteSheets: data.noteSheets.length,
    flashcardDecks: data.flashcardDecks.length,
    flashcards: data.flashcards.length,
    warning:
      'This adds the imported productivity records to this workspace. Roles, memberships and billing are never imported. Active timers are not resumed.',
  };
}
export function prepareImport(
  preview: ImportPreview,
  current: WorkspaceData,
  userId = LOCAL_USER_ID,
): WorkspaceData {
  const source = structuredClone(preview.data);
  const replacements = new Map<string, string>();
  for (const list of [
    source.subjects,
    source.projects,
    source.tasks,
    source.plannedSessions,
    source.focusSessions,
    source.journal,
    source.noteSheets,
    source.flashcardDecks,
    source.flashcards,
    source.events,
  ])
    for (const record of list) replacements.set(record.id, id());
  const remap = (value: string | undefined) =>
    value ? replacements.get(value) || value : undefined;
  const rebind = <T extends { id: string; workspaceId: string }>(record: T) => ({
    ...record,
    id: replacements.get(record.id)!,
    workspaceId: current.workspaceId,
  });
  const subjects = source.subjects.map((record) => ({
    ...rebind(record),
    defaultPresetId: undefined,
    resources: record.resources.map((resource) => ({ ...resource, id: id() })),
    order: current.subjects.length + record.order,
  }));
  const projects = source.projects.map((record) => ({
    ...rebind(record),
    subjectId: remap(record.subjectId),
  }));
  const tasks = source.tasks.map((record) => ({
    ...rebind(record),
    subjectId: remap(record.subjectId),
    projectId: remap(record.projectId),
    assigneeId: record.assigneeId ? userId : undefined,
    checklist: record.checklist.map((item) => ({ ...item, id: id() })),
    resources: record.resources.map((resource) => ({ ...resource, id: id() })),
  }));
  const plannedSessions = source.plannedSessions.map((record) => ({
    ...rebind(record),
    userId,
    subjectId: remap(record.subjectId),
    projectId: remap(record.projectId),
    taskId: remap(record.taskId),
  }));
  const focusSessions = source.focusSessions.map((record) => ({
    ...rebind(record),
    userId,
    context: {
      ...record.context,
      workspaceId: current.workspaceId,
      userId,
      subjectId: remap(record.context.subjectId),
      projectId: remap(record.context.projectId),
      taskId: remap(record.context.taskId),
      plannedSessionId: remap(record.context.plannedSessionId),
    },
  }));
  const journal = source.journal.map((record) => ({
    ...rebind(record),
    userId,
    subjectId: remap(record.subjectId),
    taskId: remap(record.taskId)!,
    sessionId: remap(record.sessionId),
  }));
  const events = source.events.map((record) => ({
    ...rebind(record),
    userId,
    subjectId: remap(record.subjectId),
    projectId: remap(record.projectId),
    taskId: remap(record.taskId),
  }));
  const noteSheets = source.noteSheets.map((record) => ({
    ...rebind(record),
    userId,
    subjectId: remap(record.subjectId),
    sessionId: remap(record.sessionId),
  }));
  const flashcardDecks = source.flashcardDecks.map((record) => ({
    ...rebind(record),
    userId,
    subjectId: remap(record.subjectId),
  }));
  const flashcards = source.flashcards.map((record) => ({
    ...rebind(record),
    userId,
    deckId: remap(record.deckId)!,
  }));
  return workspaceDataSchema.parse({
    ...current,
    subjects: [...current.subjects, ...subjects],
    projects: [...current.projects, ...projects],
    tasks: [...current.tasks, ...tasks],
    plannedSessions: [...current.plannedSessions, ...plannedSessions],
    focusSessions: [...current.focusSessions, ...focusSessions],
    journal: [...current.journal, ...journal],
    noteSheets: [...current.noteSheets, ...noteSheets],
    flashcardDecks: [...current.flashcardDecks, ...flashcardDecks],
    flashcards: [...current.flashcards, ...flashcards],
    events: [...current.events, ...events],
  });
}
export function clearAccountCache(accountId: string, storage: Storage = localStorage) {
  const prefix = `${STORAGE_PREFIX}account:${accountId}:`;
  for (let index = storage.length - 1; index >= 0; index--) {
    const key = storage.key(index);
    if (key?.startsWith(prefix)) storage.removeItem(key);
  }
  storage.removeItem(`${STORAGE_PREFIX}active:${accountId}`);
}
export type PendingOperation = {
  kind?: 'document' | 'preferences';
  id: string;
  workspaceId: string;
  expectedVersion: number;
  createdAt: string;
  data: WorkspaceData;
};
export function pendingKey(accountId: string, workspaceId: string) {
  return `${storageKey(workspaceId, accountId)}:pending`;
}
export function readPending(
  accountId: string,
  workspaceId: string,
  storage: Pick<Storage, 'getItem'> = localStorage,
): PendingOperation | null {
  const envelope = loadLocal(storageKey(workspaceId, accountId), storage);
  if (envelope?.pending)
    return { id: envelope.operationId, workspaceId, ...envelope.pending, data: envelope.data };
  // Read the initial v1 separate outbox format without discarding pending work.
  const raw = storage.getItem(pendingKey(accountId, workspaceId));
  if (!raw) return null;
  const schema = z
    .object({
      kind: z.enum(['document', 'preferences']).optional(),
      id: z.string().uuid(),
      workspaceId: z.string().uuid(),
      expectedVersion: z.number().int().min(0),
      createdAt: z.string().datetime(),
      data: workspaceDataSchema,
    })
    .strict();
  return schema.parse(JSON.parse(raw));
}
export function isPreferencesOnlyChange(before: WorkspaceData, next: WorkspaceData) {
  return (
    JSON.stringify({ ...before, preferences: undefined }) ===
    JSON.stringify({ ...next, preferences: undefined })
  );
}
export function acknowledgePending(
  accountId: string,
  workspaceId: string,
  operationId: string,
  serverVersion: number,
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = localStorage,
) {
  const key = storageKey(workspaceId, accountId);
  const envelope = loadLocal(key, storage);
  if (envelope?.pending) {
    const next = {
      ...envelope,
      pending:
        envelope.operationId === operationId
          ? undefined
          : {
              ...envelope.pending,
              expectedVersion: Math.max(envelope.pending.expectedVersion, serverVersion),
            },
    };
    storage.setItem(key, JSON.stringify(next));
    storage.removeItem(pendingKey(accountId, workspaceId));
  } else {
    const old = readPending(accountId, workspaceId, storage);
    if (old?.id === operationId) storage.removeItem(pendingKey(accountId, workspaceId));
    else if (old)
      storage.setItem(
        pendingKey(accountId, workspaceId),
        JSON.stringify({ ...old, expectedVersion: serverVersion }),
      );
  }
}
export function addMutationHistory(
  before: WorkspaceData,
  after: WorkspaceData,
  userId: string,
  now = new Date().toISOString(),
): WorkspaceData {
  const events: ActivityEvent[] = [];
  const previousEvents = new Set(before.events.map((item) => item.id));
  const explicitEvents = after.events.filter((item) => !previousEvents.has(item.id));
  const event = (
    type: ActivityEvent['type'],
    details: string,
    subjectId?: string,
    taskId?: string,
    taskTitle?: string,
    projectId?: string,
  ) => {
    if (
      !explicitEvents.some(
        (item) => item.type === type && item.subjectId === subjectId && item.taskId === taskId,
      )
    )
      events.push({
        id: id(),
        workspaceId: after.workspaceId,
        userId,
        timestamp: now,
        type,
        details,
        subjectId,
        subjectName:
          after.subjects.find((subject) => subject.id === subjectId)?.name ||
          before.subjects.find((subject) => subject.id === subjectId)?.name,
        taskId,
        taskTitle,
        projectId,
      });
  };
  for (const subject of after.subjects) {
    const old = before.subjects.find((item) => item.id === subject.id);
    if (!old)
      event('subject_created', `${eventLabel('subject_created')} : ${subject.name}.`, subject.id);
    else if (old.completedAt !== subject.completedAt)
      event(
        subject.completedAt ? 'subject_completed' : 'subject_reopened',
        `${eventLabel(subject.completedAt ? 'subject_completed' : 'subject_reopened')} : ${subject.name}.`,
        subject.id,
      );
    else if (old.archived !== subject.archived)
      event(
        subject.archived ? 'subject_archived' : 'subject_restored',
        `${eventLabel(subject.archived ? 'subject_archived' : 'subject_restored')} : ${subject.name}.`,
        subject.id,
      );
    else if (JSON.stringify(old) !== JSON.stringify(subject))
      event('subject_updated', `${eventLabel('subject_updated')} : ${subject.name}.`, subject.id);
  }
  for (const task of after.tasks) {
    const old = before.tasks.find((item) => item.id === task.id);
    if (!old)
      event(
        'task_created',
        `${eventLabel('task_created')} : ${task.title}.`,
        task.subjectId,
        task.id,
        task.title,
        task.projectId,
      );
    else if (old.status !== task.status)
      event(
        task.status === 'done' ? 'task_completed' : 'status_changed',
        `${en.statuses[old.status]} → ${en.statuses[task.status]}.`,
        task.subjectId,
        task.id,
        task.title,
        task.projectId,
      );
    else if (JSON.stringify(old) !== JSON.stringify(task))
      event(
        'task_updated',
        `${eventLabel('task_updated')} : ${task.title}.`,
        task.subjectId,
        task.id,
        task.title,
        task.projectId,
      );
  }
  for (const task of before.tasks)
    if (!after.tasks.some((item) => item.id === task.id))
      event(
        'task_deleted',
        `${eventLabel('task_deleted')} : ${task.title}. Historique des séances conservé.`,
        task.subjectId,
        task.id,
        task.title,
        task.projectId,
      );
  for (const note of after.journal) {
    const old = before.journal.find((item) => item.id === note.id);
    if (!old || old.content !== note.content) {
      const task = after.tasks.find((item) => item.id === note.taskId);
      event(
        old ? 'journal_edited' : 'journal_added',
        `${eventLabel(old ? 'journal_edited' : 'journal_added')} (${({ progress: 'avancement', decision: 'décision', blocker: 'blocage', next_steps: 'prochaines étapes', reflection: 'bilan' } as const)[note.kind]}).`,
        task?.subjectId,
        note.taskId,
        task?.title,
        task?.projectId,
      );
      if (old && note.revisions.length <= old.revisions.length)
        note.revisions = [...old.revisions, { content: old.content, editedAt: old.updatedAt }];
    }
  }
  for (const plan of after.plannedSessions) {
    const old = before.plannedSessions.find((item) => item.id === plan.id);
    if (!old || JSON.stringify(old) !== JSON.stringify(plan))
      event(
        old ? 'plan_updated' : 'plan_created',
        `${eventLabel(old ? 'plan_updated' : 'plan_created')} : ${plan.title} · ${plan.durationMinutes} minutes.`,
        plan.subjectId,
        plan.taskId,
        after.tasks.find((task) => task.id === plan.taskId)?.title,
        plan.projectId,
      );
  }
  for (const note of after.noteSheets) {
    const old = before.noteSheets.find((item) => item.id === note.id);
    if (!old || JSON.stringify(old) !== JSON.stringify(note)) {
      event(
        old ? 'note_updated' : 'note_created',
        `${eventLabel(old ? 'note_updated' : 'note_created')} : ${note.title}.`,
        note.subjectId,
      );
      if (
        old &&
        (old.title !== note.title || old.content !== note.content) &&
        note.revisions.length <= old.revisions.length
      )
        note.revisions = [
          ...old.revisions,
          { title: old.title, content: old.content, editedAt: now },
        ];
    }
  }
  for (const note of before.noteSheets)
    if (!after.noteSheets.some((item) => item.id === note.id))
      event('note_deleted', `${eventLabel('note_deleted')} : ${note.title}.`, note.subjectId);
  for (const deck of after.flashcardDecks) {
    const old = before.flashcardDecks.find((item) => item.id === deck.id);
    if (!old || JSON.stringify(old) !== JSON.stringify(deck))
      event(
        old ? 'flashcard_deck_updated' : 'flashcard_deck_created',
        `${eventLabel(old ? 'flashcard_deck_updated' : 'flashcard_deck_created')} : ${deck.title}.`,
        deck.subjectId,
      );
  }
  for (const deck of before.flashcardDecks)
    if (!after.flashcardDecks.some((item) => item.id === deck.id))
      event(
        'flashcard_deck_deleted',
        `${eventLabel('flashcard_deck_deleted')} : ${deck.title}.`,
        deck.subjectId,
      );
  for (const card of after.flashcards) {
    const old = before.flashcards.find((item) => item.id === card.id);
    if (!old || JSON.stringify(old) !== JSON.stringify(card))
      event(
        old ? 'flashcard_updated' : 'flashcard_created',
        `${eventLabel(old ? 'flashcard_updated' : 'flashcard_created')}.`,
        after.flashcardDecks.find((deck) => deck.id === card.deckId)?.subjectId,
      );
  }
  for (const card of before.flashcards)
    if (!after.flashcards.some((item) => item.id === card.id))
      event(
        'flashcard_deleted',
        `${eventLabel('flashcard_deleted')}.`,
        before.flashcardDecks.find((deck) => deck.id === card.deckId)?.subjectId,
      );
  for (const plan of before.plannedSessions)
    if (!after.plannedSessions.some((item) => item.id === plan.id))
      event(
        'plan_deleted',
        `${eventLabel('plan_deleted')} : ${plan.title}.`,
        plan.subjectId,
        plan.taskId,
      );
  return { ...after, events: [...after.events, ...events] };
}
export function resetWorkspace(data: WorkspaceData): WorkspaceData {
  return {
    ...data,
    timer: emptyTimer(data.preferences),
    subjects: [],
    projects: [],
    tasks: [],
    plannedSessions: [],
    focusSessions: [],
    journal: [],
    noteSheets: [],
    flashcardDecks: [],
    flashcards: [],
    events: [],
  };
}
