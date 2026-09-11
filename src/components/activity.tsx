'use client';
import { ui } from '@/lib/i18n/ui';

import { useEffect, useMemo, useState } from 'react';
import { paid } from '@/lib/i18n/paid';
import {
  Search,
  Download,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Check,
  Flame,
  Target,
  CalendarDays,
  ArrowUpRight,
} from 'lucide-react';
import { useApp } from './app-context';
import { Button, IconButton, Dialog, Panel, Empty, ColorDot } from './ui';
import { en } from '@/lib/i18n/en';
import {
  activityDays,
  allocateToHourBuckets,
  calculateMetrics,
  addDays,
  type DayActivity,
} from '@/lib/calendar';
import {
  formatDay,
  formatTime,
  minutesLabel,
  dateKey,
  completedSessions,
  focusMinutes,
} from '@/lib/display';

export function SummaryCards() {
  const { store } = useApp();
  const metrics = calculateMetrics(store.data, new Date(), store.userId);
  const cards = [
    {
      label: en.overview.today,
      value: minutesLabel(metrics.todayMinutes),
      detail: `${metrics.todayCount} completed ${metrics.todayCount === 1 ? 'session' : 'sessions'}`,
      Icon: Clock3,
    },
    {
      label: en.overview.goal,
      value: `${metrics.todayCount}`,
      suffix: `/ ${store.data.preferences.dailyGoal}`,
      detail: ui.activity.aLittleCloserOneSessionAtATime,
      Icon: Target,
    },
    {
      label: en.overview.week,
      value: minutesLabel(metrics.weekMinutes),
      detail: `${metrics.weekCount} sessions this week`,
      Icon: CalendarDays,
    },
    {
      label: en.overview.streak,
      value: `${metrics.streak}`,
      suffix: en.overview.days,
      detail: metrics.streak
        ? ui.activity.keepYourLittleRhythmGoing
        : ui.activity.yourNextSessionStartsYourStreak,
      Icon: Flame,
    },
  ];
  return (
    <div className="summary-grid">
      {cards.map(({ label, value, suffix, detail, Icon }, i) => (
        <section className="summary-card" key={label}>
          <div className="row spread">
            <span>{label}</span>
            <span className={`metric-icon metric-${i}`}>
              <Icon size={18} strokeWidth={1.6} />
            </span>
          </div>
          <div className="metric-value">
            {value}
            {suffix && <small>{suffix}</small>}
          </div>
          {i === 1 ? (
            <>
              <div className="goal-track">
                <span style={{ width: `${metrics.goalProgress * 100}%` }} />
              </div>
              <p>{detail}</p>
            </>
          ) : (
            <p>{detail}</p>
          )}
        </section>
      ))}
    </div>
  );
}
export function ActivityHeatmap({
  subjectId,
  projectId,
  from,
  to,
}: {
  subjectId?: string;
  projectId?: string;
  from?: string;
  to?: string;
}) {
  const { store, navigate } = useApp();
  const [selected, setSelected] = useState<DayActivity | null>(null);
  const { data } = store;
  const days = useMemo(
    () =>
      activityDays(
        data.focusSessions.filter((s) => {
          const day = dateKey(s.endedAt, data.preferences.timeZone);
          return (
            (!subjectId || s.context.subjectId === subjectId) &&
            (!projectId || s.context.projectId === projectId) &&
            (!from || day >= from) &&
            (!to || day <= to) &&
            s.userId === store.userId
          );
        }),
        data.preferences,
      ),
    [data.focusSessions, data.preferences, subjectId, projectId, from, to, store.userId],
  );
  const total = days.reduce((sum, day) => sum + day.count, 0);
  const minuteMode = data.preferences.heatmapMode === 'minutes';
  const weekdays =
    data.preferences.weekStartsOn === 1
      ? ['Mon', '', 'Wed', '', 'Fri', '', 'Sun']
      : ['Sun', '', 'Tue', '', 'Thu', '', 'Sat'];
  const months = Array.from({ length: 52 }, (_, i) => {
    const date = new Date(days[i * 7].date + 'T12:00Z');
    const previous = i ? new Date(days[(i - 1) * 7].date + 'T12:00Z') : null;
    return !previous || date.getUTCMonth() !== previous.getUTCMonth()
      ? new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' }).format(date)
      : '';
  });
  return (
    <Panel
      className="activity-panel"
      title={en.overview.activity}
      subtitle={en.overview.activitySubtitle}
      action={
        <select
          className="subtle-select"
          aria-label={ui.activity.heatmapMeasure}
          value={data.preferences.heatmapMode}
          onChange={(e) =>
            store.update((d) => {
              d.preferences.heatmapMode = e.target.value as 'sessions' | 'minutes';
            })
          }
        >
          <option value="sessions">{ui.activity.sessions}</option>
          <option value="minutes">{ui.activity.focusMinutes}</option>
        </select>
      }
    >
      <div className="heatmap-scroll">
        <div className="heatmap-wrap">
          <div className="heatmap-months">
            <span />
            {months.map((m, i) => (
              <span key={i}>{m}</span>
            ))}
          </div>
          <div className="heatmap-body">
            <div className="heatmap-weekdays">
              {weekdays.map((d, i) => (
                <span key={i}>{d}</span>
              ))}
            </div>
            <div className="heatmap-grid">
              {days.map((day) => {
                const intensity = minuteMode
                  ? day.minutes === 0
                    ? 0
                    : day.minutes <= 25
                      ? 1
                      : day.minutes <= 50
                        ? 2
                        : day.minutes <= 75
                          ? 3
                          : 4
                  : Math.min(4, day.count);
                const label = `${day.date}: ${day.count} completed focus sessions, ${Math.round(day.minutes)} minutes${day.future ? ', future date' : ''}`;
                return (
                  <button
                    className={`heatmap-cell intensity-${intensity}`}
                    key={day.date}
                    aria-label={label}
                    title={label}
                    disabled={day.future}
                    onClick={() => setSelected(day)}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <div className="heatmap-footer">
        <span>
          <strong>{total}</strong> {ui.activity.completedSessionsInTheLast52Weeks}
        </span>
        <div className="legend">
          <span>{en.overview.less}</span>
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className={`legend-cell intensity-${i}`}
              title={
                minuteMode
                  ? ['0 minutes', '1–25 minutes', '26–50 minutes', '51–75 minutes', '76+ minutes'][
                      i
                    ]
                  : `${i}${i === 4 ? '+' : ''} completed sessions`
              }
            />
          ))}
          <span>{en.overview.more}</span>
        </div>
      </div>
      {total === 0 && <p className="heatmap-note">{en.overview.noActivity}</p>}
      {selected && (
        <Dialog
          title={formatDay(selected.date + 'T12:00Z', { ...data.preferences, timeZone: 'UTC' })}
          onClose={() => setSelected(null)}
        >
          <div className="mini-metrics">
            <div>
              <strong>{selected.count}</strong>
              <span>{ui.activity.completedSessions}</span>
            </div>
            <div>
              <strong>{minutesLabel(selected.minutes)}</strong>
              <span>{ui.activity.focusedTime}</span>
            </div>
          </div>
          {selected.sessions.length ? (
            selected.sessions.map((s) => (
              <div key={s.id} className="session-item">
                <div>
                  <strong>{s.context.taskTitle || s.context.subjectName || en.timer.focus}</strong>
                  <span>
                    {s.context.subjectName} {ui.activity.copy}{' '}
                    {formatTime(s.endedAt, data.preferences)}
                  </span>
                </div>
                <strong>
                  {s.durationMinutes}
                  {ui.activity.m}
                </strong>
              </div>
            ))
          ) : (
            <Empty
              title={ui.activity.aQuietDay}
              detail={ui.activity.onlyCompletedFocusSessionsAppearHere}
            />
          )}
          <Button
            variant="secondary"
            onClick={() => {
              setSelected(null);
              navigate('history');
            }}
          >
            {ui.activity.openHistory}
            <ArrowUpRight size={15} />
          </Button>
        </Dialog>
      )}
    </Panel>
  );
}
export function HistoryPage() {
  const { store, openTask } = useApp();
  const { data } = store;
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState('');
  const [project, setProject] = useState('');
  const [task, setTask] = useState('');
  const [type, setType] = useState('');
  const [member, setMember] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(0);
  const events = data.events
    .filter((e) => {
      const date = dateKey(e.timestamp, data.preferences.timeZone);
      return (
        (!subject || e.subjectId === subject) &&
        (!project || e.projectId === project) &&
        (!task || e.taskId === task) &&
        (!type || e.type === type) &&
        (!member || e.userId === member) &&
        (!from || date >= from) &&
        (!to || date <= to) &&
        `${e.subjectName || ''} ${e.taskTitle || ''} ${e.details} ${e.type}`
          .toLowerCase()
          .includes(search.toLowerCase())
      );
    })
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const pages = Math.max(1, Math.ceil(events.length / 20));
  const current = Math.min(page, pages - 1);
  function exportHistory() {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            { exportedAt: new Date().toISOString(), workspaceId: data.workspaceId, events },
            null,
            2,
          ),
        ],
        { type: 'application/json' },
      ),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'folia-history.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
      <div className="page-actions">
        <div className="search-input">
          <Search size={17} />
          <input
            placeholder={ui.activity.searchYourHistory}
            aria-label={en.history.search}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <Button variant="secondary" onClick={exportHistory}>
          <Download size={16} />
          {en.history.export}
        </Button>
      </div>
      <div className="filters">
        <select
          aria-label={ui.activity.historySubject}
          value={subject}
          onChange={(e) => {
            setSubject(e.target.value);
            setPage(0);
          }}
        >
          <option value="">{ui.activity.allSubjects}</option>
          {data.subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          aria-label={ui.activity.historyProject}
          value={project}
          onChange={(e) => {
            setProject(e.target.value);
            setPage(0);
          }}
        >
          <option value="">{ui.activity.allProjects}</option>
          {data.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          aria-label={ui.activity.historyTask}
          value={task}
          onChange={(e) => {
            setTask(e.target.value);
            setPage(0);
          }}
        >
          <option value="">{ui.activity.allTasks}</option>
          {data.tasks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
        <select
          aria-label={en.history.type}
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setPage(0);
          }}
        >
          <option value="">{ui.activity.allEventTypes}</option>
          {Array.from(new Set(data.events.map((e) => e.type)))
            .sort()
            .map((type) => (
              <option key={type} value={type}>
                {type.replaceAll('_', ' ')}
              </option>
            ))}
        </select>
        {store.isCloud && (
          <select
            aria-label={ui.activity.historyMember}
            value={member}
            onChange={(e) => setMember(e.target.value)}
          >
            <option value="">{ui.activity.allPermittedMembers}</option>
            <option value={store.userId}>{ui.activity.me}</option>
            {Array.from(new Set(data.events.map((e) => e.userId)))
              .filter((uid) => uid !== store.userId)
              .map((uid) => (
                <option key={uid} value={uid}>
                  {uid.slice(0, 8)}
                </option>
              ))}
          </select>
        )}
        <label className="inline-label">
          {en.history.from}
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <label className="inline-label">
          {en.history.to}
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(0);
            }}
          />
        </label>
      </div>
      <section className="panel history-panel">
        {events.length ? (
          events.slice(current * 20, current * 20 + 20).map((e) => (
            <article className="timeline-item" key={e.id}>
              <span className={`timeline-icon ${e.type === 'focus_completed' ? 'completed' : ''}`}>
                {e.type === 'focus_completed' ? (
                  <Check size={16} />
                ) : e.type.startsWith('focus') ? (
                  <Clock3 size={16} />
                ) : (
                  <span />
                )}
              </span>
              <div>
                <div className="row wrap">
                  <strong>{e.type.replaceAll('_', ' ')}</strong>
                  {e.subjectName && <span className="badge">{e.subjectName}</span>}
                </div>
                {e.taskTitle && (
                  <button
                    className="timeline-task"
                    disabled={!data.tasks.some((t) => t.id === e.taskId)}
                    onClick={() => openTask(e.taskId)}
                  >
                    {e.taskTitle}
                  </button>
                )}
                <p>{e.details}</p>
                <time>
                  {formatDay(e.timestamp, data.preferences)} {ui.activity.at}{' '}
                  {formatTime(e.timestamp, data.preferences)} {ui.activity.copy}{' '}
                  {e.userId === store.userId ? ui.activity.you : e.userId.slice(0, 8)}
                </time>
              </div>
            </article>
          ))
        ) : (
          <Empty title={en.history.empty} />
        )}
        <div className="pagination">
          <span>
            {events.length} {ui.activity.eventsPage} {current + 1} {ui.activity.of} {pages}
          </span>
          <div className="row">
            <IconButton
              label={en.history.previous}
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              <ChevronLeft size={17} />
            </IconButton>
            <IconButton
              label={en.history.next}
              disabled={current >= pages - 1}
              onClick={() => setPage(current + 1)}
            >
              <ChevronRight size={17} />
            </IconButton>
          </div>
        </div>
      </section>
    </>
  );
}
type AdvancedAnalytics = {
  totals: { completedMinutes: number; completedSessions: number; plannedMinutes: number };
  bySubject: { id: string; name: string; minutes: number; sessions: number }[];
  byProject: { id: string; name: string; minutes: number; sessions: number }[];
  taskEffort: {
    id: string;
    title: string;
    estimatedPomodoros: number;
    completedPomodoros: number;
    completedMinutes: number;
  }[];
  members: { id: string; name: string }[];
  features?: { teamAnalytics: boolean };
};
function AnalyticsBars({
  title,
  rows,
  total,
}: {
  title: string;
  rows: { id: string; name: string; value: number; color?: string }[];
  total: number;
}) {
  return (
    <Panel title={title} subtitle={ui.activity.completedFocusWithinYourFilters}>
      {rows.length ? (
        rows.map((row) => (
          <div className="bar-item" key={row.id}>
            <div className="row spread">
              <span className="row">
                <ColorDot color={row.color} />
                {row.name}
              </span>
              <strong>{minutesLabel(row.value)}</strong>
            </div>
            <div className="bar-track">
              <span
                style={{
                  width: `${(row.value / Math.max(total, 1)) * 100}%`,
                  backgroundColor: row.color || 'var(--accent)',
                }}
              />
            </div>
          </div>
        ))
      ) : (
        <Empty title={en.analytics.noData} />
      )}
    </Panel>
  );
}
export function AnalyticsPage() {
  const { store, navigate } = useApp();
  const { data } = store;
  const [subject, setSubject] = useState('');
  const [project, setProject] = useState('');
  const [from, setFrom] = useState(() =>
    addDays(dateKey(new Date(), data.preferences.timeZone), -364),
  );
  const [to, setTo] = useState(() => dateKey(new Date(), data.preferences.timeZone));
  const [memberSelection, setMember] = useState({
    workspaceId: store.workspaceId,
    value: store.userId,
  });
  const member =
    memberSelection.workspaceId === store.workspaceId ? memberSelection.value : store.userId;
  const [retry, setRetry] = useState(0);
  const [remote, setRemote] = useState<{
    key: string;
    workspaceId: string;
    result?: AdvancedAnalytics;
    error?: string;
    denied?: boolean;
  } | null>(null);
  const query = new URLSearchParams({ workspaceId: store.workspaceId, from, to });
  if (subject) query.set('subjectId', subject);
  if (project) query.set('projectId', project);
  if (member && member !== 'all') query.set('memberId', member);
  const queryString = query.toString();
  const requestKey = `${queryString}:${data.updatedAt}:${retry}`;
  const validRange = !!from && !!to && to >= from;
  useEffect(() => {
    if (!store.isCloud || !validRange) return;
    const controller = new AbortController();
    void fetch(`/api/analytics?${queryString}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) {
          setRemote({
            key: requestKey,
            workspaceId: store.workspaceId,
            error: body.error || paid.analyticsUnavailable,
            denied: response.status === 403,
          });
          return;
        }
        setRemote({ key: requestKey, workspaceId: store.workspaceId, result: body });
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setRemote({
            key: requestKey,
            workspaceId: store.workspaceId,
            error: cause instanceof Error ? cause.message : paid.analyticsUnavailable,
          });
      });
    return () => controller.abort();
  }, [store.isCloud, store.workspaceId, validRange, queryString, requestKey]);
  const advanced = remote?.key === requestKey ? remote.result : undefined;
  const reportError = remote?.key === requestKey ? remote.error : undefined;
  const teamReport =
    remote?.workspaceId === store.workspaceId && remote.result?.features?.teamAnalytics;
  const reportMembers =
    remote?.workspaceId === store.workspaceId ? remote.result?.members || [] : [];
  const sessions = completedSessions(data).filter((s) => {
    const date = dateKey(s.endedAt, data.preferences.timeZone);
    return (
      s.userId === store.userId &&
      (!subject || s.context.subjectId === subject) &&
      (!project || s.context.projectId === project) &&
      (!from || date >= from) &&
      (!to || date <= to)
    );
  });
  const localBySubject = Array.from(new Set(sessions.map((s) => s.context.subjectId))).map(
    (subjectId) => ({
      id: subjectId || 'unassigned',
      name:
        data.subjects.find((s) => s.id === subjectId)?.name ||
        sessions.find((s) => s.context.subjectId === subjectId)?.context.subjectName ||
        en.common.unassigned,
      color: data.subjects.find((s) => s.id === subjectId)?.color,
      value: focusMinutes(sessions.filter((s) => s.context.subjectId === subjectId)),
    }),
  );
  const localByProject = Array.from(new Set(sessions.map((s) => s.context.projectId))).map(
    (projectId) => ({
      id: projectId || 'unassigned',
      name:
        data.projects.find((item) => item.id === projectId)?.name ||
        sessions.find((s) => s.context.projectId === projectId)?.context.projectName ||
        en.common.unassigned,
      value: focusMinutes(sessions.filter((s) => s.context.projectId === projectId)),
    }),
  );
  const total = store.isCloud ? advanced?.totals.completedMinutes || 0 : focusMinutes(sessions);
  const localPlanned = [
    ...allocateToHourBuckets(
      data.plannedSessions.filter(
        (session) =>
          session.userId === store.userId &&
          (!subject || session.subjectId === subject) &&
          (!project || session.projectId === project),
      ),
      data.preferences.timeZone,
    ).values(),
  ]
    .filter((bucket) => (!from || bucket.day >= from) && (!to || bucket.day <= to))
    .reduce((sum, bucket) => sum + bucket.minutes, 0);
  const planned = store.isCloud ? advanced?.totals.plannedMinutes || 0 : localPlanned;
  const bySubject = store.isCloud
    ? (advanced?.bySubject || []).map((row) => ({
        ...row,
        value: row.minutes,
        color: data.subjects.find((item) => item.id === row.id)?.color,
      }))
    : localBySubject;
  const byProject = store.isCloud
    ? (advanced?.byProject || []).map((row) => ({ ...row, value: row.minutes }))
    : localByProject;
  const taskEffort = store.isCloud
    ? advanced?.taskEffort || []
    : data.tasks
        .filter(
          (task) =>
            (!subject || task.subjectId === subject) && (!project || task.projectId === project),
        )
        .map((task) => {
          const focus = sessions.filter((session) => session.context.taskId === task.id);
          return {
            id: task.id,
            title: task.title,
            estimatedPomodoros: task.estimatedPomodoros,
            completedPomodoros: focus.length,
            completedMinutes: focusMinutes(focus),
          };
        });
  return (
    <>
      <SummaryCards />
      {store.isCloud && <p className="helper">{paid.ownActivityHelp}</p>}
      <div className="filters analytics-filters">
        {teamReport && (
          <select
            aria-label={paid.member}
            value={member}
            onChange={(event) =>
              setMember({ workspaceId: store.workspaceId, value: event.target.value })
            }
          >
            <option value={store.userId}>{paid.me}</option>
            <option value="all">{paid.allMembers}</option>
            {reportMembers
              .filter((item) => item.id !== store.userId)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
        )}
        <select
          aria-label={ui.activity.analyticsSubject}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        >
          <option value="">{ui.activity.allSubjects}</option>
          {data.subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          aria-label={ui.activity.analyticsProject}
          value={project}
          onChange={(e) => setProject(e.target.value)}
        >
          <option value="">{ui.activity.allProjects}</option>
          {data.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <label className="inline-label">
          {ui.activity.from}
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="inline-label">
          {ui.activity.to}
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>
      {validRange && (!store.isCloud || advanced) ? (
        <>
          <div className="analytics-grid">
            <AnalyticsBars title={en.analytics.bySubject} rows={bySubject} total={total} />
            <AnalyticsBars title={paid.byProject} rows={byProject} total={total} />
            <Panel
              title={en.analytics.planning}
              subtitle={ui.activity.plannedTimeAndActualCompletedFocus}
            >
              <div className="compare-metric">
                <span>{ui.activity.planned}</span>
                <strong>{minutesLabel(planned)}</strong>
                <div className="bar-track">
                  <span
                    style={{
                      width: `${(planned / Math.max(planned, total, 1)) * 100}%`,
                      backgroundColor: 'var(--sage)',
                    }}
                  />
                </div>
              </div>
              <div className="compare-metric">
                <span>{ui.activity.completed}</span>
                <strong>{minutesLabel(total)}</strong>
                <div className="bar-track">
                  <span style={{ width: `${(total / Math.max(planned, total, 1)) * 100}%` }} />
                </div>
              </div>
              <p className="helper">
                {ui.activity.planningDoesNotAutomaticallyCountAsCompletedWork}
              </p>
            </Panel>
          </div>
          <Panel
            title={en.analytics.effort}
            subtitle={ui.activity.estimatesGuideYourPlanningTimeSpentDoesNotMark}
          >
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{ui.activity.task}</th>
                    <th>{ui.activity.estimatedPomodoros}</th>
                    <th>{ui.activity.completedPomodoros}</th>
                    <th>{ui.activity.focusTime}</th>
                    <th>{ui.activity.checklist}</th>
                  </tr>
                </thead>
                <tbody>
                  {taskEffort.map((t) => {
                    const checklist = data.tasks.find((task) => task.id === t.id)?.checklist || [];
                    return (
                      <tr key={t.id}>
                        <td>{t.title}</td>
                        <td>{t.estimatedPomodoros}</td>
                        <td>{t.completedPomodoros}</td>
                        <td>{minutesLabel(t.completedMinutes)}</td>
                        <td>
                          {checklist.filter((c) => c.done).length}
                          {ui.activity.copy2}
                          {checklist.length}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      ) : (
        <Panel title={paid.advancedAnalytics}>
          <p role={reportError || !validRange ? 'alert' : 'status'}>
            {!validRange ? paid.invalidRange : reportError || paid.analyticsLoading}
          </p>
          {reportError && (
            <>
              <p className="helper">{paid.analyticsPlan}</p>
              <div className="row wrap">
                <Button variant="secondary" onClick={() => setRetry((value) => value + 1)}>
                  {paid.retry}
                </Button>
                {remote?.denied && (
                  <Button onClick={() => navigate('billing')}>{paid.viewPlans}</Button>
                )}
              </div>
            </>
          )}
        </Panel>
      )}
      <ActivityHeatmap
        subjectId={subject || undefined}
        projectId={project || undefined}
        from={from || undefined}
        to={to || undefined}
      />
      <p className="helper">
        {en.analytics.streakHelp} {ui.activity.allDatesUse} {data.preferences.timeZone}
        {ui.activity.copy3}
      </p>
    </>
  );
}
