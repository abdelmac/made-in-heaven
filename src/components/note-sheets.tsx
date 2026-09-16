'use client';
import { useState, type FormEvent } from 'react';
import { Check, FileText, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useApp } from './app-context';
import { Button, Dialog, Empty, Field, Markdown } from './ui';
import { learning as copy } from '@/lib/i18n/learning';
import { localizeError } from '@/lib/i18n/errors';
import { completeSubject, saveNoteSheet } from '@/lib/learning';
import type { NoteSheet } from '@/lib/model';
import { formatDay, formatTime } from '@/lib/display';
import styles from './learning.module.css';

export function NotesPage() {
  return <NotesCollection />;
}
export function SubjectNotes({ subjectId }: { subjectId: string }) {
  return <NotesCollection subjectId={subjectId} />;
}
function NotesCollection({ subjectId }: { subjectId?: string }) {
  const { store, canEdit } = useApp();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ id?: string; sessionId?: string } | null>(null);
  const subject = subjectId || filter;
  const notes = store.data.noteSheets
    .filter(
      (note) =>
        (!subject || note.subjectId === subject) &&
        `${note.title} ${note.content}`.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const selectedNote = store.data.noteSheets.find((note) => note.id === selected);
  const latestSession = subjectId
    ? store.data.focusSessions
        .filter(
          (session) =>
            session.context.subjectId === subjectId &&
            session.userId === store.userId &&
            session.phase === 'focus' &&
            session.status === 'completed',
        )
        .sort((a, b) => b.endedAt.localeCompare(a.endedAt))[0]
    : undefined;
  return (
    <section className={styles.section} aria-label={copy.notes}>
      <div className={styles.toolbar}>
        <input
          aria-label={copy.searchNotes}
          placeholder={copy.searchNotes}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {!subjectId && (
          <select
            aria-label={copy.subject}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="">{copy.allSubjects}</option>
            {store.data.subjects.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        )}
        {latestSession && (
          <Button
            variant="secondary"
            disabled={!canEdit}
            onClick={() => setEditor({ sessionId: latestSession.id })}
          >
            {copy.reflect}
          </Button>
        )}
        <Button disabled={!canEdit} onClick={() => setEditor({})}>
          <Plus size={15} />
          {copy.newNote}
        </Button>
      </div>
      {notes.length ? (
        <div className={styles.grid}>
          {notes.map((note) => (
            <article className={styles.card} key={note.id}>
              <FileText size={19} />
              <div className={styles.meta}>
                <span>
                  {note.kind === 'subject_completion'
                    ? copy.subjectCompletion
                    : note.kind === 'session_reflection'
                      ? copy.sessionReflection
                      : copy.generalNote}
                </span>
                <span>{store.data.subjects.find((item) => item.id === note.subjectId)?.name}</span>
              </div>
              <button className={styles.cardTitle} onClick={() => setSelected(note.id)}>
                {note.title}
              </button>
              <p className={styles.cardPreview}>{note.content}</p>
              <time className={styles.meta}>
                {formatDay(note.updatedAt, store.data.preferences)}
              </time>
            </article>
          ))}
        </div>
      ) : (
        <Empty title={copy.noNotes} detail={copy.noNotesDetail} />
      )}
      {editor && (
        <NoteEditor
          noteId={editor.id}
          subjectId={subjectId || filter || undefined}
          sessionId={editor.sessionId}
          onClose={() => setEditor(null)}
        />
      )}
      {selectedNote && (
        <NoteReader
          note={selectedNote}
          onClose={() => setSelected(null)}
          onEdit={() => {
            setEditor({ id: selectedNote.id });
            setSelected(null);
          }}
        />
      )}
    </section>
  );
}
function NoteReader({
  note,
  onClose,
  onEdit,
}: {
  note: NoteSheet;
  onClose: () => void;
  onEdit: () => void;
}) {
  const { store, canEdit, notify } = useApp();
  const [deleting, setDeleting] = useState(false);
  const owned = canEdit && note.userId === store.userId;
  const session = store.data.focusSessions.find((item) => item.id === note.sessionId);
  return (
    <Dialog wide title={note.title} onClose={onClose}>
      <div className={styles.meta}>
        {store.data.subjects.find((item) => item.id === note.subjectId)?.name}
        <time>{formatDay(note.updatedAt, store.data.preferences)}</time>
      </div>
      {session && (
        <p className="helper">
          {copy.linkedSession}: {formatDay(session.endedAt, store.data.preferences)} ·{' '}
          {formatTime(session.endedAt, store.data.preferences)}
        </p>
      )}
      <div className={styles.noteBody}>
        <Markdown text={note.content} />
      </div>
      {!!note.revisions.length && (
        <details>
          <summary>
            {copy.revisions} ({note.revisions.length})
          </summary>
          {[...note.revisions].reverse().map((revision, index) => (
            <article className={styles.revision} key={`${revision.editedAt}:${index}`}>
              <strong>{revision.title}</strong>
              <time className={styles.meta}>
                {formatDay(revision.editedAt, store.data.preferences)}
              </time>
              <Markdown text={revision.content} />
            </article>
          ))}
        </details>
      )}
      {owned ? (
        <div className="form-actions">
          <Button variant="secondary" onClick={onEdit}>
            <Pencil size={15} />
            {copy.editNote}
          </Button>
          <Button variant="ghost" onClick={() => setDeleting(true)}>
            <Trash2 size={15} />
            {copy.deleteNote}
          </Button>
        </div>
      ) : (
        <p className="helper">{copy.readOnly}</p>
      )}
      {deleting && (
        <Dialog title={copy.deleteNote} onClose={() => setDeleting(false)}>
          <p>{copy.deleteNotePrompt}</p>
          {store.error && (
            <p className="error" role="alert">
              {localizeError(store.error)}
            </p>
          )}
          <div className="form-actions">
            <Button variant="secondary" onClick={() => setDeleting(false)}>
              {copy.cancel}
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                const saved = await store.update((draft) => {
                  const current = draft.noteSheets.find((item) => item.id === note.id);
                  if (current?.userId !== store.userId) throw new Error(copy.readOnly);
                  draft.noteSheets = draft.noteSheets.filter((item) => item.id !== note.id);
                });
                if (saved) {
                  notify(copy.noteDeleted);
                  onClose();
                }
              }}
            >
              {copy.delete}
            </Button>
          </div>
        </Dialog>
      )}
    </Dialog>
  );
}
export function NoteEditor({
  noteId,
  subjectId,
  sessionId,
  onClose,
}: {
  noteId?: string;
  subjectId?: string;
  sessionId?: string;
  onClose: () => void;
}) {
  const { store, canEdit, notify } = useApp();
  const note = store.data.noteSheets.find((item) => item.id === noteId);
  const [subject, setSubject] = useState(note?.subjectId || subjectId || '');
  const [session, setSession] = useState(note?.sessionId || sessionId || '');
  const [content, setContent] = useState(note?.content || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const allowed = canEdit && (!note || note.userId === store.userId);
  const sessions = store.data.focusSessions
    .filter(
      (item) =>
        item.userId === store.userId &&
        item.status === 'completed' &&
        item.phase === 'focus' &&
        (!subject || item.context.subjectId === subject),
    )
    .sort((a, b) => b.endedAt.localeCompare(a.endedAt));
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!allowed || busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const saved = await store.update((draft) => {
        saveNoteSheet(
          draft,
          {
            id: noteId,
            title: String(form.get('title')),
            content,
            subjectId: subject || undefined,
            sessionId: session || undefined,
            kind:
              note?.kind === 'subject_completion'
                ? note.kind
                : session
                  ? 'session_reflection'
                  : 'note',
          },
          store.userId,
        );
      });
      if (saved) {
        notify(copy.noteSaved);
        onClose();
      }
    } catch (cause) {
      setError(localizeError(cause instanceof Error ? cause.message : String(cause)));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog wide title={note ? copy.editNote : copy.newNote} onClose={onClose}>
      <form onSubmit={save}>
        {(error || store.error) && (
          <p className="error" role="alert">
            {error || store.error}
          </p>
        )}
        <Field label={copy.noteTitle}>
          <input
            name="title"
            required
            maxLength={200}
            defaultValue={note?.title || (sessionId ? copy.reflectionTitle : '')}
            data-autofocus
          />
        </Field>
        <div className="form-grid">
          <Field label={copy.subject}>
            <select
              value={subject}
              disabled={note?.kind === 'subject_completion'}
              onChange={(event) => {
                setSubject(event.target.value);
                setSession('');
              }}
            >
              <option value="">{copy.noSubject}</option>
              {store.data.subjects.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={copy.linkedSession}>
            <select
              value={session}
              onChange={(event) => {
                setSession(event.target.value);
                const focus = store.data.focusSessions.find(
                  (item) => item.id === event.target.value,
                );
                if (focus?.context.subjectId) setSubject(focus.context.subjectId);
              }}
            >
              <option value="">{copy.noSession}</option>
              {sessions.map((item) => (
                <option key={item.id} value={item.id}>
                  {formatDay(item.endedAt, store.data.preferences)} ·{' '}
                  {formatTime(item.endedAt, store.data.preferences)} · {item.durationMinutes} min
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label={copy.content}>
          <textarea
            required
            rows={10}
            maxLength={20000}
            placeholder={copy.notePlaceholder}
            value={content}
            onChange={(event) => setContent(event.target.value)}
          />
        </Field>
        <details>
          <summary>{copy.preview}</summary>
          <div className={styles.noteBody}>
            <Markdown text={content} />
          </div>
        </details>
        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            {copy.cancel}
          </Button>
          <Button type="submit" disabled={!allowed || busy}>
            {copy.saveNote}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
export function SubjectCompletion({ subjectId }: { subjectId: string }) {
  const { store, canEdit, notify } = useApp();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const subject = store.data.subjects.find((item) => item.id === subjectId);
  if (!subject) return null;
  return (
    <div className={styles.completion}>
      {subject.completedAt ? (
        <>
          <span className="badge">
            <Check size={13} />
            {copy.completedAt}
          </span>
          <time>{formatDay(subject.completedAt, store.data.preferences)}</time>
          <Button
            variant="ghost"
            disabled={!canEdit}
            onClick={async () => {
              const saved = await store.update((draft) => {
                const current = draft.subjects.find((item) => item.id === subjectId)!;
                delete current.completedAt;
                current.updatedAt = new Date().toISOString();
              });
              if (saved) notify(copy.reopenedNotice);
            }}
          >
            <RotateCcw size={14} />
            {copy.reopenSubject}
          </Button>
        </>
      ) : (
        <Button
          variant="secondary"
          disabled={!canEdit || subject.archived}
          onClick={() => setOpen(true)}
        >
          <Check size={14} />
          {copy.completeSubject}
        </Button>
      )}
      {open && (
        <Dialog title={copy.completeTitle} onClose={() => setOpen(false)}>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (busy) return;
              const form = new FormData(event.currentTarget);
              setBusy(true);
              const saved = await store.update((draft) => {
                completeSubject(draft, subjectId, store.userId, String(form.get('summary')));
              });
              setBusy(false);
              if (saved) {
                notify(copy.completedNotice);
                setOpen(false);
              }
            }}
          >
            <p>{copy.completeHelp}</p>
            {store.error && (
              <p className="error" role="alert">
                {localizeError(store.error)}
              </p>
            )}
            <Field label={copy.completionSummary}>
              <textarea name="summary" rows={5} maxLength={20000} data-autofocus />
            </Field>
            <div className="form-actions">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                {copy.cancel}
              </Button>
              <Button type="submit" disabled={busy}>
                {copy.completeSubject}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
