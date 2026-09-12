import type { WorkspaceData } from '@/lib/model';
import { isDeepStrictEqual } from 'node:util';
import { HttpError } from './http';

const same = (a: unknown, b: unknown) =>
  isDeepStrictEqual(JSON.parse(JSON.stringify(a ?? null)), JSON.parse(JSON.stringify(b ?? null)));

/** Application validation supplements SQL constraints; IDs never confer authorization. */
export function validateDocumentChange(
  previous: WorkspaceData | null,
  next: WorkspaceData,
  actorId: string,
  members: Set<string>,
) {
  for (const session of next.focusSessions) {
    const old = previous?.focusSessions.find((item) => item.id === session.id);
    if (old && !same(old, session))
      throw new HttpError(409, 'Saved focus history cannot be rewritten.');
    if (!old && session.userId !== actorId)
      throw new HttpError(403, 'You can only record your own focus sessions.');
    if (
      previous?.timer.sessionId === session.id &&
      (!same(previous.timer.context, session.context) ||
        previous.timer.durationMs !== session.durationMinutes * 60000 ||
        previous.timer.startedAt !== session.startedAt ||
        previous.timer.phase !== session.phase)
    )
      throw new HttpError(409, 'Completed sessions must retain the original timer context.');
    if (Date.parse(session.endedAt) < Date.parse(session.startedAt))
      throw new HttpError(400, 'A session cannot end before it starts.');
  }
  for (const session of previous?.focusSessions || [])
    if (!next.focusSessions.some((item) => item.id === session.id))
      throw new HttpError(409, 'Saved focus history must be preserved.');
  for (const event of next.events) {
    const old = previous?.events.find((item) => item.id === event.id);
    if (old && !same(old, event))
      throw new HttpError(409, 'Saved activity history cannot be rewritten.');
    if (!old && event.userId !== actorId)
      throw new HttpError(403, 'You can only record activity as yourself.');
  }
  for (const event of previous?.events || [])
    if (!next.events.some((item) => item.id === event.id))
      throw new HttpError(409, 'Saved activity history must be preserved.');
  for (const plan of next.plannedSessions) {
    const old = previous?.plannedSessions.find((item) => item.id === plan.id);
    if (!same(old, plan) && plan.userId !== actorId)
      throw new HttpError(403, 'You can only change your own planned sessions.');
    if (old && old.userId !== plan.userId)
      throw new HttpError(403, 'A planned session cannot be transferred to another person.');
    if (!members.has(plan.userId) && !old)
      throw new HttpError(400, 'A planned session must belong to a workspace member.');
    if (
      plan.completed &&
      !old?.completed &&
      !next.focusSessions.some(
        (session) =>
          session.phase === 'focus' &&
          session.status === 'completed' &&
          session.userId === plan.userId &&
          session.context.plannedSessionId === plan.id,
      )
    )
      throw new HttpError(
        400,
        'A planned session is completed only after its focus session finishes.',
      );
    if (
      (!old || old.subjectId !== plan.subjectId) &&
      next.subjects.find((subject) => subject.id === plan.subjectId)?.archived
    )
      throw new HttpError(400, 'Restore this subject before planning new work.');
  }
  for (const plan of previous?.plannedSessions || [])
    if (plan.userId !== actorId && !next.plannedSessions.some((item) => item.id === plan.id))
      throw new HttpError(403, "You cannot delete another member's planned sessions.");
  for (const task of next.tasks)
    if (
      task.assigneeId &&
      !members.has(task.assigneeId) &&
      previous?.tasks.find((item) => item.id === task.id)?.assigneeId !== task.assigneeId
    )
      throw new HttpError(400, 'Assign tasks to a current workspace member.');
  for (const note of next.journal) {
    const old = previous?.journal.find((item) => item.id === note.id);
    if (!same(old, note) && note.userId !== actorId)
      throw new HttpError(403, 'You can only edit your own journal entries.');
    if (old && old.userId !== note.userId)
      throw new HttpError(403, 'A journal author cannot be changed.');
    if (
      old &&
      old.content !== note.content &&
      (note.revisions.length !== old.revisions.length + 1 ||
        !same(note.revisions.slice(0, -1), old.revisions) ||
        note.revisions.at(-1)?.content !== old.content)
    )
      throw new HttpError(400, 'Keep the previous journal content in its revision history.');
    if (old && old.content === note.content && !same(old.revisions, note.revisions))
      throw new HttpError(400, 'Journal revisions cannot be rewritten.');
  }
  for (const note of previous?.journal || [])
    if (note.userId !== actorId && !next.journal.some((item) => item.id === note.id))
      throw new HttpError(403, "You cannot delete another member's journal entries.");
  for (const collection of ['noteSheets', 'flashcardDecks', 'flashcards'] as const) {
    for (const item of next[collection]) {
      const prior = previous?.[collection].find((saved) => saved.id === item.id);
      if (prior && (prior.userId !== item.userId || prior.createdAt !== item.createdAt))
        throw new HttpError(
          403,
          'Learning records retain their original author and creation timestamp.',
        );
      if (!same(prior, item) && item.userId !== actorId)
        throw new HttpError(403, 'You can only create or edit your own notes and flashcards.');
    }
    for (const prior of previous?.[collection] || [])
      if (prior.userId !== actorId && !next[collection].some((item) => item.id === prior.id))
        throw new HttpError(403, "You cannot delete another member's notes or flashcards.");
  }
  for (const note of next.noteSheets) {
    const prior = previous?.noteSheets.find((saved) => saved.id === note.id);
    if (prior && (prior.content !== note.content || prior.title !== note.title)) {
      const last = note.revisions.at(-1);
      if (
        note.revisions.length !== prior.revisions.length + 1 ||
        !same(note.revisions.slice(0, -1), prior.revisions) ||
        last?.title !== prior.title ||
        last?.content !== prior.content
      )
        throw new HttpError(400, 'Keep the previous note title and content in revision history.');
    } else if (prior && !same(prior.revisions, note.revisions))
      throw new HttpError(400, 'Note revisions cannot be rewritten.');
  }
  for (const card of next.flashcards)
    if (next.flashcardDecks.find((deck) => deck.id === card.deckId)?.userId !== card.userId)
      throw new HttpError(403, 'A flashcard and its deck must have the same author.');
  const timer = next.timer;
  if (timer.context && timer.context.userId !== actorId)
    throw new HttpError(403, 'An active timer must belong to you.');
  if (timer.status !== 'idle' && timer.sessionId !== previous?.timer.sessionId && timer.context) {
    const context = timer.context;
    const subject = next.subjects.find((item) => item.id === context.subjectId);
    const project = next.projects.find((item) => item.id === context.projectId);
    const task = next.tasks.find((item) => item.id === context.taskId);
    if (context.subjectId && (!subject || subject.archived))
      throw new HttpError(400, 'Restore this subject before starting new focus.');
    if (
      context.projectId &&
      (!project || project.archived || project.subjectId !== context.subjectId)
    )
      throw new HttpError(400, 'Choose an active project in the selected subject.');
    if (
      context.taskId &&
      (!task || task.subjectId !== context.subjectId || task.projectId !== context.projectId)
    )
      throw new HttpError(400, 'The active task must match the selected subject and project.');
  }
  if (
    previous?.timer.status !== 'idle' &&
    previous?.timer.sessionId &&
    timer.sessionId === previous.timer.sessionId
  ) {
    if (
      !same(previous.timer.context, timer.context) ||
      previous.timer.durationMs !== timer.durationMs ||
      previous.timer.startedAt !== timer.startedAt ||
      previous.timer.phase !== timer.phase
    )
      throw new HttpError(409, "An active session's original context and duration are frozen.");
  }
}
