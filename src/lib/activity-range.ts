import { activityDays, addDays, completedFocus, dateKey, type DayActivity } from './calendar';
import type { FocusSession, Preferences } from './model';

export type ActivityView = 'year' | 'month';
export type ActivityViewPreference = { version: 1; view: ActivityView; month: string | null };

export function activityViewStorageKey(userId: string, workspaceId: string) {
  return `folia:v1:activity-view:${userId}:${workspaceId}`;
}

export function parseActivityViewPreference(raw: string | null): ActivityViewPreference | null {
  if (!raw || raw.length > 200) return null;
  try {
    const value = JSON.parse(raw);
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.keys(value).length !== 3 ||
      value.version !== 1 ||
      (value.view !== 'year' && value.view !== 'month') ||
      (value.month !== null &&
        (typeof value.month !== 'string' || shiftActivityMonth(value.month, 0) !== value.month))
    )
      return null;
    return { version: 1, view: value.view, month: value.month };
  } catch {
    return null;
  }
}

export function shiftActivityMonth(month: string, offset: number) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month < '0001-01' || !Number.isInteger(offset))
    throw new Error('Choose a valid calendar month.');
  const date = new Date(`${month}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  if (date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999)
    throw new Error('Choose a valid calendar month.');
  return date.toISOString().slice(0, 7);
}

export function monthActivityDays(
  sessions: FocusSession[],
  preferences: Pick<Preferences, 'timeZone' | 'weekStartsOn'>,
  month: string,
  now: Date | string | number,
): { days: DayActivity[]; leadingDays: number } {
  const start = `${shiftActivityMonth(month, 0)}-01`;
  const date = new Date(`${start}T12:00:00Z`);
  const leadingDays = (date.getUTCDay() - preferences.weekStartsOn + 7) % 7;
  date.setUTCMonth(date.getUTCMonth() + 1, 0);
  const length = date.getUTCDate();
  const today = dateKey(now, preferences.timeZone);
  const grouped = new Map<string, FocusSession[]>();
  for (const session of completedFocus(sessions)) {
    const day = dateKey(session.endedAt, preferences.timeZone);
    if (day.slice(0, 7) !== month) continue;
    const records = grouped.get(day) || [];
    records.push(session);
    grouped.set(day, records);
  }
  return {
    leadingDays,
    days: Array.from({ length }, (_, index) => {
      const day = addDays(start, index);
      const records = grouped.get(day) || [];
      return {
        date: day,
        sessions: records,
        count: records.length,
        minutes: records.reduce((sum, session) => sum + session.actualSeconds / 60, 0),
        future: day > today,
      };
    }),
  };
}

export function activityForRange({
  sessions,
  preferences,
  view,
  month,
  workspaceId,
  userId,
  subjectId,
  projectId,
  from,
  to,
  now = new Date(),
}: {
  sessions: FocusSession[];
  preferences: Pick<Preferences, 'timeZone' | 'weekStartsOn'>;
  view: ActivityView;
  month: string;
  workspaceId: string;
  userId: string;
  subjectId?: string;
  projectId?: string;
  from?: string;
  to?: string;
  now?: Date | string | number;
}) {
  const timestamp = new Date(now).getTime();
  const scoped = sessions.filter((session) => {
    if (
      session.workspaceId !== workspaceId ||
      session.userId !== userId ||
      (subjectId && session.context.subjectId !== subjectId) ||
      (projectId && session.context.projectId !== projectId) ||
      Date.parse(session.endedAt) > timestamp
    )
      return false;
    const day = dateKey(session.endedAt, preferences.timeZone);
    return (!from || day >= from) && (!to || day <= to);
  });
  const result =
    view === 'month'
      ? monthActivityDays(scoped, preferences, month, now)
      : { days: activityDays(scoped, preferences, now), leadingDays: 0 };
  return {
    ...result,
    count: result.days.reduce((sum, day) => sum + day.count, 0),
    minutes: result.days.reduce((sum, day) => sum + day.minutes, 0),
  };
}
