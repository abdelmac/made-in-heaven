import { id, noteSheetSchema, type Flashcard, type NoteSheet, type WorkspaceData } from './model';

export function saveNoteSheet(
  data: WorkspaceData,
  input: Pick<NoteSheet, 'title' | 'content' | 'kind'> &
    Partial<Pick<NoteSheet, 'id' | 'subjectId' | 'sessionId'>>,
  userId: string,
  now = new Date().toISOString(),
) {
  const previous = input.id ? data.noteSheets.find((note) => note.id === input.id) : undefined;
  if (input.id && !previous) throw new Error('This note no longer exists.');
  if (previous && previous.userId !== userId)
    throw new Error('Only the author can edit this note.');
  const changed =
    previous &&
    (previous.title !== input.title.trim() || previous.content !== input.content.trim());
  const note = noteSheetSchema.parse({
    ...input,
    id: previous?.id || id(),
    workspaceId: data.workspaceId,
    userId,
    createdAt: previous?.createdAt || now,
    updatedAt: now,
    revisions: previous
      ? [
          ...previous.revisions,
          ...(changed ? [{ title: previous.title, content: previous.content, editedAt: now }] : []),
        ]
      : [],
  });
  if (previous)
    data.noteSheets = data.noteSheets.map((item) => (item.id === note.id ? note : item));
  else data.noteSheets.unshift(note);
  return note;
}

export function completeSubject(
  data: WorkspaceData,
  subjectId: string,
  userId: string,
  summary = '',
  now = new Date().toISOString(),
) {
  const subject = data.subjects.find((item) => item.id === subjectId);
  if (!subject) throw new Error('This subject no longer exists.');
  if (subject.completedAt) return false;
  if (summary.trim())
    saveNoteSheet(
      data,
      {
        title: `Bilan : ${subject.name}`,
        content: summary,
        kind: 'subject_completion',
        subjectId,
      },
      userId,
      now,
    );
  subject.completedAt = now;
  subject.updatedAt = now;
  return true;
}

export type StudySession = {
  cards: Flashcard[];
  index: number;
  revealed: boolean;
  known: string[];
  again: string[];
};
export function createStudySession(cards: Flashcard[]): StudySession {
  if (!cards.length) throw new Error('Add a card before starting a study session.');
  if (new Set(cards.map((card) => card.id)).size !== cards.length)
    throw new Error('Study cards must be unique.');
  return { cards: structuredClone(cards), index: 0, revealed: false, known: [], again: [] };
}
export function revealStudyCard(session: StudySession): StudySession {
  return session.index < session.cards.length
    ? { ...session, revealed: !session.revealed }
    : session;
}
export function answerStudyCard(session: StudySession, answer: 'again' | 'known'): StudySession {
  const card = session.cards[session.index];
  if (!card) return session;
  if (!session.revealed) throw new Error('Reveal the answer before rating this card.');
  return {
    ...session,
    index: session.index + 1,
    revealed: false,
    [answer]: [...session[answer], card.id],
  };
}
