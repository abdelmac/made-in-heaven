import type { FocusSession, PlannedSession, Preferences, WorkspaceData } from './model';

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string) {
  if (!formatters.has(timeZone))
    formatters.set(
      timeZone,
      new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      }),
    );
  return formatters.get(timeZone)!;
}
export function zonedParts(value: Date | string | number, timeZone: string) {
  const parts = Object.fromEntries(
    formatter(timeZone)
      .formatToParts(new Date(value))
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}
export function dateKey(value: Date | string | number, timeZone: string) {
  const p = zonedParts(value, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}
export function addDays(day: string, amount: number) {
  const value = new Date(`${day}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}
export function zonedDateTime(day: string, time: string, timeZone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    throw new Error('Saisissez une date et une heure valides.');
  const wall = Date.parse(`${day}T${time}:00Z`);
  if (!Number.isFinite(wall) || new Date(wall).toISOString().slice(0, 10) !== day)
    throw new Error('Saisissez une date de calendrier valide.');
  const offsets = new Set<number>();
  for (const hours of [-36, -12, 0, 12, 36]) {
    const sample = wall + hours * 3600000;
    const p = zonedParts(sample, timeZone);
    offsets.add(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - sample);
  }
  const matches = [...offsets]
    .map((offset) => wall - offset)
    .filter((candidate) => {
      const p = zonedParts(candidate, timeZone);
      return (
        dateKey(candidate, timeZone) === day &&
        `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}` === time
      );
    })
    .sort((a, b) => a - b);
  if (!matches.length)
    throw new Error(
      "Cette heure locale n'existe pas en raison du changement d'heure. Choisissez une autre heure.",
    );
  return new Date(matches[0]).toISOString(); // The earlier occurrence is selected when clocks repeat an hour.
}
export function weekDays(
  now: Date | string | number,
  preferences: Pick<Preferences, 'timeZone' | 'weekStartsOn'>,
  offset = 0,
): string[] {
  const day = dateKey(now, preferences.timeZone);
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  const first = addDays(day, -((weekday - preferences.weekStartsOn + 7) % 7) + offset * 7);
  return Array.from({ length: 7 }, (_, index) => addDays(first, index));
}
export function overlaps(
  a: Pick<PlannedSession, 'id' | 'userId' | 'startsAt' | 'durationMinutes'>,
  b: Pick<PlannedSession, 'id' | 'userId' | 'startsAt' | 'durationMinutes'>,
) {
  if (a.id === b.id || a.userId !== b.userId) return false;
  const aStart = Date.parse(a.startsAt);
  const bStart = Date.parse(b.startsAt);
  return aStart < bStart + b.durationMinutes * 60000 && bStart < aStart + a.durationMinutes * 60000;
}
export function findOverlap(session: PlannedSession, allWorkspaceSessions: PlannedSession[]) {
  return allWorkspaceSessions.find((other) => overlaps(session, other));
}
export type HourBucket = {
  day: string;
  hour: number;
  minutes: number;
  sessions: PlannedSession[];
  completed: boolean;
  partial: boolean;
};
export function allocateToHourBuckets(
  sessions: PlannedSession[],
  timeZone: string,
): Map<string, HourBucket> {
  const result = new Map<string, HourBucket>();
  for (const session of sessions) {
    let cursor = Date.parse(session.startsAt);
    const end = cursor + session.durationMinutes * 60000;
    while (cursor < end) {
      const next = Math.min(end, Math.floor(cursor / 60000) * 60000 + 60000);
      const p = zonedParts(cursor, timeZone);
      const day = dateKey(cursor, timeZone);
      const key = `${day}:${p.hour}`;
      const bucket = result.get(key) || {
        day,
        hour: p.hour,
        minutes: 0,
        sessions: [],
        completed: false,
        partial: false,
      };
      bucket.minutes += (next - cursor) / 60000;
      if (!bucket.sessions.some((item) => item.id === session.id)) bucket.sessions.push(session);
      result.set(key, bucket);
      cursor = next;
    }
  }
  for (const bucket of result.values()) {
    const done = bucket.sessions.filter((session) => session.completed).length;
    bucket.completed = done === bucket.sessions.length;
    bucket.partial = done > 0 && done < bucket.sessions.length;
  }
  return result;
}
export function plannerIntensity(minutes: number) {
  return minutes <= 0 ? 0 : minutes <= 15 ? 1 : minutes <= 30 ? 2 : minutes <= 45 ? 3 : 4;
}
export function visibleHours(
  sessions: PlannedSession[],
  preferences: Preferences,
  days?: string[],
) {
  const buckets = [...allocateToHourBuckets(sessions, preferences.timeZone).values()].filter(
    (bucket) => !days || days.includes(bucket.day),
  );
  const first = Math.min(preferences.visibleStartHour, ...buckets.map((bucket) => bucket.hour));
  const last = Math.max(preferences.visibleEndHour, ...buckets.map((bucket) => bucket.hour + 1));
  return Array.from({ length: last - first }, (_, index) => first + index);
}
export function completedFocus(sessions: FocusSession[]) {
  return sessions.filter((session) => session.phase === 'focus' && session.status === 'completed');
}
export type DayActivity = {
  date: string;
  sessions: FocusSession[];
  count: number;
  minutes: number;
  future: boolean;
};
export function activityDays(
  sessions: FocusSession[],
  preferences: Pick<Preferences, 'timeZone' | 'weekStartsOn'>,
  now: Date | string | number = new Date(),
  weeks = 52,
): DayActivity[] {
  const today = dateKey(now, preferences.timeZone);
  const start = weekDays(now, preferences, -(weeks - 1))[0];
  const grouped = new Map<string, FocusSession[]>();
  for (const session of completedFocus(sessions)) {
    const day = dateKey(session.endedAt, preferences.timeZone);
    grouped.set(day, [...(grouped.get(day) || []), session]);
  }
  return Array.from({ length: weeks * 7 }, (_, index) => {
    const day = addDays(start, index);
    const records = grouped.get(day) || [];
    return {
      date: day,
      sessions: records,
      count: records.length,
      minutes: records.reduce((sum, session) => sum + session.actualSeconds / 60, 0),
      future: day > today,
    };
  });
}
export function calculateMetrics(
  data: WorkspaceData,
  now: Date | string | number = new Date(),
  userId?: string,
) {
  const sessions = completedFocus(data.focusSessions).filter(
    (session) => !userId || session.userId === userId,
  );
  const today = dateKey(now, data.preferences.timeZone);
  const week = weekDays(now, data.preferences);
  const todaySessions = sessions.filter(
    (session) => dateKey(session.endedAt, data.preferences.timeZone) === today,
  );
  const weekSessions = sessions.filter((session) =>
    week.includes(dateKey(session.endedAt, data.preferences.timeZone)),
  );
  const productiveDays = new Set(
    sessions.map((session) => dateKey(session.endedAt, data.preferences.timeZone)),
  );
  let cursor = productiveDays.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (productiveDays.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  const bySubject: Record<string, number> = {};
  const byProject: Record<string, number> = {};
  for (const session of sessions) {
    const subject = session.context.subjectId || 'unassigned';
    const project = session.context.projectId || 'unassigned';
    bySubject[subject] = (bySubject[subject] || 0) + session.actualSeconds / 60;
    byProject[project] = (byProject[project] || 0) + session.actualSeconds / 60;
  }
  return {
    todayCount: todaySessions.length,
    todayMinutes: todaySessions.reduce((sum, session) => sum + session.actualSeconds / 60, 0),
    weekCount: weekSessions.length,
    weekMinutes: weekSessions.reduce((sum, session) => sum + session.actualSeconds / 60, 0),
    totalCount: sessions.length,
    totalMinutes: sessions.reduce((sum, session) => sum + session.actualSeconds / 60, 0),
    streak,
    goalProgress: Math.min(1, todaySessions.length / data.preferences.dailyGoal),
    bySubject,
    byProject,
    plannedMinutes: [
      ...allocateToHourBuckets(
        data.plannedSessions.filter((session) => !userId || session.userId === userId),
        data.preferences.timeZone,
      ).values(),
    ]
      .filter((bucket) => week.includes(bucket.day))
      .reduce((sum, bucket) => sum + bucket.minutes, 0),
  };
}
export function contrastRatio(first: string, second: string) {
  const luminance = (hex: string) => {
    const rgb = [1, 3, 5]
      .map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
      .map((channel) =>
        channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
      );
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
