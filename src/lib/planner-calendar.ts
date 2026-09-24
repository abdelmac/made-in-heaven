import { addDays, allocateToHourBuckets, dateKey } from './calendar';
import type { PlannedSession, Task } from './model';

export type PlannerView = 'week' | 'month' | 'agenda';
export type PlannerDay = {
  date: string;
  sessions: PlannedSession[];
  tasks: Task[];
  minutes: number;
};

function calendarDate(day: string) {
  const date = new Date(`${day}T12:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== day ||
    day < '0001-01-01'
  )
    throw new Error('Choisissez une date valide.');
  return date;
}

export function plannerDateRange(view: PlannerView, anchor: string, weekStartsOn: 0 | 1) {
  const date = calendarDate(anchor);
  let start: string;
  let length: number;
  if (view === 'month') {
    start = `${anchor.slice(0, 7)}-01`;
    date.setUTCMonth(date.getUTCMonth() + 1, 0);
    length = date.getUTCDate();
  } else {
    start = addDays(anchor, -((date.getUTCDay() - weekStartsOn + 7) % 7));
    length = 7;
  }
  const days = Array.from({ length }, (_, index) => addDays(start, index)).filter(
    (day) => /^\d{4}-\d{2}-\d{2}$/.test(day) && day >= '0001-01-01' && day <= '9999-12-31',
  );
  const first = days[0];
  return {
    start: first,
    end: days[days.length - 1],
    days,
    leadingDays: (calendarDate(first).getUTCDay() - weekStartsOn + 7) % 7,
  };
}

export function shiftPlannerDate(day: string, direction: number, view: PlannerView) {
  const date = calendarDate(day);
  if (!Number.isInteger(direction)) throw new Error('Choisissez une période valide.');
  if (view !== 'month') {
    const next = addDays(day, direction * 7);
    calendarDate(next);
    return next;
  }
  const originalDay = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + direction);
  const last = new Date(date);
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  date.setUTCDate(Math.min(originalDay, last.getUTCDate()));
  if (date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999)
    throw new Error('Choisissez une période valide.');
  return date.toISOString().slice(0, 10);
}

/** Due dates are calendar dates; focus sessions use the workspace time zone. */
export function plannerDays(
  days: string[],
  sessions: PlannedSession[],
  tasks: Task[],
  timeZone: string,
  workspaceId: string,
): PlannerDay[] {
  if (!days.length) return [];
  const start = days[0];
  const end = days[days.length - 1];
  const relevant = sessions.filter(
    (session) =>
      session.workspaceId === workspaceId &&
      dateKey(session.startsAt, timeZone) <= end &&
      dateKey(Date.parse(session.startsAt) + session.durationMinutes * 60000 - 1, timeZone) >=
        start,
  );
  const grouped = new Map(
    days.map((date) => [
      date,
      { date, sessions: new Map<string, PlannedSession>(), tasks: [] as Task[], minutes: 0 },
    ]),
  );
  for (const bucket of allocateToHourBuckets(relevant, timeZone).values()) {
    const day = grouped.get(bucket.day);
    if (!day) continue;
    day.minutes += bucket.minutes;
    for (const session of bucket.sessions) day.sessions.set(session.id, session);
  }
  for (const task of tasks) {
    if (task.workspaceId === workspaceId && task.dueDate)
      grouped.get(task.dueDate)?.tasks.push(task);
  }
  return [...grouped.values()].map((day) => ({
    ...day,
    sessions: [...day.sessions.values()].sort(
      (a, b) =>
        Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.title.localeCompare(b.title, 'fr'),
    ),
    tasks: day.tasks.sort(
      (a, b) =>
        Number(a.status === 'done') - Number(b.status === 'done') ||
        a.title.localeCompare(b.title, 'fr'),
    ),
  }));
}
