'use client';
import { ui } from '@/lib/i18n/ui';

import { useState, type FormEvent } from 'react';
import {
  Plus,
  Search,
  ArrowUp,
  ArrowDown,
  Play,
  Archive,
  ArchiveRestore,
  Leaf,
  ArrowUpRight,
  Pencil,
  Link as LinkIcon,
} from 'lucide-react';
import { useApp, addEvent } from './app-context';
import {
  Button,
  IconButton,
  Field,
  Dialog,
  FormActions,
  Empty,
  Panel,
  ColorDot,
  Markdown,
} from './ui';
import { en } from '@/lib/i18n/en';
import { id, type Subject, type Project } from '@/lib/model';
import {
  completedSessions,
  focusMinutes,
  minutesLabel,
  formatDay,
  dateKey,
  startWeek,
} from '@/lib/display';
import { TaskRow } from './tasks';
import { SubjectNotes, SubjectCompletion } from './note-sheets';
import { learning } from '@/lib/i18n/learning';
export function SubjectsPage() {
  const { store, openSubject, canEdit } = useApp();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('active');
  const subjects = store.data.subjects
    .filter(
      (s) =>
        (status === 'all' ||
          (status === 'archived'
            ? s.archived
            : status === 'completed'
              ? !!s.completedAt
              : !s.archived && !s.completedAt)) &&
        `${s.name} ${s.description}`.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => a.order - b.order);
  return (
    <>
      <div className="page-actions">
        <div className="search-input">
          <Search size={17} />
          <input
            placeholder={ui.subjects.findASubject}
            aria-label={ui.subjects.searchSubjects}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          aria-label={ui.subjects.subjectStatus}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="active">{ui.subjects.activeSubjects}</option>
          <option value="archived">{ui.subjects.archivedSubjects}</option>
          <option value="completed">{learning.completedSubjects}</option>
          <option value="all">{ui.subjects.allSubjects}</option>
        </select>
        <Button disabled={!canEdit} onClick={() => openSubject()}>
          <Plus size={16} />
          {en.subjects.add}
        </Button>
      </div>
      {subjects.length ? (
        <div className="subjects-grid">
          {subjects.map((subject) => (
            <SubjectCard key={subject.id} subject={subject} />
          ))}
        </div>
      ) : (
        <Empty title={en.subjects.empty} action={en.subjects.add} onAction={() => openSubject()} />
      )}
    </>
  );
}
export function SubjectCard({ subject, compact = false }: { subject: Subject; compact?: boolean }) {
  const { store, openSubject, canEdit } = useApp();
  const { data } = store;
  const sessions = completedSessions(data).filter((s) => s.context.subjectId === subject.id);
  const tasks = data.tasks.filter((t) => t.subjectId === subject.id);
  const week = startWeek(
    dateKey(new Date(), data.preferences.timeZone),
    data.preferences.weekStartsOn,
  );
  const today = dateKey(new Date(), data.preferences.timeZone);
  const minutes = focusMinutes(
    sessions.filter((s) => {
      const day = dateKey(s.endedAt, data.preferences.timeZone);
      return day >= week && day <= today;
    }),
  );
  return (
    <article className={`subject-card ${compact ? 'compact-subject' : ''}`}>
      <div className="row spread">
        <span
          className="subject-symbol"
          style={{ color: subject.color, backgroundColor: `${subject.color}18` }}
        >
          {subject.icon || <Leaf size={22} />}
        </span>
        {subject.archived && <span className="badge">{ui.subjects.archived}</span>}
        {subject.completedAt && <span className="badge">{learning.completedAt}</span>}
        <button
          className="icon-button"
          aria-label={`Open ${subject.name}`}
          onClick={() => openSubject(subject.id)}
        >
          <ArrowUpRight size={18} />
        </button>
      </div>
      <button className="subject-name" onClick={() => openSubject(subject.id)}>
        {subject.name}
      </button>
      {!compact && <p>{subject.description}</p>}
      <div className="subject-stats">
        <span>
          {tasks.filter((t) => t.status !== 'done').length} {ui.subjects.activeTasks}
        </span>
        <span>
          {minutesLabel(focusMinutes(sessions))} {ui.subjects.focused}
        </span>
      </div>
      <div className="goal-label">
        <span>{ui.subjects.weeklyGoal}</span>
        <strong>
          {minutesLabel(minutes)} {ui.subjects.copy} {minutesLabel(subject.weeklyGoal)}
        </strong>
      </div>
      <progress
        value={Math.min(minutes, subject.weeklyGoal)}
        max={subject.weeklyGoal || 1}
        style={{ accentColor: subject.color }}
      />
      {!compact && (
        <div className="subject-actions">
          <Button
            variant="ghost"
            disabled={!canEdit || subject.archived || data.timer.status !== 'idle'}
            onClick={() => store.startTimer({ subjectId: subject.id })}
          >
            <Play size={14} />
            {en.timer.focus}
          </Button>
          <div className="row">
            {[-1, 1].map((direction) => (
              <IconButton
                key={direction}
                label={direction < 0 ? ui.subjects.moveSubjectUp : ui.subjects.moveSubjectDown}
                disabled={!canEdit}
                onClick={() =>
                  store.update((d) => {
                    const ordered = [...d.subjects].sort((a, b) => a.order - b.order);
                    const index = ordered.findIndex((s) => s.id === subject.id);
                    const target = index + direction;
                    if (target >= 0 && target < ordered.length) {
                      [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
                      ordered.forEach((s, i) => {
                        s.order = i;
                      });
                    }
                  })
                }
              >
                {direction < 0 ? <ArrowUp size={15} /> : <ArrowDown size={15} />}
              </IconButton>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}
export function SubjectsWidget() {
  const { store, navigate, openSubject, canEdit } = useApp();
  return (
    <Panel
      title={ui.subjects.aLittleGrowthInEveryDirection}
      subtitle={ui.subjects.yourSubjectsEachWithTheirOwnRhythm}
      action={
        <Button variant="ghost" onClick={() => navigate('subjects')}>
          {ui.subjects.allSubjects}
          <ArrowUpRight size={15} />
        </Button>
      }
    >
      <div className="subject-widget-grid">
        {store.data.subjects
          .filter((s) => !s.archived && !s.completedAt)
          .sort((a, b) => a.order - b.order)
          .slice(0, 3)
          .map((s) => (
            <SubjectCard key={s.id} subject={s} compact />
          ))}
      </div>
      {!store.data.subjects.some((s) => !s.archived) && (
        <Empty
          title={en.subjects.empty}
          action={canEdit ? en.subjects.add : undefined}
          onAction={() => openSubject()}
        />
      )}
    </Panel>
  );
}
export function SubjectEditor({ subjectId, onClose }: { subjectId?: string; onClose: () => void }) {
  const { store, notify, canEdit, openTask, openPlan } = useApp();
  const { data } = store;
  const subject = data.subjects.find((s) => s.id === subjectId);
  const [editing, setEditing] = useState(!subject);
  const [tab, setTab] = useState('overview');
  const [error, setError] = useState('');
  const [archiving, setArchiving] = useState(false);
  const [resource, setResource] = useState(false);
  const [project, setProject] = useState(false);
  const [projectEditId, setProjectEditId] = useState<string | null>(null);
  const [projectArchive, setProjectArchive] = useState<Project | null>(null);
  const [color, setColor] = useState(subject?.color || '#708c64');
  const sessions = completedSessions(data).filter((s) => s.context.subjectId === subjectId);
  const today = dateKey(new Date(), data.preferences.timeZone);
  const week = startWeek(today, data.preferences.weekStartsOn);
  const weekMinutes = focusMinutes(
    sessions.filter((session) => {
      const day = dateKey(session.endedAt, data.preferences.timeZone);
      return day >= week && day <= today;
    }),
  );
  const monthMinutes = focusMinutes(
    sessions.filter((session) => {
      const day = dateKey(session.endedAt, data.preferences.timeZone);
      return day.slice(0, 7) === today.slice(0, 7) && day <= today;
    }),
  );
  const editedProject = data.projects.find((item) => item.id === projectEditId);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const now = new Date().toISOString();
    const record: Subject = {
      id: subject?.id || id(),
      workspaceId: data.workspaceId,
      name: String(form.get('name')),
      description: String(form.get('description')),
      icon: String(form.get('icon')) || '✦',
      color,
      archived: subject?.archived || false,
      completedAt: subject?.completedAt,
      targetDate: String(form.get('target')) || undefined,
      weeklyGoal: Number(form.get('goal')),
      defaultPresetId: String(form.get('preset')) || undefined,
      resources: subject?.resources || [],
      order: subject?.order ?? data.subjects.length,
      createdAt: subject?.createdAt || now,
      updatedAt: now,
    };
    const ok = await store.update((d) => {
      if (subject) d.subjects = d.subjects.map((s) => (s.id === subject.id ? record : s));
      else d.subjects.push(record);
      addEvent(d, subject ? 'subject_updated' : 'subject_created', record.name, {
        subjectId: record.id,
        userId: store.user?.id,
      });
    });
    if (ok) {
      notify(subject ? ui.subjects.subjectUpdated : ui.subjects.aNewSpaceToGrow);
      onClose();
    } else setError(ui.subjects.pleaseCheckTheFieldsTheSubjectCouldNotBe);
  }
  return (
    <Dialog wide title={subject?.name || en.subjects.add} onClose={onClose}>
      {(error || store.error) && (
        <p className="error" role="alert">
          {store.error || error}
        </p>
      )}
      {editing ? (
        <form onSubmit={save}>
          <div className="form-grid">
            <Field label={en.subjects.name}>
              <input
                name="name"
                required
                maxLength={100}
                defaultValue={subject?.name || ''}
                placeholder={ui.subjects.eGLearningJapanese}
                autoFocus
                data-autofocus
              />
            </Field>
            <Field label={en.subjects.icon}>
              <select name="icon" defaultValue={subject?.icon || '✦'}>
                {['✦', '⌘', '▤', '◈', '☘', '◎', 'Aa'].map((icon) => (
                  <option key={icon}>{icon}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label={en.subjects.description}>
            <textarea
              name="description"
              rows={3}
              defaultValue={subject?.description || ''}
              maxLength={20000}
            />
          </Field>
          <div className="form-grid">
            <Field label={en.subjects.color}>
              <div className="color-input">
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
                <span>{color}</span>
              </div>
            </Field>
            <Field label={en.subjects.goal}>
              <input
                name="goal"
                type="number"
                min={0}
                max={1000}
                defaultValue={subject?.weeklyGoal ?? 120}
                required
              />
            </Field>
            <Field label={en.subjects.target}>
              <input name="target" type="date" defaultValue={subject?.targetDate} />
            </Field>
            <Field label={ui.subjects.defaultTimerPreset}>
              <select name="preset" defaultValue={subject?.defaultPresetId || ''}>
                <option value="">{ui.subjects.defaultPomodoro}</option>
                {data.preferences.presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <FormActions
            onClose={() => (subject ? setEditing(false) : onClose())}
            submit={subject ? en.common.save : en.subjects.add}
          />
        </form>
      ) : (
        subject && (
          <>
            <div className="subject-detail-heading">
              <span
                className="subject-symbol large"
                style={{ color: subject.color, backgroundColor: `${subject.color}18` }}
              >
                {subject.icon}
              </span>
              <div>
                <Markdown text={subject.description} />
                {subject.targetDate && (
                  <small className="muted">
                    {ui.subjects.target} {subject.targetDate}
                  </small>
                )}
              </div>
              {canEdit && (
                <IconButton label={en.common.edit} onClick={() => setEditing(true)}>
                  <Pencil size={17} />
                </IconButton>
              )}
            </div>
            <SubjectCompletion subjectId={subject.id} />
            <div className="detail-tabs">
              {['overview', 'tasks', 'notes', 'history'].map((value) => (
                <button
                  key={value}
                  onClick={() => setTab(value)}
                  className={tab === value ? 'active' : ''}
                >
                  {value === 'overview'
                    ? ui.subjects.overview
                    : value === 'tasks'
                      ? ui.subjects.tasksProjects
                      : value === 'notes'
                        ? learning.notesTab
                        : ui.subjects.subjectHistory}
                </button>
              ))}
            </div>
            {tab === 'notes' && <SubjectNotes subjectId={subject.id} />}
            {tab === 'overview' && (
              <>
                <div className="mini-metrics">
                  <div>
                    <strong>{minutesLabel(focusMinutes(sessions))}</strong>
                    <span>{ui.subjects.completedFocus}</span>
                  </div>
                  <div>
                    <strong>{sessions.length}</strong>
                    <span>{ui.subjects.pomodoros}</span>
                  </div>
                  <div>
                    <strong>{minutesLabel(subject.weeklyGoal)}</strong>
                    <span>{ui.subjects.weeklyGoal}</span>
                  </div>
                </div>
                <div className="mini-metrics">
                  <div>
                    <strong>{minutesLabel(weekMinutes)}</strong>
                    <span>{ui.subjects.thisWeek}</span>
                  </div>
                  <div>
                    <strong>{minutesLabel(monthMinutes)}</strong>
                    <span>{ui.subjects.thisMonth}</span>
                  </div>
                  <div>
                    <strong>
                      {subject.weeklyGoal
                        ? `${Math.min(100, Math.round((weekMinutes / subject.weeklyGoal) * 100))}%`
                        : ui.subjects.copy2}
                    </strong>
                    <span>{ui.subjects.weeklyFocusGoal}</span>
                  </div>
                </div>
                <h3>{ui.subjects.plannedSessions}</h3>
                {data.plannedSessions
                  .filter((p) => p.subjectId === subject.id)
                  .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
                  .slice(0, 8)
                  .map((p) => (
                    <button
                      className="session-item"
                      key={p.id}
                      onClick={() => {
                        onClose();
                        openPlan(p.id);
                      }}
                    >
                      <span>
                        {p.title}
                        <small>{formatDay(p.startsAt, data.preferences)}</small>
                      </span>
                      <strong>
                        {p.durationMinutes}
                        {ui.subjects.m}
                      </strong>
                    </button>
                  ))}
                {!data.plannedSessions.some((p) => p.subjectId === subject.id) && (
                  <p className="helper">{ui.subjects.aLittleSpaceInYourWeekIsAllIt}</p>
                )}
                <div className="resource-section">
                  <div className="row spread">
                    <h3>{en.subjects.resources}</h3>
                    {canEdit && (
                      <IconButton
                        label={ui.subjects.addSubjectResource}
                        onClick={() => setResource(!resource)}
                      >
                        <Plus size={16} />
                      </IconButton>
                    )}
                  </div>
                  {subject.resources.map((r) => (
                    <a
                      className="resource-link"
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      key={r.id}
                    >
                      <LinkIcon size={14} />
                      {r.title}
                      <ArrowUpRight size={14} />
                    </a>
                  ))}
                  {resource && (
                    <form
                      className="inline-form wrap"
                      onSubmit={async (event) => {
                        event.preventDefault();
                        const f = new FormData(event.currentTarget);
                        const ok = await store.update((d) => {
                          d.subjects
                            .find((s) => s.id === subject.id)!
                            .resources.push({
                              id: id(),
                              title: String(f.get('title')),
                              url: String(f.get('url')),
                            });
                        });
                        if (ok) setResource(false);
                      }}
                    >
                      <input
                        name="title"
                        required
                        placeholder={ui.subjects.resourceTitle}
                        aria-label={ui.subjects.resourceTitle}
                      />
                      <input
                        name="url"
                        required
                        type="url"
                        placeholder={ui.subjects.https}
                        aria-label={ui.subjects.resourceUrl}
                      />
                      <Button type="submit">{ui.subjects.add}</Button>
                    </form>
                  )}
                </div>
              </>
            )}
            {tab === 'tasks' && (
              <>
                <div className="row spread">
                  <h3>{en.subjects.projects}</h3>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      disabled={subject.archived}
                      onClick={() => {
                        setProjectEditId(null);
                        setProject(!project);
                      }}
                    >
                      <Plus size={15} />
                      {en.subjects.newProject}
                    </Button>
                  )}
                </div>
                {data.projects
                  .filter((p) => p.subjectId === subject.id)
                  .map((p) => (
                    <div className="project-item" key={p.id}>
                      <ColorDot color={subject.color} />
                      <strong>{p.name}</strong>
                      <span>
                        {data.tasks.filter((t) => t.projectId === p.id).length} {ui.subjects.tasks}
                      </span>
                      {p.archived && <span className="badge">{ui.subjects.archived}</span>}
                      {canEdit && (
                        <>
                          <IconButton
                            label={`Edit ${p.name}`}
                            onClick={() => {
                              setProjectEditId(p.id);
                              setProject(true);
                            }}
                          >
                            <Pencil size={14} />
                          </IconButton>
                          <IconButton
                            label={`${p.archived ? 'Restore' : 'Archive'} ${p.name}`}
                            onClick={() => setProjectArchive(p)}
                          >
                            {p.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                          </IconButton>
                        </>
                      )}
                    </div>
                  ))}
                {project && (
                  <form
                    className="inline-form wrap"
                    key={projectEditId || 'new-project'}
                    onSubmit={async (event) => {
                      event.preventDefault();
                      const f = new FormData(event.currentTarget);
                      const now = new Date().toISOString();
                      const ok = await store.update((d) => {
                        const record: Project = {
                          id: editedProject?.id || id(),
                          workspaceId: d.workspaceId,
                          name: String(f.get('name')),
                          description: String(f.get('description')),
                          subjectId: subject.id,
                          archived: editedProject?.archived || false,
                          createdAt: editedProject?.createdAt || now,
                          updatedAt: now,
                        };
                        if (editedProject)
                          d.projects = d.projects.map((item) =>
                            item.id === record.id ? record : item,
                          );
                        else d.projects.push(record);
                        addEvent(
                          d,
                          'subject_updated',
                          `${editedProject ? 'Updated' : 'Created'} project: ${record.name}`,
                          { subjectId: subject.id, projectId: record.id, userId: store.user?.id },
                        );
                      });
                      if (ok) setProject(false);
                    }}
                  >
                    <input
                      name="name"
                      required
                      placeholder={ui.subjects.projectName}
                      aria-label={ui.subjects.projectName}
                      maxLength={150}
                      defaultValue={editedProject?.name || ''}
                    />
                    <textarea
                      name="description"
                      aria-label={ui.subjects.projectDescription}
                      placeholder={ui.subjects.projectDescription}
                      defaultValue={editedProject?.description || ''}
                      maxLength={20000}
                    />
                    <Button type="submit">
                      {editedProject ? ui.subjects.saveProject : ui.subjects.createProject}
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setProject(false)}>
                      {en.common.cancel}
                    </Button>
                  </form>
                )}
                <h3>{en.navigation.tasks}</h3>
                {data.tasks
                  .filter((t) => t.subjectId === subject.id)
                  .map((t) => (
                    <TaskRow key={t.id} task={t} />
                  ))}
                {canEdit && (
                  <button
                    className="add-row"
                    onClick={() => {
                      onClose();
                      openTask();
                    }}
                  >
                    <Plus size={15} />
                    {en.tasks.add}
                  </button>
                )}
              </>
            )}
            {tab === 'history' && (
              <>
                {data.events
                  .filter((e) => e.subjectId === subject.id)
                  .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
                  .map((e) => (
                    <div className="timeline-item" key={e.id}>
                      <span className="timeline-dot" />
                      <div>
                        <strong>{e.type.replaceAll('_', ' ')}</strong>
                        <p>
                          {e.taskTitle && `${e.taskTitle} · `}
                          {e.details}
                        </p>
                        <time>{formatDay(e.timestamp, data.preferences)}</time>
                      </div>
                    </div>
                  ))}
                {!data.events.some((e) => e.subjectId === subject.id) && (
                  <Empty title={en.history.empty} />
                )}
              </>
            )}
            {canEdit && (
              <div className="record-actions">
                <Button
                  disabled={subject.archived || data.timer.status !== 'idle'}
                  onClick={async () => {
                    if (await store.startTimer({ subjectId: subject.id })) {
                      notify(ui.subjects.yourFocusSessionHasStarted);
                      onClose();
                    }
                  }}
                >
                  <Play size={15} />
                  {en.subjects.start}
                </Button>
                <Button variant="ghost" onClick={() => setArchiving(true)}>
                  {subject.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                  {subject.archived ? en.subjects.restore : en.subjects.archive}
                </Button>
              </div>
            )}
          </>
        )
      )}
      {projectArchive && subject && (
        <Dialog
          title={`${projectArchive.archived ? 'Restore' : 'Archive'} this project?`}
          onClose={() => setProjectArchive(null)}
        >
          <p>{ui.subjects.itsTasksAndCompletedFocusHistoryWillBePreserved}</p>
          {store.error && (
            <p className="error" role="alert">
              {store.error}
            </p>
          )}
          <div className="form-actions">
            <Button variant="secondary" onClick={() => setProjectArchive(null)}>
              {en.common.cancel}
            </Button>
            <Button
              onClick={async () => {
                const ok = await store.update((draft) => {
                  const record = draft.projects.find((item) => item.id === projectArchive.id)!;
                  record.archived = !record.archived;
                  record.updatedAt = new Date().toISOString();
                  addEvent(
                    draft,
                    'subject_updated',
                    `${record.archived ? 'Archived' : 'Restored'} project: ${record.name}`,
                    { subjectId: subject.id, projectId: record.id, userId: store.user?.id },
                  );
                });
                if (ok) setProjectArchive(null);
              }}
            >
              {projectArchive.archived ? en.subjects.restore : en.subjects.archive}
            </Button>
          </div>
        </Dialog>
      )}
      {archiving && subject && (
        <Dialog
          title={subject.archived ? ui.subjects.restoreThisSubject : ui.subjects.archiveThisSubject}
          onClose={() => setArchiving(false)}
        >
          {store.error && (
            <p className="error" role="alert">
              {store.error}
            </p>
          )}
          <p>
            {subject.archived
              ? ui.subjects.thisSubjectWillBeAvailableForNewWorkAgain
              : ui.subjects.itsHistoryAndTasksWillBePreservedRestoreIt}
          </p>
          <div className="form-actions">
            <Button variant="secondary" onClick={() => setArchiving(false)}>
              {en.common.cancel}
            </Button>
            <Button
              onClick={async () => {
                const ok = await store.update((d) => {
                  d.subjects.find((s) => s.id === subject.id)!.archived = !subject.archived;
                  addEvent(
                    d,
                    subject.archived ? 'subject_restored' : 'subject_archived',
                    subject.name,
                    { subjectId: subject.id, userId: store.user?.id },
                  );
                });
                if (ok) {
                  setArchiving(false);
                  notify(
                    subject.archived ? ui.subjects.subjectRestored : ui.subjects.subjectArchived,
                  );
                }
              }}
            >
              {subject.archived ? en.subjects.restore : en.subjects.archive}
            </Button>
          </div>
        </Dialog>
      )}
    </Dialog>
  );
}
