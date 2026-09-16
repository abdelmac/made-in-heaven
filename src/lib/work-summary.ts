import { addDays, allocateToHourBuckets, dateKey, weekDays } from './calendar';
import type { WorkspaceData } from './model';

export function workSummary(
  data: WorkspaceData,
  userId: string,
  period: 'day' | 'week',
  now = Date.now(),
) {
  const today = dateKey(now, data.preferences.timeZone);
  const days = period === 'day' ? [today] : weekDays(now, data.preferences);
  const sessions = data.focusSessions.filter(
    (session) =>
      session.userId === userId &&
      session.phase === 'focus' &&
      session.status === 'completed' &&
      Date.parse(session.endedAt) <= now &&
      days.includes(dateKey(session.endedAt, data.preferences.timeZone)),
  );
  const plans = data.plannedSessions.filter((session) => {
    if (session.userId !== userId) return false;
    const first = dateKey(session.startsAt, data.preferences.timeZone);
    const last = dateKey(
      Date.parse(session.startsAt) + session.durationMinutes * 60_000 - 1,
      data.preferences.timeZone,
    );
    return first <= days.at(-1)! && last >= days[0];
  });
  const plannedMinutes = [...allocateToHourBuckets(plans, data.preferences.timeZone).values()]
    .filter((bucket) => days.includes(bucket.day))
    .reduce((total, bucket) => total + bucket.minutes, 0);
  const activeSubjects = new Set(
    data.subjects.filter((subject) => !subject.archived && !subject.completedAt).map((s) => s.id),
  );
  const activeProjects = new Set(data.projects.filter((p) => !p.archived).map((p) => p.id));
  const tasks = data.tasks.filter(
    (task) =>
      task.status !== 'done' &&
      (!task.assigneeId || task.assigneeId === userId) &&
      (!task.subjectId || activeSubjects.has(task.subjectId)) &&
      (!task.projectId || activeProjects.has(task.projectId)),
  );
  const priority = { urgent: 0, high: 1, medium: 2, low: 3 };
  const actionable = tasks
    .filter((task) => task.status !== 'blocked')
    .sort(
      (a, b) =>
        (a.dueDate || '9999').localeCompare(b.dueDate || '9999') ||
        priority[a.priority] - priority[b.priority] ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.id.localeCompare(b.id),
    );
  const nextPlan = data.plannedSessions
    .filter(
      (plan) =>
        plan.userId === userId &&
        !plan.completed &&
        Date.parse(plan.startsAt) >= now &&
        (!plan.subjectId || activeSubjects.has(plan.subjectId)) &&
        (!plan.projectId || activeProjects.has(plan.projectId)),
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
  const todayCount = sessions.filter(
    (session) => dateKey(session.endedAt, data.preferences.timeZone) === today,
  ).length;
  return {
    today,
    tomorrow: addDays(today, 1),
    plannedMinutes,
    completedMinutes: sessions.reduce((total, session) => total + session.actualSeconds / 60, 0),
    completedCount: sessions.length,
    overdueCount: tasks.filter((task) => task.dueDate && task.dueDate < today).length,
    blockedCount: tasks.filter((task) => task.status === 'blocked').length,
    remainingToday: Math.max(0, data.preferences.dailyGoal - todayCount),
    nextTask: actionable[0],
    nextPlan,
  };
}
