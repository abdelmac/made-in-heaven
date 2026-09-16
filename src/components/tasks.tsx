'use client';
import { ui } from '@/lib/i18n/ui';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { paid } from '@/lib/i18n/paid';
import {
  Plus,
  Search,
  LayoutList,
  Columns3,
  Play,
  Check,
  Clock3,
  Trash2,
  ArrowUpRight,
  MessageSquare,
  Link as LinkIcon,
  Pencil,
} from 'lucide-react';
import { useApp, addEvent, changeTaskStatus } from './app-context';
import {
  Button,
  IconButton,
  Field,
  Dialog,
  Empty,
  Panel,
  ColorDot,
  Markdown,
  TextLink,
} from './ui';
import { en } from '@/lib/i18n/en';
import { id, LOCAL_USER_ID, type Task, type JournalEntry } from '@/lib/model';
import { createTaskOccurrences, type RepeatOptions } from '@/lib/recurrence';
import { RecurrenceFields } from './recurrence-fields';
import {
  completedSessions,
  focusMinutes,
  minutesLabel,
  formatDay,
  formatTime,
} from '@/lib/display';

const statuses = Object.keys(en.statuses) as Task['status'][];
type AssignableMember = { user_id: string; display_name: string };
function useAssignableMembers() {
  const { store } = useApp();
  const [result, setResult] = useState<{
    workspaceId: string;
    members: AssignableMember[];
    error?: string;
  } | null>(null);
  const shared = store.isCloud && store.currentWorkspace?.kind === 'organization';
  useEffect(() => {
    if (!shared) return;
    const controller = new AbortController();
    void fetch(`/api/workspaces?workspaceId=${encodeURIComponent(store.workspaceId)}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error || "Impossible de charger les membres de l'espace.");
        setResult({ workspaceId: store.workspaceId, members: body.members });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResult({
            workspaceId: store.workspaceId,
            members: [],
            error:
              error instanceof Error
                ? error.message
                : "Les membres de l'espace sont indisponibles hors ligne.",
          });
      });
    return () => controller.abort();
  }, [shared, store.workspaceId]);
  return {
    shared,
    members: result?.workspaceId === store.workspaceId ? result.members : [],
    error: result?.workspaceId === store.workspaceId ? result.error : undefined,
  };
}
const templates: Record<string, { description: string; checklist: string[] }> = {
  'Study session': {
    description:
      "## Objectif d'apprentissage\n\nQue souhaitez-vous comprendre ?\n\n## Idées clés\n\n",
    checklist: [
      'Relire les notes précédentes',
      'Étudier le concept principal',
      "S'exercer sans les notes",
      "Résumer ce que j'ai appris",
    ],
  },
  'Reading and notes': {
    description: '## Lecture\n\n## Notes\n\n## Questions à explorer\n\n',
    checklist: ['Lire le document', 'Noter les idées clés', 'Écrire un court résumé'],
  },
  Writing: {
    description: '## Objectif\n\n## Plan\n\n## Brouillon\n\n',
    checklist: [
      'Définir les points principaux',
      'Écrire un premier brouillon',
      'Améliorer la clarté',
      'Relire et corriger',
    ],
  },
  'Software development': {
    description: "## Critères d'acceptation\n\n- \n\n## Notes de réalisation\n\n## Dépôt\n\n",
    checklist: [
      "Clarifier les critères d'acceptation",
      'Réaliser la modification',
      'Ajouter des tests pertinents',
      'Exécuter les vérifications',
      'Examiner le résultat',
    ],
  },
};
const templateLabels: Record<string, string> = {
  'Study session': 'Séance de révision',
  'Reading and notes': 'Lecture et notes',
  Writing: 'Rédaction',
  'Software development': 'Développement logiciel',
};
export function TaskRow({ task }: { task: Task }) {
  const { store, openTask, canEdit, notify } = useApp();
  const subject = store.data.subjects.find((s) => s.id === task.subjectId);
  const done = task.status === 'done';
  const sessions = completedSessions(store.data).filter((s) => s.context.taskId === task.id);
  return (
    <div className={`task-row ${done ? 'is-done' : ''}`}>
      <button
        className="task-check"
        aria-label={`${done ? 'Rouvrir' : 'Terminer'} ${task.title}`}
        aria-pressed={done}
        disabled={!canEdit}
        onClick={async () => {
          try {
            await store.update((d) =>
              changeTaskStatus(d, task, done ? 'todo' : 'done', store.user?.id),
            );
          } catch (e) {
            notify(String(e));
          }
        }}
      >
        {done && <Check size={13} />}
      </button>
      <button className="task-main" onClick={() => openTask(task.id)}>
        <strong>{task.title}</strong>
        <span>
          {subject && (
            <>
              <ColorDot color={subject.color} />
              {subject.name}
              <span className="middle-dot">{ui.tasks.copy}</span>
            </>
          )}
          <span>
            {sessions.length}
            {ui.tasks.copy2}
            {task.estimatedPomodoros} {ui.tasks.pomodoros}
          </span>
          {task.dueDate && (
            <>
              <span className="middle-dot">{ui.tasks.copy}</span>
              <span>{task.dueDate}</span>
            </>
          )}
        </span>
      </button>
      <span className={`priority priority-${task.priority}`}>{en.priorities[task.priority]}</span>
      <IconButton
        label={`${en.timer.start}: ${task.title}`}
        disabled={!canEdit || store.data.timer.status !== 'idle' || !!subject?.archived}
        onClick={async () => {
          try {
            const saved = await store.startTimer({
              taskId: task.id,
              subjectId: task.subjectId,
              projectId: task.projectId,
            });
            if (saved) notify(ui.tasks.yourFocusSessionHasStarted);
          } catch (e) {
            notify(String(e));
          }
        }}
      >
        <Play size={15} />
      </IconButton>
    </div>
  );
}
export function TasksWidget() {
  const { store, openTask, navigate, canEdit } = useApp();
  return (
    <Panel
      title={en.overview.tasks}
      subtitle={en.overview.tasksSubtitle}
      action={<TextLink onClick={() => navigate('tasks')}>{en.overview.viewTasks}</TextLink>}
    >
      {store.data.tasks
        .filter((t) => t.status !== 'done')
        .slice(0, 4)
        .map((task) => (
          <TaskRow key={task.id} task={task} />
        ))}
      {!store.data.tasks.some((t) => t.status !== 'done') && (
        <Empty title={en.overview.emptyTasks} />
      )}
      <button className="add-row" disabled={!canEdit} onClick={() => openTask()}>
        <Plus size={16} />
        {en.overview.addTask}
      </button>
    </Panel>
  );
}
export function TasksPage() {
  const { store, openTask, canEdit } = useApp();
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [project, setProject] = useState('');
  const [sort, setSort] = useState('created');
  const [board, setBoard] = useState(false);
  const [assignee, setAssignee] = useState('');
  const assignments = useAssignableMembers();
  const tasks = store.data.tasks
    .filter(
      (t) =>
        (!subject || t.subjectId === subject) &&
        (!project || t.projectId === project) &&
        (!status || t.status === status) &&
        (!priority || t.priority === priority) &&
        (!assignee || (assignee === 'unassigned' ? !t.assigneeId : t.assigneeId === assignee)) &&
        `${t.title} ${t.description} ${t.tags.join(' ')}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      sort === 'title'
        ? a.title.localeCompare(b.title)
        : sort === 'due'
          ? (a.dueDate || '9999').localeCompare(b.dueDate || '9999')
          : b.createdAt.localeCompare(a.createdAt),
    );
  return (
    <>
      <div className="page-actions">
        <div className="search-input">
          <Search size={17} />
          <input
            aria-label={ui.tasks.searchTasks}
            placeholder={ui.tasks.findATask}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="segmented">
          <button className={!board ? 'active' : ''} onClick={() => setBoard(false)}>
            <LayoutList size={16} />
            {en.tasks.list}
          </button>
          <button className={board ? 'active' : ''} onClick={() => setBoard(true)}>
            <Columns3 size={16} />
            {en.tasks.board}
          </button>
        </div>
        <Button disabled={!canEdit} onClick={() => openTask()}>
          <Plus size={16} />
          {en.tasks.add}
        </Button>
      </div>
      <div className="filters">
        {assignments.shared && (
          <select
            aria-label={ui.tasks.taskAssigneeFilter}
            value={assignee}
            onChange={(event) => setAssignee(event.target.value)}
          >
            <option value="">{ui.tasks.allAssignees}</option>
            <option value="unassigned">{ui.tasks.unassigned}</option>
            <option value={store.userId}>{ui.tasks.assignedToMe}</option>
            {assignments.members
              .filter((member) => member.user_id !== store.userId)
              .map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  {member.display_name}
                </option>
              ))}
          </select>
        )}
        <select
          aria-label={en.tasks.subject}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        >
          <option value="">{ui.tasks.allSubjects}</option>
          {store.data.subjects.map((s) => (
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
          <option value="">{ui.tasks.allProjects}</option>
          {store.data.projects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          aria-label={en.tasks.status}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">{ui.tasks.allStatuses}</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {en.statuses[s]}
            </option>
          ))}
        </select>
        <select
          aria-label={en.tasks.priority}
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
        >
          <option value="">{ui.tasks.allPriorities}</option>
          {Object.entries(en.priorities).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label={ui.tasks.sortTasks}
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="created">{ui.tasks.newestFirst}</option>
          <option value="title">{ui.tasks.titleAZ}</option>
          <option value="due">{ui.tasks.dueDate}</option>
        </select>
      </div>
      {board ? (
        <div className="board-scroller">
          <div className="kanban">
            {statuses.map((s) => (
              <section key={s} className="kanban-column">
                <h3>
                  <span className={`status-dot status-${s}`} />
                  {en.statuses[s]}
                  <span>{tasks.filter((t) => t.status === s).length}</span>
                </h3>
                {tasks
                  .filter((t) => t.status === s)
                  .map((task) => (
                    <div className="kanban-card" key={task.id}>
                      <button className="kanban-title" onClick={() => openTask(task.id)}>
                        {task.title}
                      </button>
                      <div className="row">
                        <ColorDot
                          color={store.data.subjects.find((s) => s.id === task.subjectId)?.color}
                        />
                        <small>
                          {store.data.subjects.find((s) => s.id === task.subjectId)?.name ||
                            en.common.unassigned}
                        </small>
                      </div>
                      <select
                        aria-label={`Déplacer ${task.title}`}
                        disabled={!canEdit}
                        value={task.status}
                        onChange={(e) =>
                          store.update((d) =>
                            changeTaskStatus(
                              d,
                              task,
                              e.target.value as Task['status'],
                              store.user?.id,
                            ),
                          )
                        }
                      >
                        {statuses.map((value) => (
                          <option key={value} value={value}>
                            {en.statuses[value]}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                <button className="add-row" disabled={!canEdit} onClick={() => openTask()}>
                  <Plus size={15} />
                  {en.overview.addTask}
                </button>
              </section>
            ))}
          </div>
        </div>
      ) : (
        <section className="panel task-list">
          {tasks.length ? (
            tasks.map((task) => <TaskRow key={task.id} task={task} />)
          ) : (
            <Empty title={en.common.noResults} action={en.tasks.add} onAction={() => openTask()} />
          )}
        </section>
      )}
    </>
  );
}

export function TaskEditor({ taskId, onClose }: { taskId?: string; onClose: () => void }) {
  const { store, notify, canEdit } = useApp();
  const { data } = store;
  const task = data.tasks.find((t) => t.id === taskId);
  const [tab, setTab] = useState('overview');
  const [subjectId, setSubject] = useState(task?.subjectId || '');
  const [projectId, setProject] = useState(task?.projectId || '');
  const [description, setDescription] = useState(task?.description || '');
  const [template, setTemplate] = useState('');
  const [templateChecklist, setTemplateChecklist] = useState<string[]>([]);
  const [templateLoading, setTemplateLoading] = useState(false);
  const templateRequest = useRef<AbortController | null>(null);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [noteEdit, setNoteEdit] = useState<JournalEntry | null>(null);
  const [resource, setResource] = useState(false);
  const [repeat, setRepeat] = useState<RepeatOptions>({ frequency: 'none', count: 4 });
  const assignments = useAssignableMembers();
  const sessions = completedSessions(data).filter((s) => s.context.taskId === taskId);
  const notes = data.journal
    .filter((n) => n.taskId === taskId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const activity = data.events.filter((e) => e.taskId === taskId);
  const tabs = ['overview', 'subtasks', 'development', 'sessions', 'activity'] as const;
  useEffect(() => () => templateRequest.current?.abort(), [store.workspaceId]);
  async function applyTemplate(selected: string) {
    templateRequest.current?.abort();
    setError('');
    if (selected === 'Software development' && store.isCloud) {
      const controller = new AbortController();
      templateRequest.current = controller;
      setTemplateLoading(true);
      try {
        const response = await fetch(
          `/api/templates?workspaceId=${encodeURIComponent(store.workspaceId)}&template=software-development`,
          { cache: 'no-store', signal: controller.signal },
        );
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || paid.templateUnavailable);
        if (controller.signal.aborted) return;
        setTemplate(selected);
        setDescription(body.template.description);
        setTemplateChecklist(body.template.checklist.map((item: { text: string }) => item.text));
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : paid.templateUnavailable);
      } finally {
        if (!controller.signal.aborted) setTemplateLoading(false);
      }
      return;
    }
    setTemplate(selected);
    setTemplateChecklist(templates[selected]?.checklist || []);
    if (templates[selected]) setDescription(templates[selected].description);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (templateLoading) return;
    const f = new FormData(event.currentTarget);
    try {
      const now = new Date().toISOString();
      const record: Task = {
        id: task?.id || id(),
        workspaceId: data.workspaceId,
        title: String(f.get('title')),
        description,
        subjectId: subjectId || undefined,
        projectId: projectId || undefined,
        status: String(f.get('status')) as Task['status'],
        priority: String(f.get('priority')) as Task['priority'],
        dueDate: String(f.get('due')) || undefined,
        tags: String(f.get('tags'))
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        estimatedPomodoros: Number(f.get('estimate')),
        assigneeId: f.has('assignee') ? String(f.get('assignee')) || undefined : task?.assigneeId,
        checklist:
          task?.checklist || templateChecklist.map((text) => ({ id: id(), text, done: false })),
        resources: task?.resources || [],
        createdAt: task?.createdAt || now,
        updatedAt: now,
      };
      const occurrences = task ? [record] : createTaskOccurrences(record, repeat);
      const saved = await store.update((d) => {
        if (task) {
          d.tasks = d.tasks.map((t) => (t.id === task.id ? record : t));
          d.plannedSessions = d.plannedSessions.map((p) =>
            p.taskId === task.id
              ? { ...p, subjectId: record.subjectId, projectId: record.projectId }
              : p,
          );
        } else d.tasks.unshift(...occurrences);
        for (const occurrence of occurrences)
          addEvent(
            d,
            task ? 'task_updated' : 'task_created',
            task ? 'Détails de la tâche mis à jour.' : 'Tâche créée.',
            { taskId: occurrence.id, subjectId: occurrence.subjectId, userId: store.user?.id },
          );
        if (task && task.status !== record.status)
          addEvent(
            d,
            record.status === 'done' ? 'task_completed' : 'status_changed',
            `${en.statuses[task.status]} → ${en.statuses[record.status]}`,
            { taskId: record.id, subjectId: record.subjectId, userId: store.user?.id },
          );
      });
      if (!saved) return;
      notify(
        occurrences.length > 1
          ? `${occurrences.length} tâches récurrentes créées.`
          : task
            ? ui.tasks.taskUpdated
            : ui.tasks.yourNextStepIsReady,
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  async function addNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!task) return;
    const f = new FormData(event.currentTarget);
    const form = event.currentTarget;
    const content = String(f.get('content'));
    try {
      const saved = await store.update((d) => {
        const now = new Date().toISOString();
        if (noteEdit) {
          const n = d.journal.find((n) => n.id === noteEdit.id)!;
          n.revisions.push({ content: n.content, editedAt: now });
          n.content = content;
          n.kind = String(f.get('kind')) as JournalEntry['kind'];
          n.sessionId = String(f.get('session')) || undefined;
          n.updatedAt = now;
          addEvent(d, 'journal_edited', content.slice(0, 180), {
            taskId: task.id,
            subjectId: task.subjectId,
            userId: store.user?.id,
          });
        } else {
          d.journal.unshift({
            id: id(),
            workspaceId: d.workspaceId,
            taskId: task.id,
            subjectId: task.subjectId,
            userId: store.user?.id || LOCAL_USER_ID,
            kind: String(f.get('kind')) as JournalEntry['kind'],
            content,
            sessionId: String(f.get('session')) || undefined,
            revisions: [],
            createdAt: now,
            updatedAt: now,
          });
          addEvent(d, 'journal_added', content.slice(0, 180), {
            taskId: task.id,
            subjectId: task.subjectId,
            userId: store.user?.id,
          });
        }
      });
      if (!saved) return;
      form.reset();
      setNoteEdit(null);
      notify(ui.tasks.developmentNoteSaved);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  return (
    <Dialog wide title={task?.title || en.tasks.add} onClose={onClose}>
      {task && (
        <>
          <div className="detail-meta">
            <span className={`status-badge status-${task.status}`}>{en.statuses[task.status]}</span>
            <span>
              <Clock3 size={14} />
              {minutesLabel(focusMinutes(sessions))} {ui.tasks.completed}
            </span>
            <span>
              {sessions.length} {ui.tasks.copy2} {task.estimatedPomodoros} {ui.tasks.pomodoros}
            </span>
          </div>
          <div className="detail-tabs">
            {tabs.map((value) => (
              <button
                key={value}
                className={tab === value ? 'active' : ''}
                onClick={() => setTab(value)}
              >
                {en.tasks[value]}
                {value === 'development' && notes.length > 0 && <small>{notes.length}</small>}
              </button>
            ))}
          </div>
        </>
      )}
      {(error || store.error) && (
        <p className="error" role="alert">
          {error || store.error}
        </p>
      )}
      {tab === 'overview' && (
        <form onSubmit={save}>
          {!task && (
            <Field label={en.tasks.template}>
              <select
                value={template}
                disabled={templateLoading}
                onChange={(e) => void applyTemplate(e.target.value)}
              >
                <option value="">{ui.tasks.blankTask}</option>
                {Object.keys(templates).map((t) => (
                  <option key={t} value={t}>
                    {templateLabels[t]}
                  </option>
                ))}
              </select>
              {store.isCloud && <small className="helper">{paid.templatePlan}</small>}
              {templateLoading && <span role="status">{paid.templateLoading}</span>}
            </Field>
          )}
          <Field label={en.tasks.titleField}>
            <input
              name="title"
              required
              maxLength={300}
              defaultValue={task?.title || ''}
              placeholder={ui.tasks.whatSYourNextSmallStep}
              autoFocus
              data-autofocus
            />
          </Field>
          <Field label={en.tasks.description}>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              maxLength={20000}
            />
          </Field>
          <details className="markdown-preview">
            <summary>{ui.tasks.previewDescription}</summary>
            <Markdown text={description} />
          </details>
          <div className="form-grid">
            <Field label={en.tasks.subject}>
              <select
                value={subjectId}
                onChange={(e) => {
                  setSubject(e.target.value);
                  setProject('');
                }}
              >
                <option value="">{en.common.unassigned}</option>
                {data.subjects
                  .filter((s) => !s.archived || s.id === task?.subjectId)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label={en.tasks.project}>
              <select value={projectId} onChange={(e) => setProject(e.target.value)}>
                <option value="">{en.common.none}</option>
                {data.projects
                  .filter((p) => !p.archived && p.subjectId === subjectId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label={en.tasks.status}>
              <select name="status" defaultValue={task?.status || 'todo'}>
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {en.statuses[s]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={en.tasks.priority}>
              <select name="priority" defaultValue={task?.priority || 'medium'}>
                {Object.entries(en.priorities).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={en.tasks.due}>
              <input
                type="date"
                name="due"
                defaultValue={task?.dueDate}
                required={!task && repeat.frequency !== 'none'}
              />
            </Field>
            <Field label={en.tasks.estimate}>
              <input
                type="number"
                name="estimate"
                min={0}
                max={10000}
                defaultValue={task?.estimatedPomodoros || 1}
                required
              />
            </Field>
          </div>
          {!task && <RecurrenceFields value={repeat} onChange={setRepeat} task />}
          <Field label={en.tasks.tags}>
            <input name="tags" defaultValue={task?.tags.join(', ') || ''} />
          </Field>
          {assignments.shared && (
            <Field label={ui.tasks.assignee}>
              <select
                name="assignee"
                defaultValue={task?.assigneeId || ''}
                disabled={!canEdit || assignments.members.length === 0}
              >
                <option value="">{ui.tasks.unassigned}</option>
                {task?.assigneeId &&
                  !assignments.members.some((member) => member.user_id === task.assigneeId) && (
                    <option value={task.assigneeId}>{ui.tasks.currentAssignee}</option>
                  )}
                {assignments.members.map((member) => (
                  <option key={member.user_id} value={member.user_id}>
                    {member.display_name}
                    {member.user_id === store.userId ? ui.tasks.you : ''}
                  </option>
                ))}
              </select>
              {assignments.error && (
                <span className="helper">
                  {assignments.error} {ui.tasks.theExistingAssigneeIsPreserved}
                </span>
              )}
            </Field>
          )}
          {canEdit && (
            <div className="form-actions">
              <Button type="button" variant="secondary" onClick={onClose}>
                {en.common.cancel}
              </Button>
              <Button type="submit" disabled={templateLoading}>
                {task ? en.common.save : en.tasks.add}
              </Button>
            </div>
          )}
        </form>
      )}
      {tab === 'subtasks' && task && (
        <div>
          <div className="subtask-progress">
            <strong>
              {task.checklist.filter((s) => s.done).length} {ui.tasks.of} {task.checklist.length}{' '}
              {ui.tasks.complete}
            </strong>
            <progress
              value={task.checklist.filter((s) => s.done).length}
              max={task.checklist.length || 1}
            />
          </div>
          {task.checklist.map((item) => (
            <div className="checklist-item" key={item.id}>
              <label>
                <input
                  type="checkbox"
                  checked={item.done}
                  disabled={!canEdit}
                  onChange={() =>
                    store.update((d) => {
                      const t = d.tasks.find((t) => t.id === task.id)!;
                      t.checklist = t.checklist.map((s) =>
                        s.id === item.id ? { ...s, done: !s.done } : s,
                      );
                      t.updatedAt = new Date().toISOString();
                      addEvent(
                        d,
                        'task_updated',
                        `${item.done ? 'Reopened' : 'Completed'} subtask: ${item.text}`,
                        { taskId: task.id, subjectId: task.subjectId, userId: store.user?.id },
                      );
                    })
                  }
                />
                <span className={item.done ? 'strikethrough' : ''}>{item.text}</span>
              </label>
              <IconButton
                label={`Remove ${item.text}`}
                disabled={!canEdit}
                onClick={() =>
                  store.update((d) => {
                    d.tasks.find((t) => t.id === task.id)!.checklist = d.tasks
                      .find((t) => t.id === task.id)!
                      .checklist.filter((s) => s.id !== item.id);
                  })
                }
              >
                <Trash2 size={15} />
              </IconButton>
            </div>
          ))}
          {canEdit && (
            <form
              className="inline-form"
              onSubmit={async (event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const text = String(new FormData(form).get('text'));
                const saved = await store.update((d) => {
                  d.tasks
                    .find((t) => t.id === task.id)!
                    .checklist.push({ id: id(), text, done: false });
                  addEvent(d, 'task_updated', `Added subtask: ${text}`, {
                    taskId: task.id,
                    subjectId: task.subjectId,
                    userId: store.user?.id,
                  });
                });
                if (saved) form.reset();
              }}
            >
              <input
                name="text"
                placeholder={en.tasks.addSubtask}
                aria-label={en.tasks.addSubtask}
                required
                maxLength={500}
              />
              <Button type="submit" variant="secondary">
                <Plus size={16} />
                {en.common.create}
              </Button>
            </form>
          )}
        </div>
      )}
      {tab === 'development' && task && (
        <>
          <p className="helper">{ui.tasks.keepFindingsDecisionsBlockersAndNextStepsTogether}</p>
          {canEdit && (
            <form onSubmit={addNote} className="journal-form" key={noteEdit?.id || 'new'}>
              <textarea
                name="content"
                required
                maxLength={20000}
                rows={4}
                defaultValue={noteEdit?.content || ''}
                placeholder={en.tasks.journalPlaceholder}
                aria-label={ui.tasks.developmentNote}
              />
              <div className="journal-form-footer">
                <select
                  name="kind"
                  aria-label={ui.tasks.noteType}
                  defaultValue={noteEdit?.kind || 'progress'}
                >
                  <option value="progress">{ui.tasks.progress}</option>
                  <option value="decision">{ui.tasks.decision}</option>
                  <option value="blocker">{ui.tasks.blocker}</option>
                  <option value="next_steps">{ui.tasks.nextSteps}</option>
                  <option value="reflection">{ui.tasks.reflection}</option>
                </select>
                <select
                  name="session"
                  aria-label={ui.tasks.linkFocusSession}
                  defaultValue={noteEdit?.sessionId || ''}
                >
                  <option value="">{ui.tasks.noLinkedSession}</option>
                  {data.focusSessions
                    .filter((s) => s.context.taskId === task.id)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {formatDay(s.endedAt, data.preferences)} {ui.tasks.copy} {s.durationMinutes}
                        {ui.tasks.m}
                      </option>
                    ))}
                </select>
                <Button type="submit">
                  <Plus size={15} />
                  {noteEdit ? en.common.save : en.tasks.addNote}
                </Button>
                {noteEdit && (
                  <Button variant="ghost" type="button" onClick={() => setNoteEdit(null)}>
                    {en.common.cancel}
                  </Button>
                )}
              </div>
            </form>
          )}
          {notes.length ? (
            notes.map((note) => (
              <article className="journal-entry" key={note.id}>
                <div className="row spread">
                  <span className={`note-kind ${note.kind}`}>
                    <MessageSquare size={13} />
                    {note.kind.replaceAll('_', ' ')}
                  </span>
                  <div className="row">
                    <time>
                      {formatDay(note.createdAt, data.preferences)} {ui.tasks.copy}{' '}
                      {formatTime(note.createdAt, data.preferences)}
                    </time>
                    {canEdit && (
                      <IconButton label={ui.tasks.editNote} onClick={() => setNoteEdit(note)}>
                        <Pencil size={14} />
                      </IconButton>
                    )}
                  </div>
                </div>
                <Markdown text={note.content} />
                {note.sessionId && (
                  <small className="muted">{ui.tasks.linkedToAFocusSession}</small>
                )}
                {note.revisions.length > 0 && (
                  <details>
                    <summary>
                      {note.revisions.length} {ui.tasks.previousRevision}
                      {note.revisions.length > 1 ? ui.tasks.s : ''}
                    </summary>
                    {note.revisions.map((r, i) => (
                      <div key={i}>
                        <time>{formatDay(r.editedAt, data.preferences)}</time>
                        <Markdown text={r.content} />
                      </div>
                    ))}
                  </details>
                )}
              </article>
            ))
          ) : (
            <Empty title={en.tasks.emptyJournal} />
          )}
        </>
      )}
      {tab === 'sessions' && (
        <>
          {data.focusSessions
            .filter((s) => s.context.taskId === taskId)
            .map((s) => (
              <div className="session-item" key={s.id}>
                <div>
                  <strong>{s.context.taskTitle || en.timer.focus}</strong>
                  <span>
                    {formatDay(s.endedAt, data.preferences)} {ui.tasks.copy}{' '}
                    {formatTime(s.endedAt, data.preferences)}
                  </span>
                </div>
                <span className="badge">{s.status}</span>
                <strong>{minutesLabel(s.actualSeconds / 60)}</strong>
              </div>
            ))}
          {!data.focusSessions.some((s) => s.context.taskId === taskId) && (
            <Empty title={ui.tasks.yourFocusedWorkWillAppearHere} />
          )}
        </>
      )}
      {tab === 'activity' && (
        <>
          {activity.map((e) => (
            <div className="timeline-item" key={e.id}>
              <span className="timeline-dot" />
              <div>
                <strong>{e.type.replaceAll('_', ' ')}</strong>
                <p>{e.details}</p>
                <time>
                  {formatDay(e.timestamp, data.preferences)} {ui.tasks.copy}{' '}
                  {formatTime(e.timestamp, data.preferences)}
                </time>
              </div>
            </div>
          ))}
          {!activity.length && <Empty title={en.history.empty} />}
        </>
      )}
      {task && (
        <>
          <div className="resource-section">
            <div className="row spread">
              <h3>{en.subjects.resources}</h3>
              {canEdit && (
                <IconButton label={ui.tasks.addResourceLink} onClick={() => setResource(!resource)}>
                  <Plus size={16} />
                </IconButton>
              )}
            </div>
            {task.resources.map((r) => (
              <a
                key={r.id}
                className="resource-link"
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <LinkIcon size={15} />
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
                  try {
                    const saved = await store.update((d) => {
                      d.tasks
                        .find((t) => t.id === task.id)!
                        .resources.push({
                          id: id(),
                          title: String(f.get('title')),
                          url: String(f.get('url')),
                        });
                    });
                    if (saved) setResource(false);
                  } catch (e) {
                    setError(String(e));
                  }
                }}
              >
                <input
                  name="title"
                  required
                  placeholder={ui.tasks.resourceTitle}
                  aria-label={ui.tasks.resourceTitle}
                />
                <input
                  type="url"
                  name="url"
                  required
                  placeholder={ui.tasks.https}
                  aria-label={ui.tasks.resourceUrl}
                />
                <Button type="submit" variant="secondary">
                  {en.common.create}
                </Button>
              </form>
            )}
          </div>
          {canEdit && (
            <div className="record-actions">
              <Button
                variant="secondary"
                disabled={
                  data.timer.status !== 'idle' ||
                  !!data.subjects.find((s) => s.id === task.subjectId)?.archived
                }
                onClick={async () => {
                  try {
                    const saved = await store.startTimer({
                      taskId: task.id,
                      subjectId: task.subjectId,
                      projectId: task.projectId,
                    });
                    if (!saved) return;
                    notify(ui.tasks.yourFocusSessionHasStarted);
                    onClose();
                  } catch (e) {
                    setError(String(e));
                  }
                }}
              >
                <Play size={15} />
                {en.timer.start}
              </Button>
              <Button variant="ghost" onClick={() => setDeleting(true)}>
                <Trash2 size={15} />
                {en.tasks.delete}
              </Button>
            </div>
          )}
        </>
      )}
      {deleting && task && (
        <Dialog title={ui.tasks.deleteThisTask} onClose={() => setDeleting(false)}>
          {store.error && (
            <p className="error" role="alert">
              {store.error}
            </p>
          )}
          <p>
            {en.common.confirmDelete} {ui.tasks.theTaskSDevelopmentNotesAndChecklistWillBe}
          </p>
          <div className="form-actions">
            <Button variant="secondary" onClick={() => setDeleting(false)}>
              {en.common.cancel}
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                const saved = await store.update((d) => {
                  addEvent(
                    d,
                    'task_deleted',
                    'Tâche supprimée ; contexte des séances passées conservé.',
                    { taskId: task.id, subjectId: task.subjectId, userId: store.user?.id },
                  );
                  d.tasks = d.tasks.filter((t) => t.id !== task.id);
                  d.journal = d.journal.filter((n) => n.taskId !== task.id);
                  d.plannedSessions = d.plannedSessions.map((p) =>
                    p.taskId === task.id ? { ...p, taskId: undefined } : p,
                  );
                });
                if (!saved) return;
                notify(ui.tasks.taskDeletedFocusHistoryPreserved);
                onClose();
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
