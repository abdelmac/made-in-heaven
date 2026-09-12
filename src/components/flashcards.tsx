'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { BookOpen, Download, Layers, Pencil, Plus, Trash2 } from 'lucide-react';
import { useApp } from './app-context';
import { Button, Dialog, Empty, Field, Markdown } from './ui';
import { learning as copy } from '@/lib/i18n/learning';
import { id, flashcardSchema, type Flashcard, type FlashcardDeck } from '@/lib/model';
import { answerStudyCard, createStudySession, revealStudyCard } from '@/lib/learning';
import styles from './learning.module.css';

function useFlashcardAccess() {
  const { store, canEdit } = useApp();
  const access = !store.isCloud || Boolean(store.entitlements?.features.flashcards);
  return { access, write: access && canEdit, local: !store.isCloud };
}
function ProNotice() {
  const { store, navigate } = useApp();
  const { access, local } = useFlashcardAccess();
  if (!local && access) return null;
  return (
    <aside className={styles.notice}>
      <span className="badge">{local ? copy.previewLabel : copy.pro}</span>
      <p>{local ? copy.localPreview : store.entitlements ? copy.locked : copy.verifyAccess}</p>
      {!local && (
        <Button variant="secondary" onClick={() => navigate('billing')}>
          {copy.plans}
        </Button>
      )}
    </aside>
  );
}
export function FlashcardsPage() {
  const { store } = useApp();
  const { write } = useFlashcardAccess();
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ id?: string } | null>(null);
  const decks = store.data.flashcardDecks
    .filter(
      (deck) =>
        (!subject || deck.subjectId === subject) &&
        `${deck.title} ${deck.description}`.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const deck = store.data.flashcardDecks.find((item) => item.id === selected);
  return (
    <>
      <ProNotice />
      <div className={styles.toolbar}>
        <input
          aria-label={copy.searchDecks}
          placeholder={copy.searchDecks}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          aria-label={copy.subject}
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
        >
          <option value="">{copy.allSubjects}</option>
          {store.data.subjects.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <Button disabled={!write} onClick={() => setEditor({})}>
          <Plus size={15} />
          {copy.newDeck}
        </Button>
      </div>
      {decks.length ? (
        <div className={styles.grid}>
          {decks.map((item) => (
            <article className={styles.card} key={item.id}>
              <Layers size={22} />
              <div className={styles.meta}>
                <span>{store.data.subjects.find((s) => s.id === item.subjectId)?.name}</span>
                <span>
                  {store.data.flashcards.filter((card) => card.deckId === item.id).length}{' '}
                  {copy.cards}
                </span>
              </div>
              <button className={styles.cardTitle} onClick={() => setSelected(item.id)}>
                {item.title}
              </button>
              <p className={styles.cardPreview}>{item.description}</p>
            </article>
          ))}
        </div>
      ) : (
        <Empty title={copy.noDecks} detail={copy.noDecksDetail} />
      )}
      {editor && <DeckEditor deckId={editor.id} onClose={() => setEditor(null)} />}
      {deck && (
        <DeckReader
          deck={deck}
          onClose={() => setSelected(null)}
          onEdit={() => {
            setEditor({ id: deck.id });
            setSelected(null);
          }}
        />
      )}
    </>
  );
}
function DeckEditor({ deckId, onClose }: { deckId?: string; onClose: () => void }) {
  const { store, notify } = useApp();
  const { write } = useFlashcardAccess();
  const deck = store.data.flashcardDecks.find((item) => item.id === deckId);
  const [busy, setBusy] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!write || busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    const saved = await store.update((draft) => {
      const previous = deckId ? draft.flashcardDecks.find((item) => item.id === deckId) : undefined;
      if (deckId && (!previous || previous.userId !== store.userId))
        throw new Error(copy.deckReadOnly);
      const now = new Date().toISOString();
      const record = {
        id: previous?.id || id(),
        workspaceId: draft.workspaceId,
        userId: previous?.userId || store.userId,
        title: String(form.get('title')),
        description: String(form.get('description')),
        subjectId: String(form.get('subject')) || undefined,
        createdAt: previous?.createdAt || now,
        updatedAt: now,
      };
      if (previous)
        draft.flashcardDecks = draft.flashcardDecks.map((item) =>
          item.id === previous.id ? record : item,
        );
      else draft.flashcardDecks.unshift(record);
    });
    setBusy(false);
    if (saved) {
      notify(copy.deckSaved);
      onClose();
    }
  }
  return (
    <Dialog title={deck ? copy.editDeck : copy.newDeck} onClose={onClose}>
      <ProNotice />
      <form onSubmit={save}>
        {store.error && (
          <p className="error" role="alert">
            {store.error}
          </p>
        )}
        <Field label={copy.deckTitle}>
          <input
            name="title"
            required
            maxLength={120}
            defaultValue={deck?.title || ''}
            data-autofocus
          />
        </Field>
        <Field label={copy.description}>
          <textarea
            name="description"
            rows={4}
            maxLength={20000}
            defaultValue={deck?.description || ''}
          />
        </Field>
        <Field label={copy.subject}>
          <select name="subject" defaultValue={deck?.subjectId || ''}>
            <option value="">{copy.noSubject}</option>
            {store.data.subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            {copy.cancel}
          </Button>
          <Button type="submit" disabled={!write || busy}>
            {copy.save}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
function DeckReader({
  deck,
  onClose,
  onEdit,
}: {
  deck: FlashcardDeck;
  onClose: () => void;
  onEdit: () => void;
}) {
  const { store, canEdit, notify } = useApp();
  const { access, write, local } = useFlashcardAccess();
  const owned = deck.userId === store.userId;
  const [editor, setEditor] = useState<{ id?: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [study, setStudy] = useState<Flashcard[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const studyRequest = useRef<AbortController | null>(null);
  const cards = store.data.flashcards
    .filter((card) => card.deckId === deck.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  useEffect(() => () => studyRequest.current?.abort(), [deck.id, store.workspaceId]);
  async function startStudy() {
    if (!access || !cards.length || loading) return;
    setError('');
    if (local) {
      setStudy(cards);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    studyRequest.current = controller;
    try {
      const response = await fetch(
        `/api/flashcards/study?workspaceId=${encodeURIComponent(store.workspaceId)}&deckId=${encodeURIComponent(deck.id)}`,
        { cache: 'no-store', signal: controller.signal },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || copy.studyUnavailable);
      const permitted = flashcardSchema
        .array()
        .parse(body.cards)
        .filter((card) => card.deckId === deck.id && card.workspaceId === store.workspaceId);
      if (!permitted.length) throw new Error(copy.noCards);
      if (!controller.signal.aborted) setStudy(permitted);
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : copy.studyUnavailable);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  function exportDeck() {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              format: 'folia-flashcards',
              schemaVersion: 1,
              exportedAt: new Date().toISOString(),
              deck,
              cards,
            },
            null,
            2,
          ),
        ],
        { type: 'application/json' },
      ),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'folia-flashcards.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <Dialog wide title={deck.title} onClose={onClose}>
      <ProNotice />
      {(error || store.error) && (
        <p className="error" role="alert">
          {error || store.error}
        </p>
      )}
      <Markdown text={deck.description} />
      <div className={styles.toolbar}>
        <Button disabled={!access || !cards.length || loading} onClick={() => void startStudy()}>
          <BookOpen size={15} />
          {loading ? copy.loadingStudy : copy.study}
        </Button>
        <Button variant="secondary" onClick={exportDeck}>
          <Download size={15} />
          {copy.exportDeck}
        </Button>
        <Button variant="secondary" disabled={!write || !owned} onClick={() => setEditor({})}>
          <Plus size={15} />
          {copy.newCard}
        </Button>
      </div>
      {cards.length ? (
        <div className={styles.cardList}>
          {cards.map((card) => (
            <article key={card.id}>
              <p className={styles.cardLabel}>{copy.question}</p>
              <p className={styles.cardText}>{card.front}</p>
              <details>
                <summary>{copy.answer}</summary>
                <p className={styles.cardText}>{card.back}</p>
              </details>
              {canEdit && card.userId === store.userId && (
                <div className="form-actions">
                  <Button
                    variant="ghost"
                    disabled={!write}
                    onClick={() => setEditor({ id: card.id })}
                  >
                    <Pencil size={14} />
                    {copy.editCard}
                  </Button>
                  <Button variant="ghost" onClick={() => setDeleting(card.id)}>
                    <Trash2 size={14} />
                    {copy.deleteCard}
                  </Button>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <Empty title={copy.noCards} detail={copy.noCardsDetail} />
      )}
      {owned && canEdit ? (
        <div className="form-actions">
          <Button variant="secondary" disabled={!write} onClick={onEdit}>
            <Pencil size={15} />
            {copy.editDeck}
          </Button>
          <Button variant="ghost" onClick={() => setDeleting('deck')}>
            <Trash2 size={15} />
            {copy.deleteDeck}
          </Button>
        </div>
      ) : (
        <p className="helper">{copy.deckReadOnly}</p>
      )}
      {editor && <CardEditor deckId={deck.id} cardId={editor.id} onClose={() => setEditor(null)} />}
      {study && access && (
        <StudyDialog title={deck.title} cards={study} onClose={() => setStudy(null)} />
      )}
      {deleting && (
        <Dialog
          title={deleting === 'deck' ? copy.deleteDeck : copy.deleteCard}
          onClose={() => setDeleting(null)}
        >
          <p>{deleting === 'deck' ? copy.deleteDeckPrompt : copy.deleteCardPrompt}</p>
          {store.error && (
            <p className="error" role="alert">
              {store.error}
            </p>
          )}
          <div className="form-actions">
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              {copy.cancel}
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                const saved = await store.update((draft) => {
                  if (deleting === 'deck') {
                    const current = draft.flashcardDecks.find((item) => item.id === deck.id);
                    if (
                      current?.userId !== store.userId ||
                      draft.flashcards.some(
                        (card) => card.deckId === deck.id && card.userId !== store.userId,
                      )
                    )
                      throw new Error(copy.deckReadOnly);
                    draft.flashcardDecks = draft.flashcardDecks.filter(
                      (item) => item.id !== deck.id,
                    );
                    draft.flashcards = draft.flashcards.filter((item) => item.deckId !== deck.id);
                  } else {
                    if (
                      draft.flashcards.find((card) => card.id === deleting)?.userId !== store.userId
                    )
                      throw new Error(copy.importedCardAuthor);
                    draft.flashcards = draft.flashcards.filter((card) => card.id !== deleting);
                  }
                });
                if (saved) {
                  notify(deleting === 'deck' ? copy.deckDeleted : copy.cardDeleted);
                  if (deleting === 'deck') onClose();
                  else setDeleting(null);
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
function CardEditor({
  deckId,
  cardId,
  onClose,
}: {
  deckId: string;
  cardId?: string;
  onClose: () => void;
}) {
  const { store, notify } = useApp();
  const { write } = useFlashcardAccess();
  const card = store.data.flashcards.find((item) => item.id === cardId);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog title={card ? copy.editCard : copy.newCard} onClose={onClose}>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (!write || busy) return;
          const form = new FormData(event.currentTarget);
          setBusy(true);
          const saved = await store.update((draft) => {
            const previous = cardId
              ? draft.flashcards.find((item) => item.id === cardId)
              : undefined;
            if (cardId && (!previous || previous.userId !== store.userId))
              throw new Error(copy.importedCardAuthor);
            if (
              !previous &&
              draft.flashcardDecks.find((deck) => deck.id === deckId)?.userId !== store.userId
            )
              throw new Error(copy.deckReadOnly);
            const now = new Date().toISOString();
            const record = {
              id: previous?.id || id(),
              workspaceId: draft.workspaceId,
              userId: previous?.userId || store.userId,
              deckId,
              front: String(form.get('front')),
              back: String(form.get('back')),
              createdAt: previous?.createdAt || now,
              updatedAt: now,
            };
            if (previous)
              draft.flashcards = draft.flashcards.map((item) =>
                item.id === previous.id ? record : item,
              );
            else draft.flashcards.push(record);
          });
          setBusy(false);
          if (saved) {
            notify(copy.cardSaved);
            onClose();
          }
        }}
      >
        <ProNotice />
        {store.error && (
          <p className="error" role="alert">
            {store.error}
          </p>
        )}
        <Field label={copy.question}>
          <textarea
            name="front"
            rows={4}
            required
            maxLength={4000}
            defaultValue={card?.front || ''}
            data-autofocus
          />
        </Field>
        <Field label={copy.answer}>
          <textarea
            name="back"
            rows={5}
            required
            maxLength={10000}
            defaultValue={card?.back || ''}
          />
        </Field>
        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            {copy.cancel}
          </Button>
          <Button type="submit" disabled={!write || busy}>
            {copy.saveCard}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
function StudyDialog({
  title,
  cards,
  onClose,
}: {
  title: string;
  cards: Flashcard[];
  onClose: () => void;
}) {
  const [session, setSession] = useState(() => createStudySession(cards));
  const current = session.cards[session.index];
  const studying = Boolean(current);
  useEffect(() => {
    if (!studying) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        target.closest('input, textarea, select, [contenteditable="true"]') ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      )
        return;
      if (event.key === ' ') {
        if (target.closest('button')) return;
        event.preventDefault();
        setSession(revealStudyCard);
      }
      if (event.key === '1' || event.key === '2') {
        event.preventDefault();
        setSession((previous) =>
          previous.revealed
            ? answerStudyCard(previous, event.key === '1' ? 'again' : 'known')
            : previous,
        );
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [studying]);
  return (
    <Dialog wide title={`${copy.study}: ${title}`} onClose={onClose}>
      {current ? (
        <>
          <div className={styles.studyProgress}>
            <span>
              {session.index + 1} / {session.cards.length}
            </span>
            <progress aria-label={copy.study} value={session.index} max={session.cards.length} />
          </div>
          <button
            type="button"
            className={styles.studyCard}
            aria-pressed={session.revealed}
            aria-label={`${session.revealed ? copy.answer : copy.question}: ${session.revealed ? current.back : current.front}. ${copy.flip}`}
            onClick={() => setSession(revealStudyCard)}
          >
            <span className={styles.cardLabel}>
              {session.revealed ? copy.answer : copy.question}
            </span>
            <span className={styles.studyText} aria-live="polite">
              {session.revealed ? current.back : current.front}
            </span>
          </button>
          <div className={styles.studyActions}>
            <Button
              variant="secondary"
              disabled={!session.revealed}
              onClick={() => setSession((previous) => answerStudyCard(previous, 'again'))}
            >
              {copy.again}
            </Button>
            <Button variant="ghost" onClick={() => setSession(revealStudyCard)}>
              {session.revealed ? copy.showQuestion : copy.showAnswer}
            </Button>
            <Button
              disabled={!session.revealed}
              onClick={() => setSession((previous) => answerStudyCard(previous, 'known'))}
            >
              {copy.known}
            </Button>
          </div>
          <p className="helper">{copy.studyHelp}</p>
        </>
      ) : (
        <div className={styles.results}>
          <h3>{copy.studyComplete}</h3>
          <div className={styles.resultsNumbers}>
            <div>
              <strong>{session.known.length}</strong>
              {copy.known}
            </div>
            <div>
              <strong>{session.again.length}</strong>
              {copy.again}
            </div>
          </div>
          <p>{copy.studyResults}</p>
          <div className={styles.studyActions}>
            {!!session.again.length && (
              <Button
                variant="secondary"
                onClick={() =>
                  setSession(
                    createStudySession(
                      session.cards.filter((card) => session.again.includes(card.id)),
                    ),
                  )
                }
              >
                {copy.reviewAgain}
              </Button>
            )}
            <Button variant="secondary" onClick={() => setSession(createStudySession(cards))}>
              {copy.restartStudy}
            </Button>
            <Button onClick={onClose}>{copy.finishStudy}</Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
