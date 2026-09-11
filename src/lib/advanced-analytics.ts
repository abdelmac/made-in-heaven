import { z } from 'zod';
import { addDays, dateKey, zonedDateTime } from './calendar';
import type { WorkspaceData } from './model';

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const stamp = Date.parse(`${value}T12:00:00Z`);
    return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === value;
  }, 'Choose a valid calendar date.');
export const analyticsFiltersSchema = z
  .object({
    workspaceId: z.string().uuid(),
    from: day.optional(),
    to: day.optional(),
    subjectId: z.string().uuid().optional(),
    projectId: z.string().uuid().optional(),
    memberId: z.string().uuid().optional(),
  })
  .strict()
  .refine(
    (value) => !value.from || !value.to || value.from <= value.to,
    'The end date must follow the start date.',
  );
export type AnalyticsFilters = z.infer<typeof analyticsFiltersSchema>;

function firstInstantOfDay(value: string, timeZone: string): number {
  // A few zones advance their clock at midnight. Use the first valid local minute.
  for (let minute = 0; minute < 240; minute++) {
    try {
      return Date.parse(
        zonedDateTime(
          value,
          `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`,
          timeZone,
        ),
      );
    } catch {
      /* Continue through a daylight-saving gap. */
    }
  }
  throw new Error('This calendar day does not exist in the selected time zone.');
}

export function calculateAdvancedAnalytics(
  data: WorkspaceData,
  filters: AnalyticsFilters,
  now = Date.now(),
) {
  const timeZone = data.preferences.timeZone;
  const to = filters.to || dateKey(now, timeZone);
  const from = filters.from || addDays(to, -364);
  if (from > to) throw new Error('The end date must follow the start date.');
  const rangeStart = firstInstantOfDay(from, timeZone);
  const rangeEnd = firstInstantOfDay(addDays(to, 1), timeZone);
  const focus = data.focusSessions.filter(
    (session) =>
      session.phase === 'focus' &&
      session.status === 'completed' &&
      dateKey(session.endedAt, timeZone) >= from &&
      dateKey(session.endedAt, timeZone) <= to &&
      (!filters.memberId || session.userId === filters.memberId) &&
      (!filters.subjectId || session.context.subjectId === filters.subjectId) &&
      (!filters.projectId || session.context.projectId === filters.projectId),
  );
  const plans = data.plannedSessions.filter(
    (plan) =>
      (!filters.memberId || plan.userId === filters.memberId) &&
      (!filters.subjectId || plan.subjectId === filters.subjectId) &&
      (!filters.projectId || plan.projectId === filters.projectId),
  );
  const plannedMinutes = plans.reduce((sum, plan) => {
    const start = Date.parse(plan.startsAt);
    return (
      sum +
      Math.max(
        0,
        Math.min(start + plan.durationMinutes * 60_000, rangeEnd) - Math.max(start, rangeStart),
      ) /
        60_000
    );
  }, 0);
  const bySubject = new Map<
    string,
    { id: string; name: string; minutes: number; sessions: number }
  >();
  const byProject = new Map<
    string,
    { id: string; name: string; minutes: number; sessions: number }
  >();
  for (const session of focus) {
    const subjectId = session.context.subjectId || 'unassigned';
    const projectId = session.context.projectId || 'unassigned';
    const subject = bySubject.get(subjectId) || {
      id: subjectId,
      name:
        data.subjects.find((item) => item.id === subjectId)?.name ||
        session.context.subjectName ||
        'Unassigned',
      minutes: 0,
      sessions: 0,
    };
    const project = byProject.get(projectId) || {
      id: projectId,
      name:
        data.projects.find((item) => item.id === projectId)?.name ||
        session.context.projectName ||
        'Unassigned',
      minutes: 0,
      sessions: 0,
    };
    subject.minutes += session.actualSeconds / 60;
    subject.sessions++;
    project.minutes += session.actualSeconds / 60;
    project.sessions++;
    bySubject.set(subjectId, subject);
    byProject.set(projectId, project);
  }
  const taskEffort = data.tasks
    .filter(
      (task) =>
        (!filters.subjectId || task.subjectId === filters.subjectId) &&
        (!filters.projectId || task.projectId === filters.projectId) &&
        (!filters.memberId ||
          task.assigneeId === filters.memberId ||
          focus.some((session) => session.context.taskId === task.id) ||
          plans.some((plan) => plan.taskId === task.id)),
    )
    .map((task) => {
      const sessions = focus.filter((session) => session.context.taskId === task.id);
      return {
        id: task.id,
        title: task.title,
        estimatedPomodoros: task.estimatedPomodoros,
        completedPomodoros: sessions.length,
        completedMinutes: sessions.reduce((sum, session) => sum + session.actualSeconds / 60, 0),
      };
    });
  return {
    range: { from, to, timeZone },
    totals: {
      completedMinutes: focus.reduce((sum, session) => sum + session.actualSeconds / 60, 0),
      completedSessions: focus.length,
      plannedMinutes,
    },
    bySubject: [...bySubject.values()].sort((a, b) => b.minutes - a.minutes),
    byProject: [...byProject.values()].sort((a, b) => b.minutes - a.minutes),
    taskEffort,
  };
}
export type AdvancedAnalytics = ReturnType<typeof calculateAdvancedAnalytics>;
