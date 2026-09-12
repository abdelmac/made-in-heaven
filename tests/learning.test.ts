import { describe, expect, it } from 'vitest';
import {
  createDemoData,
  createEmptyData,
  id,
  LOCAL_USER_ID,
  workspaceDataSchema,
  type Flashcard,
  type WorkspaceData,
} from '../src/lib/model';
import {
  completeSubject,
  saveNoteSheet,
  createStudySession,
  revealStudyCard,
  answerStudyCard,
} from '../src/lib/learning';
import {
  addMutationHistory,
  prepareImport,
  previewImport,
  serializeExport,
  resetWorkspace,
} from '../src/lib/persistence';
import { startTimer, completeTimer } from '../src/lib/timer';
import { calculateMetrics } from '../src/lib/calendar';

const stamp = '2026-09-12T09:00:00.000Z';
function withCards(): WorkspaceData {
  const data = createDemoData(new Date(stamp));
  const deck = {
    id: id(),
    workspaceId: data.workspaceId,
    userId: LOCAL_USER_ID,
    title: 'Cell biology',
    description: 'Remember the essentials.',
    subjectId: data.subjects[0].id,
    createdAt: stamp,
    updatedAt: stamp,
  };
  data.flashcardDecks.push(deck);
  data.flashcards.push(
    ...['What makes ATP?', 'What stores DNA?'].map((front) => ({
      id: id(),
      workspaceId: data.workspaceId,
      userId: LOCAL_USER_ID,
      deckId: deck.id,
      front,
      back: 'A specific cell structure.',
      createdAt: stamp,
      updatedAt: stamp,
    })),
  );
  return data;
}
describe('learning workspace validation and compatibility', () => {
  it('loads existing exports without learning arrays and keeps strict unknown-field checks', () => {
    const old = JSON.parse(JSON.stringify(createEmptyData()));
    delete old.noteSheets;
    delete old.flashcardDecks;
    delete old.flashcards;
    expect(workspaceDataSchema.parse(old)).toMatchObject({
      noteSheets: [],
      flashcardDecks: [],
      flashcards: [],
    });
    expect(() => workspaceDataSchema.parse({ ...old, subscription: 'pro' })).toThrow();
  });
  it('rejects orphaned cards, cross-workspace notes, duplicate cards, and invalid completion notes', () => {
    const data = withCards();
    expect(() => workspaceDataSchema.parse({ ...data, flashcardDecks: [] })).toThrow(/deck/);
    expect(() =>
      workspaceDataSchema.parse({ ...data, flashcards: [{ ...data.flashcards[0], userId: id() }] }),
    ).toThrow(/author/);
    expect(() =>
      workspaceDataSchema.parse({ ...data, flashcards: [...data.flashcards, data.flashcards[0]] }),
    ).toThrow(/Duplicate/);
    saveNoteSheet(data, { title: 'Note', content: 'Content', kind: 'note' }, LOCAL_USER_ID, stamp);
    expect(() =>
      workspaceDataSchema.parse({
        ...data,
        noteSheets: [{ ...data.noteSheets[0], workspaceId: id() }],
      }),
    ).toThrow(/workspace/);
    expect(() =>
      workspaceDataSchema.parse({
        ...data,
        noteSheets: [{ ...data.noteSheets[0], kind: 'subject_completion' }],
      }),
    ).toThrow(/subject/);
  });
  it('only links reflections to the author’s completed focus and matching subject', () => {
    let data = createDemoData(new Date(stamp));
    data = completeTimer(
      startTimer(data, { subjectId: data.subjects[0].id }, LOCAL_USER_ID, Date.parse(stamp)),
      Date.parse(stamp) + 25 * 60000,
    );
    saveNoteSheet(
      data,
      {
        title: 'Reflection',
        content: 'I understand the main idea.',
        kind: 'session_reflection',
        subjectId: data.subjects[0].id,
        sessionId: data.focusSessions[0].id,
      },
      LOCAL_USER_ID,
      stamp,
    );
    expect(workspaceDataSchema.safeParse(data).success).toBe(true);
    expect(() =>
      workspaceDataSchema.parse({ ...data, noteSheets: [{ ...data.noteSheets[0], userId: id() }] }),
    ).toThrow(/author/);
    expect(() =>
      workspaceDataSchema.parse({
        ...data,
        noteSheets: [{ ...data.noteSheets[0], subjectId: data.subjects[1].id }],
      }),
    ).toThrow(/matching/);
    expect(() =>
      workspaceDataSchema.parse({
        ...data,
        focusSessions: [{ ...data.focusSessions[0], status: 'interrupted' }],
      }),
    ).toThrow(/completed/);
  });
  it('remaps all imported learning identities, links, authors, and revisions without losing current records', () => {
    const source = withCards();
    saveNoteSheet(
      source,
      { title: 'Important', content: 'An idea.', kind: 'note', subjectId: source.subjects[0].id },
      LOCAL_USER_ID,
      stamp,
    );
    const current = createEmptyData(id());
    const actor = id();
    saveNoteSheet(
      current,
      { title: 'Keep me', content: 'Existing note.', kind: 'note' },
      actor,
      stamp,
    );
    const preview = previewImport(serializeExport(source));
    expect(preview).toMatchObject({ noteSheets: 1, flashcardDecks: 1, flashcards: 2 });
    const imported = prepareImport(preview, current, actor);
    expect(imported.noteSheets[0].title).toBe('Keep me');
    expect(imported.noteSheets[1].subjectId).toBe(imported.subjects[0].id);
    expect(imported.flashcardDecks[0].subjectId).toBe(imported.subjects[0].id);
    expect(
      imported.flashcards.every(
        (card) =>
          card.deckId === imported.flashcardDecks[0].id &&
          card.userId === actor &&
          card.workspaceId === current.workspaceId,
      ),
    ).toBe(true);
    expect(imported.flashcards[0].id).not.toBe(source.flashcards[0].id);
    expect(resetWorkspace(imported)).toMatchObject({
      noteSheets: [],
      flashcardDecks: [],
      flashcards: [],
    });
  });
});
describe('subject completion and notes', () => {
  it('completes once with an optional persistent summary while leaving tasks and focus metrics unchanged', () => {
    const data = createDemoData(new Date(stamp));
    const before = structuredClone(data);
    expect(
      completeSubject(data, data.subjects[0].id, LOCAL_USER_ID, 'I can now explain it.', stamp),
    ).toBe(true);
    expect(completeSubject(data, data.subjects[0].id, LOCAL_USER_ID, 'Duplicate', stamp)).toBe(
      false,
    );
    expect(data.noteSheets).toHaveLength(1);
    expect(data.tasks).toEqual(before.tasks);
    expect(data.focusSessions).toEqual(before.focusSessions);
    expect(calculateMetrics(data, Date.parse(stamp)).totalCount).toBe(0);
    const recorded = addMutationHistory(before, data, LOCAL_USER_ID, stamp);
    expect(recorded.events.map((event) => event.type)).toEqual(
      expect.arrayContaining(['subject_completed', 'note_created']),
    );
    delete data.subjects[0].completedAt;
    expect(data.noteSheets[0].content).toBe('I can now explain it.');
  });
  it('preserves note author, creation time, and one revision per meaningful edit', () => {
    const data = createEmptyData();
    const first = saveNoteSheet(
      data,
      { title: 'Original', content: 'First thought.', kind: 'note' },
      LOCAL_USER_ID,
      stamp,
    );
    const before = structuredClone(data);
    const next = saveNoteSheet(
      data,
      { id: first.id, title: 'Revised', content: 'A clearer thought.', kind: 'note' },
      LOCAL_USER_ID,
      '2026-09-12T10:00:00.000Z',
    );
    expect(next.createdAt).toBe(stamp);
    expect(next.revisions).toEqual([
      { title: 'Original', content: 'First thought.', editedAt: '2026-09-12T10:00:00.000Z' },
    ]);
    expect(addMutationHistory(before, data, LOCAL_USER_ID).noteSheets[0].revisions).toHaveLength(1);
    expect(() =>
      saveNoteSheet(
        data,
        { id: first.id, title: 'Attack', content: 'Changed', kind: 'note' },
        id(),
      ),
    ).toThrow(/author/);
    expect(data.noteSheets[0].title).toBe('Revised');
  });
});
describe('transient flashcard study', () => {
  it('requires revealing before grading, counts each card once, and snapshots content', () => {
    const data = withCards();
    const original = structuredClone(data);
    let study = createStudySession(data.flashcards);
    expect(() => answerStudyCard(study, 'known')).toThrow(/Reveal/);
    data.flashcards[0].back = 'Edited elsewhere';
    expect(study.cards[0].back).toBe(original.flashcards[0].back);
    study = answerStudyCard(revealStudyCard(study), 'again');
    study = answerStudyCard(revealStudyCard(study), 'known');
    expect(study.index).toBe(2);
    expect(study.again).toEqual([original.flashcards[0].id]);
    expect(study.known).toEqual([original.flashcards[1].id]);
    expect(answerStudyCard(study, 'known')).toBe(study);
    expect(original.focusSessions).toHaveLength(0);
    expect(() => createStudySession([])).toThrow();
    expect(() =>
      createStudySession([original.flashcards[0], original.flashcards[0]] as Flashcard[]),
    ).toThrow(/unique/);
  });
});
