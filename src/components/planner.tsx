'use client';
import { ui } from '@/lib/i18n/ui';

import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Check,
  Minus,
  Copy,
  Play,
  Trash2,
  CalendarDays,
  Download,
} from 'lucide-react';
import { useApp, addEvent } from './app-context';
import { Button, IconButton, Panel, Field, FormActions, Dialog } from './ui';
import { en } from '@/lib/i18n/en';
import { id, LOCAL_USER_ID, type PlannedSession } from '@/lib/model';
import { preparePlannedOccurrences, type RepeatOptions } from '@/lib/recurrence';
import { exportCalendar } from '@/lib/calendar-export';
import { RecurrenceFields } from './recurrence-fields';
import {
  weekDays,
  allocateToHourBuckets,
  visibleHours,
  plannerIntensity,
  zonedParts,
  zonedDateTime,
} from '@/lib/calendar';
import { dateKey, formatTime } from '@/lib/display';
import { plannerCopy } from '@/lib/i18n/planner';
import {
  isPlannableTask,
  preparePlannerPlacement,
  type PlannerSource,
} from '@/lib/planner-placement';
import styles from './planner.module.css';

export function Planner({ full = false }: { full?: boolean }) {
  const { store, openPlan, canEdit, notify } = useApp();
  const { data } = store;
  const [offset, setOffset] = useState(0);
  const [subject, setSubject] = useState('');
  const [project, setProject] = useState('');
  const [task, setTask] = useState('');
  const [status, setStatus] = useState('');
  const [member, setMember] = useState(store.user?.id || LOCAL_USER_ID);
  const [cell, setCell] = useState<PlannedSession[] | null>(null);
  const [dragging, setDragging] = useState<PlannerSource | null>(null);
  const [selection, setSelection] = useState<PlannerSource | null>(null);
  const [dropPreview, setDropPreview] = useState<{ key: string; error: string } | null>(null);
  const [feedback, setFeedback] = useState('');
  const [placementFailed, setPlacementFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const dragSource = useRef<PlannerSource | null>(null);
  const savingRef = useRef(false);
  const actorId = store.user?.id || LOCAL_USER_ID;
  const selected = selection?.workspaceId === data.workspaceId && canEdit ? selection : null;
  const activeSource = dragging?.workspaceId === data.workspaceId ? dragging : selected;
  const sourceTitle = activeSource
    ? (activeSource.kind === 'plan' ? data.plannedSessions : data.tasks).find(
        (record) => record.id === activeSource.id,
      )?.title
    : null;
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      dragSource.current = null;
      setDragging(null);
      setSelection(null);
      setDropPreview(null);
    };
    document.addEventListener('keydown', cancel);
    return () => document.removeEventListener('keydown', cancel);
  }, []);
  const days = weekDays(new Date(), data.preferences, offset);
  const today = dateKey(new Date(), data.preferences.timeZone);
  const sessions = data.plannedSessions.filter(
    (s) =>
      (!subject || s.subjectId === subject) &&
      (!project || s.projectId === project) &&
      (!task || s.taskId === task) &&
      (!member || s.userId === member) &&
      (!status || (status === 'completed' ? s.completed : !s.completed)),
  );
  const buckets = useMemo(
    () => allocateToHourBuckets(sessions, data.preferences.timeZone),
    [sessions, data.preferences.timeZone],
  );
  const hours = visibleHours(data.plannedSessions, data.preferences, days);
  const weekSessionIds = new Set(
    [...buckets.values()]
      .filter((bucket) => days.includes(bucket.day))
      .flatMap((bucket) => bucket.sessions.map((session) => session.id)),
  );
  const weekSessions = sessions
    .filter((session) => weekSessionIds.has(session.id))
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const plannedTaskIds = new Set(data.plannedSessions.map((session) => session.taskId));
  const availableTasks = data.tasks.filter(
    (record) =>
      isPlannableTask(data, record) &&
      !plannedTaskIds.has(record.id) &&
      (!subject || record.subjectId === subject) &&
      (!project || record.projectId === project) &&
      (!task || record.id === task),
  );
  function source(kind: PlannerSource['kind'], recordId: string): PlannerSource {
    return { kind, id: recordId, workspaceId: data.workspaceId };
  }
  function chooseSource(item: PlannerSource) {
    if (!canEdit || savingRef.current) return;
    setSelection(item);
    setFeedback('');
    setPlacementFailed(false);
    setDropPreview(null);
  }
  function startDrag(event: DragEvent<HTMLElement>, item: PlannerSource) {
    if (!canEdit || savingRef.current) {
      event.preventDefault();
      return;
    }
    dragSource.current = item;
    event.dataTransfer.effectAllowed = item.kind === 'plan' ? 'move' : 'copy';
    event.dataTransfer.setData('application/x-solace-planner', item.id);
    setDragging(item);
    setSelection(null);
    setFeedback('');
    setPlacementFailed(false);
  }
  function endDrag() {
    dragSource.current = null;
    setDragging(null);
    setDropPreview(null);
  }
  function previewSlot(item: PlannerSource, day: string, hour: number) {
    const key = `${day}:${hour}`;
    if (dropPreview?.key === key) return;
    let error = '';
    try {
      preparePlannerPlacement(data, item, day, hour, actorId, canEdit);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }
    setDropPreview({ key, error });
  }
  async function place(item: PlannerSource, day: string, hour: number) {
    if (!canEdit || savingRef.current) return;
    endDrag();
    setFeedback('');
    setPlacementFailed(false);
    try {
      // Preview errors are shown immediately; repeat against the latest draft inside update.
      const preview = preparePlannerPlacement(data, item, day, hour, actorId, canEdit);
      if (!preview.changed) {
        setFeedback(plannerCopy.unchanged);
        setSelection(null);
        return;
      }
      savingRef.current = true;
      setSaving(true);
      const saved = await store.update((draft) => {
        const { record, changed } = preparePlannerPlacement(
          draft,
          item,
          day,
          hour,
          actorId,
          canEdit,
        );
        if (!changed) return;
        if (item.kind === 'plan') {
          draft.plannedSessions = draft.plannedSessions.map((session) =>
            session.id === record.id ? record : session,
          );
        } else draft.plannedSessions.push(record);
        addEvent(draft, item.kind === 'plan' ? 'plan_updated' : 'plan_created', record.title, {
          subjectId: record.subjectId,
          taskId: record.taskId,
          projectId: record.projectId,
          userId: actorId,
        });
      });
      if (!saved) {
        setPlacementFailed(true);
        setFeedback(plannerCopy.failed);
        setSelection(item);
        return;
      }
      setSelection(null);
      const message = item.kind === 'plan' ? plannerCopy.moved : plannerCopy.planned;
      setFeedback(message);
      notify(message);
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : String(cause));
      setPlacementFailed(true);
      setSelection(item);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  const monthFormat = new Intl.DateTimeFormat('fr-FR', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const range = `${monthFormat.format(new Date(days[0] + 'T12:00Z'))} – ${monthFormat.format(new Date(days[6] + 'T12:00Z'))}`;
  return (
    <Panel
      className={`planner-panel ${full ? 'full-planner' : ''}`}
      title={en.overview.planner}
      subtitle={full ? en.planner.subtitle : en.overview.plannerSubtitle}
      action={
        <IconButton label={en.planner.add} disabled={!canEdit} onClick={() => openPlan()}>
          <Plus size={19} />
        </IconButton>
      }
    >
      <div className="planner-toolbar">
        <div className="row">
          <IconButton label={en.planner.previous} onClick={() => setOffset((o) => o - 1)}>
            <ChevronLeft size={16} />
          </IconButton>
          <strong>{range}</strong>
          <IconButton label={en.planner.next} onClick={() => setOffset((o) => o + 1)}>
            <ChevronRight size={16} />
          </IconButton>
        </div>
        <Button variant="secondary" onClick={() => setOffset(0)}>
          {en.planner.today}
        </Button>
        {full && (
          <Button
            variant="secondary"
            title="Exporter mes séances de la semaine affichée, avec les filtres actuels"
            onClick={() => {
              try {
                const calendar = exportCalendar(sessions, {
                  workspaceId: data.workspaceId,
                  userId: actorId,
                  startDay: days[0],
                  endDay: days[6],
                  timeZone: data.preferences.timeZone,
                });
                if (!calendar.count) {
                  notify('Aucune séance personnelle à exporter pour cette semaine et ces filtres.');
                  return;
                }
                const url = URL.createObjectURL(
                  new Blob([calendar.text], { type: 'text/calendar;charset=utf-8' }),
                );
                const link = document.createElement('a');
                link.href = url;
                link.download = `solace-planning-${days[0]}-${days[6]}.ics`;
                document.body.appendChild(link);
                link.click();
                link.remove();
                window.setTimeout(() => URL.revokeObjectURL(url), 1000);
                notify(
                  `${calendar.count} séance(s) exportée(s). Importez le fichier dans votre calendrier.`,
                );
              } catch (cause) {
                notify(
                  cause instanceof Error ? cause.message : "Impossible d'exporter le calendrier.",
                );
              }
            }}
          >
            <Download size={15} />
            Exporter ma semaine (.ics)
          </Button>
        )}
      </div>
      {full && (
        <p className="helper">
          L'export inclut vos séances de la semaine affichée et respecte les filtres. Importez ce
          fichier dans Google Calendar, Outlook ou Apple Calendrier ; les changements ultérieurs ne
          sont pas synchronisés.
        </p>
      )}
      {full && (
        <div className="filters">
          <select
            aria-label={en.tasks.subject}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          >
            <option value="">{ui.planner.allSubjects}</option>
            {data.subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            aria-label={en.tasks.project}
            value={project}
            onChange={(e) => setProject(e.target.value)}
          >
            <option value="">{ui.planner.allProjects}</option>
            {data.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            aria-label={ui.planner.filterTask}
            value={task}
            onChange={(e) => setTask(e.target.value)}
          >
            <option value="">{ui.planner.allTasks}</option>
            {data.tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
          <select
            aria-label={en.tasks.status}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">{ui.planner.allCompletionStates}</option>
            <option value="planned">{ui.planner.planned}</option>
            <option value="completed">{ui.planner.completed}</option>
          </select>
          {new Set(data.plannedSessions.map((s) => s.userId)).size > 1 && (
            <select
              aria-label={ui.planner.member}
              value={member}
              onChange={(e) => setMember(e.target.value)}
            >
              <option value={store.user?.id || LOCAL_USER_ID}>{ui.planner.mySchedule}</option>
              <option value="">{ui.planner.allPermittedMembers}</option>
              {Array.from(new Set(data.plannedSessions.map((s) => s.userId)))
                .filter((uid) => uid !== store.user?.id)
                .map((uid) => (
                  <option key={uid} value={uid}>
                    {uid.slice(0, 8)}
                  </option>
                ))}
            </select>
          )}
        </div>
      )}
      {full && (
        <div className={styles.sources}>
          {weekSessions.length > 0 && (
            <div>
              <div className={styles.sourceHeading}>
                <strong>{plannerCopy.scheduled}</strong>
                <span>{plannerCopy.edit}</span>
              </div>
              <div className={styles.cardList} aria-label={plannerCopy.scheduled}>
                {weekSessions.map((session) => (
                  <div
                    className={`${styles.card} ${dragging?.kind === 'plan' && dragging.id === session.id ? styles.dragging : ''}`}
                    key={session.id}
                  >
                    <button
                      type="button"
                      className={styles.cardButton}
                      data-plan-id={session.id}
                      draggable={canEdit && !saving}
                      onDragStart={(event) => startDrag(event, source('plan', session.id))}
                      onDragEnd={endDrag}
                      onClick={() => openPlan(session.id)}
                      title={session.title}
                    >
                      <strong>{session.title}</strong>
                      <small>
                        {new Intl.DateTimeFormat('fr-FR', {
                          weekday: 'short',
                          timeZone: data.preferences.timeZone,
                        }).format(new Date(session.startsAt))}{' '}
                        {formatTime(session.startsAt, data.preferences)} · {session.durationMinutes}
                        {ui.planner.m}
                      </small>
                    </button>
                    {canEdit && (
                      <button
                        type="button"
                        className={styles.moveButton}
                        aria-label={`${plannerCopy.move} ${session.title}`}
                        aria-pressed={selected?.kind === 'plan' && selected.id === session.id}
                        disabled={saving}
                        onClick={() => chooseSource(source('plan', session.id))}
                      >
                        {plannerCopy.move}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {canEdit && (
            <div>
              <div className={styles.sourceHeading}>
                <strong>{plannerCopy.available}</strong>
                <span>{plannerCopy.availableHint}</span>
              </div>
              {availableTasks.length ? (
                <div className={styles.cardList} aria-label={plannerCopy.available}>
                  {availableTasks.map((record) => (
                    <div className={styles.card} key={record.id}>
                      <button
                        type="button"
                        className={styles.cardButton}
                        data-task-id={record.id}
                        draggable={!saving}
                        disabled={saving}
                        aria-pressed={selected?.kind === 'task' && selected.id === record.id}
                        onDragStart={(event) => startDrag(event, source('task', record.id))}
                        onDragEnd={endDrag}
                        onClick={() => chooseSource(source('task', record.id))}
                        title={record.title}
                      >
                        <strong>{record.title}</strong>
                        <small>
                          {data.preferences.focusMinutes}
                          {ui.planner.m}
                        </small>
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p>{plannerCopy.noAvailable}</p>
              )}
            </div>
          )}
        </div>
      )}
      {canEdit && (
        <div className={`${styles.feedback} ${activeSource ? styles.selection : ''}`}>
          <p role="status" aria-live="polite">
            {saving
              ? plannerCopy.saving
              : activeSource
                ? `${sourceTitle || ''} — ${dropPreview?.error || (dropPreview && dragging ? plannerCopy.ready : plannerCopy.chooseSlot)}`
                : full
                  ? plannerCopy.instructions
                  : plannerCopy.compactInstructions}
          </p>
          {activeSource && (
            <Button
              variant="ghost"
              disabled={saving}
              onClick={() => {
                endDrag();
                setSelection(null);
              }}
            >
              {plannerCopy.cancel}
            </Button>
          )}
        </div>
      )}
      {feedback && (
        <p
          className={placementFailed ? 'error' : 'helper'}
          role={placementFailed ? 'alert' : 'status'}
        >
          {placementFailed && feedback === plannerCopy.failed ? store.error || feedback : feedback}
        </p>
      )}
      <div className={`grid-scroller ${activeSource ? styles.choosing : ''}`} aria-busy={saving}>
        <div className="planner-grid" role="group" aria-label={`Planning hebdomadaire ${range}`}>
          <div className="grid-corner">
            <CalendarDays size={14} />
          </div>
          {days.map((day) => (
            <div key={day} className={`day-heading ${day === today ? 'today' : ''}`}>
              <span>
                {new Intl.DateTimeFormat('fr-FR', { weekday: 'short', timeZone: 'UTC' }).format(
                  new Date(day + 'T12:00Z'),
                )}
              </span>
              <strong>{Number(day.slice(-2))}</strong>
            </div>
          ))}
          {hours.map((hour) => (
            <div className="planner-row" key={hour}>
              <span className="hour-label">
                {data.preferences.timeFormat === '24h'
                  ? `${String(hour).padStart(2, '0')}:00`
                  : `${hour % 12 || 12}${hour < 12 ? 'am' : 'pm'}`}
              </span>
              {days.map((day) => {
                const bucket = buckets.get(`${day}:${hour}`);
                const description = `${day}, ${hour}:00, ${Math.round(bucket?.minutes || 0)} minutes planifiées${bucket?.completed ? ', toutes terminées' : bucket?.partial ? ', partiellement terminées' : ''}${bucket?.sessions.length ? `, ${bucket.sessions.map((s) => s.title).join(', ')}` : ''}`;
                return (
                  <button
                    key={day}
                    type="button"
                    className={`planner-cell intensity-${plannerIntensity(bucket?.minutes || 0)} ${day === today ? 'today-column' : ''} ${canEdit && bucket?.sessions.length === 1 ? styles.draggable : ''} ${dragging?.kind === 'plan' && bucket?.sessions.some((session) => session.id === dragging.id) ? styles.dragging : ''} ${dropPreview?.key === `${day}:${hour}` ? (dropPreview.error ? styles.dropInvalid : styles.dropTarget) : ''}`}
                    data-planner-slot={`${day}:${hour}`}
                    aria-label={description}
                    title={description}
                    draggable={canEdit && !saving && bucket?.sessions.length === 1}
                    onDragStart={(event) => {
                      if (bucket?.sessions.length === 1)
                        startDrag(event, source('plan', bucket.sessions[0].id));
                    }}
                    onDragEnd={endDrag}
                    onDragOver={(event) => {
                      const item = dragSource.current;
                      if (
                        !canEdit ||
                        savingRef.current ||
                        !item ||
                        item.workspaceId !== data.workspaceId
                      )
                        return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = item.kind === 'plan' ? 'move' : 'copy';
                      previewSlot(item, day, hour);
                    }}
                    onDragLeave={(event) => {
                      if (
                        !(event.relatedTarget instanceof Node) ||
                        !event.currentTarget.contains(event.relatedTarget)
                      )
                        setDropPreview(null);
                    }}
                    onDrop={(event) => {
                      const item = dragSource.current;
                      if (!item || !canEdit) return;
                      event.preventDefault();
                      void place(item, day, hour);
                    }}
                    onFocus={() => {
                      if (selected) previewSlot(selected, day, hour);
                    }}
                    onBlur={() => setDropPreview(null)}
                    onClick={() => {
                      if (savingRef.current) return;
                      if (selected) {
                        void place(selected, day, hour);
                        return;
                      }
                      if (bucket?.sessions.length === 1) openPlan(bucket.sessions[0].id);
                      else if (bucket?.sessions.length) setCell(bucket.sessions);
                      else if (canEdit) openPlan(undefined, day, hour);
                    }}
                  >
                    {bucket?.completed ? (
                      <Check size={13} />
                    ) : bucket?.partial ? (
                      <Minus size={13} />
                    ) : (
                      bucket && (
                        <span>
                          {Math.round(bucket.minutes)}
                          <small>{ui.planner.m}</small>
                        </span>
                      )
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="planner-footer">
        <span className="muted">{en.planner.legend}</span>
        <Legend />
      </div>
      {full && (
        <p className="helper">
          {en.planner.empty} {ui.planner.copy} {data.preferences.timeZone}. {plannerCopy.snap}
        </p>
      )}
      {cell && (
        <Dialog title={ui.planner.sessionsInThisHour} onClose={() => setCell(null)}>
          {cell.map((s) => (
            <button
              className="session-item"
              key={s.id}
              onClick={() => {
                setCell(null);
                openPlan(s.id);
              }}
            >
              <strong>{s.title}</strong>
              <span>
                {formatTime(s.startsAt, data.preferences)} {ui.planner.copy} {s.durationMinutes}
                {ui.planner.m}
              </span>
            </button>
          ))}
        </Dialog>
      )}
    </Panel>
  );
}
export function Legend() {
  return (
    <div className="legend">
      <span>{en.overview.less}</span>
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={`legend-cell intensity-${i}`}
          title={i === 0 ? ui.planner.copy0Minutes : `${(i - 1) * 15 + 1}–${i * 15} minutes`}
        />
      ))}
      <span>{en.overview.more}</span>
    </div>
  );
}
export function PlanEditor({
  planId,
  initialDate,
  initialHour,
  onClose,
}: {
  planId?: string;
  initialDate?: string;
  initialHour?: number;
  onClose: () => void;
}) {
  const { store, notify, canEdit } = useApp();
  const { data } = store;
  const original = data.plannedSessions.find((s) => s.id === planId);
  const [deleting, setDeleting] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [subjectId, setSubject] = useState(original?.subjectId || '');
  const [taskId, setTask] = useState(original?.taskId || '');
  const [projectId, setProject] = useState(original?.projectId || '');
  const [error, setError] = useState('');
  const [repeat, setRepeat] = useState<RepeatOptions>({ frequency: 'none', count: 4 });
  const p = original ? zonedParts(original.startsAt, data.preferences.timeZone) : null;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const now = new Date().toISOString();
      const record: PlannedSession = {
        id: original && !duplicating ? original.id : id(),
        workspaceId: data.workspaceId,
        userId: original && !duplicating ? original.userId : store.user?.id || LOCAL_USER_ID,
        title: String(form.get('title')),
        startsAt: zonedDateTime(
          String(form.get('date')),
          String(form.get('time')),
          data.preferences.timeZone,
        ),
        durationMinutes: Number(form.get('duration')),
        subjectId: subjectId || undefined,
        projectId: projectId || undefined,
        taskId: taskId || undefined,
        notes: String(form.get('notes')),
        completed: original && !duplicating ? original.completed : false,
        createdAt: original && !duplicating ? original.createdAt : now,
        updatedAt: now,
      };
      let occurrenceCount = 1;
      const saved = await store.update((d) => {
        const occurrences = preparePlannedOccurrences(
          d,
          record,
          original && !duplicating ? { frequency: 'none', count: 1 } : repeat,
        );
        occurrenceCount = occurrences.length;
        d.plannedSessions = d.plannedSessions.filter((s) => s.id !== record.id);
        d.plannedSessions.push(...occurrences);
        for (const occurrence of occurrences)
          addEvent(
            d,
            original && !duplicating ? 'plan_updated' : 'plan_created',
            occurrence.title,
            {
              subjectId: occurrence.subjectId,
              taskId: occurrence.taskId,
              userId: store.user?.id,
            },
          );
      });
      if (!saved) return;
      notify(
        occurrenceCount > 1
          ? `${occurrenceCount} séances récurrentes créées.`
          : original && !duplicating
            ? ui.planner.planUpdated
            : ui.planner.aLittleFocusPlanned,
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }
  return (
    <Dialog
      title={original && !duplicating ? ui.planner.editPlannedSession : en.planner.add}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <Field label={en.planner.titleField}>
          <input
            name="title"
            required
            maxLength={300}
            defaultValue={original?.title || ''}
            placeholder={ui.planner.aLittleFocusedWork}
            autoFocus
            data-autofocus
          />
        </Field>
        <div className="form-grid">
          <Field label={en.planner.date}>
            <input
              type="date"
              name="date"
              required
              defaultValue={
                original
                  ? dateKey(original.startsAt, data.preferences.timeZone)
                  : initialDate || dateKey(new Date(), data.preferences.timeZone)
              }
            />
          </Field>
          <Field label={en.planner.time}>
            <input
              type="time"
              name="time"
              required
              defaultValue={
                p
                  ? `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
                  : `${String(initialHour ?? 9).padStart(2, '0')}:00`
              }
            />
          </Field>
        </div>
        <Field label={en.planner.duration}>
          <input
            type="number"
            name="duration"
            min={1}
            max={180}
            required
            defaultValue={original?.durationMinutes || 25}
          />
        </Field>
        {(!original || duplicating) && <RecurrenceFields value={repeat} onChange={setRepeat} />}
        <Field label={en.tasks.subject}>
          <select
            value={subjectId}
            onChange={(e) => {
              setSubject(e.target.value);
              setTask('');
              setProject('');
            }}
          >
            <option value="">{en.common.unassigned}</option>
            {data.subjects
              .filter((s) => !s.archived || s.id === original?.subjectId)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </Field>
        <div className="form-grid">
          <Field label={en.tasks.project}>
            <select
              value={projectId}
              onChange={(e) => {
                setProject(e.target.value);
                setTask('');
              }}
            >
              <option value="">{en.common.none}</option>
              {data.projects
                .filter((p) => !p.archived && (!subjectId || p.subjectId === subjectId))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label={en.tasks.titleField}>
            <select
              value={taskId}
              onChange={(e) => {
                setTask(e.target.value);
                const t = data.tasks.find((t) => t.id === e.target.value);
                if (t) {
                  setSubject(t.subjectId || '');
                  setProject(t.projectId || '');
                }
              }}
            >
              <option value="">{en.common.none}</option>
              {data.tasks
                .filter(
                  (t) =>
                    t.status !== 'done' &&
                    (!subjectId || t.subjectId === subjectId) &&
                    (!projectId || t.projectId === projectId),
                )
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
            </select>
          </Field>
        </div>
        <Field label={en.planner.notes}>
          <textarea name="notes" defaultValue={original?.notes || ''} rows={3} />
        </Field>
        <p className="helper">
          {data.preferences.timeZone} {ui.planner.overlappingPersonalSessionsAreNotAllowed}
        </p>
        {(error || store.error) && (
          <p className="error" role="alert">
            {error || store.error}
          </p>
        )}
        {canEdit ? (
          <FormActions
            onClose={onClose}
            submit={original && !duplicating ? en.common.save : en.planner.add}
          />
        ) : (
          <p className="notice">{ui.planner.thisWorkspaceIsReadOnly}</p>
        )}
      </form>
      {original && canEdit && (
        <div className="record-actions">
          <Button
            variant="secondary"
            disabled={
              data.timer.status !== 'idle' ||
              original.completed ||
              !!data.subjects.find((s) => s.id === original.subjectId)?.archived
            }
            onClick={async () => {
              try {
                const saved = await store.startTimer({
                  plannedSessionId: original.id,
                  durationMinutes: original.durationMinutes,
                  taskId: original.taskId,
                  subjectId: original.subjectId,
                  projectId: original.projectId,
                });
                if (!saved) return;
                onClose();
                notify(ui.planner.yourPlannedFocusSessionHasStarted);
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
              }
            }}
          >
            <Play size={15} />
            {en.planner.focusNow}
          </Button>
          <IconButton
            label={en.planner.duplicate}
            onClick={() => {
              setDuplicating(true);
              notify(ui.planner.chooseADifferentTimeThenSaveTheDuplicatedSession);
            }}
          >
            <Copy size={17} />
          </IconButton>
          <IconButton label={en.common.delete} onClick={() => setDeleting(true)}>
            <Trash2 size={17} />
          </IconButton>
        </div>
      )}
      {deleting && (
        <Dialog title={ui.planner.deletePlannedSession} onClose={() => setDeleting(false)}>
          {store.error && (
            <p className="error" role="alert">
              {store.error}
            </p>
          )}
          <p>{en.common.confirmDelete}</p>
          <div className="form-actions">
            <Button variant="secondary" onClick={() => setDeleting(false)}>
              {en.common.cancel}
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                const saved = await store.update((d) => {
                  d.plannedSessions = d.plannedSessions.filter((s) => s.id !== original?.id);
                  addEvent(d, 'plan_deleted', original?.title || '', {
                    subjectId: original?.subjectId,
                    userId: store.user?.id,
                  });
                });
                if (!saved) return;
                onClose();
                notify(ui.planner.plannedSessionDeleted);
              }}
            >
              {en.common.delete}
            </Button>
          </div>
        </Dialog>
      )}
    </Dialog>
  );
}
