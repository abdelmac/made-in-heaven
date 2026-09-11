'use client';
import { ui } from '@/lib/i18n/ui';

import { useMemo, useState, type FormEvent } from 'react';
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
} from 'lucide-react';
import { useApp, addEvent } from './app-context';
import { Button, IconButton, Panel, Field, FormActions, Dialog } from './ui';
import { en } from '@/lib/i18n/en';
import { id, LOCAL_USER_ID, type PlannedSession } from '@/lib/model';
import {
  weekDays,
  allocateToHourBuckets,
  visibleHours,
  plannerIntensity,
  zonedParts,
  zonedDateTime,
} from '@/lib/calendar';
import { dateKey, formatTime } from '@/lib/display';

export function Planner({ full = false }: { full?: boolean }) {
  const { store, openPlan, canEdit } = useApp();
  const { data } = store;
  const [offset, setOffset] = useState(0);
  const [subject, setSubject] = useState('');
  const [project, setProject] = useState('');
  const [task, setTask] = useState('');
  const [status, setStatus] = useState('');
  const [member, setMember] = useState(store.user?.id || LOCAL_USER_ID);
  const [cell, setCell] = useState<PlannedSession[] | null>(null);
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
  const monthFormat = new Intl.DateTimeFormat('en-US', {
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
      </div>
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
      <div className="grid-scroller">
        <div className="planner-grid" role="group" aria-label={`Weekly planner ${range}`}>
          <div className="grid-corner">
            <CalendarDays size={14} />
          </div>
          {days.map((day) => (
            <div key={day} className={`day-heading ${day === today ? 'today' : ''}`}>
              <span>
                {new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(
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
                const description = `${day}, ${hour}:00, ${Math.round(bucket?.minutes || 0)} planned minutes${bucket?.completed ? ', all completed' : bucket?.partial ? ', partially completed' : ''}${bucket?.sessions.length ? `, ${bucket.sessions.map((s) => s.title).join(', ')}` : ''}`;
                return (
                  <button
                    key={day}
                    type="button"
                    className={`planner-cell intensity-${plannerIntensity(bucket?.minutes || 0)} ${day === today ? 'today-column' : ''}`}
                    aria-label={description}
                    title={description}
                    onClick={() => {
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
          {en.planner.empty} {ui.planner.copy} {data.preferences.timeZone}
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
      const saved = await store.update((d) => {
        d.plannedSessions = d.plannedSessions.filter((s) => s.id !== record.id);
        d.plannedSessions.push(record);
        addEvent(d, original && !duplicating ? 'plan_updated' : 'plan_created', record.title, {
          subjectId: record.subjectId,
          taskId: record.taskId,
          userId: store.user?.id,
        });
      });
      if (!saved) return;
      notify(original && !duplicating ? ui.planner.planUpdated : ui.planner.aLittleFocusPlanned);
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
