import type { Preferences, WorkspaceData, FocusSession } from './model';
export function dateKey(value: Date | string | number, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}
export function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function startWeek(date: string, start: 0 | 1) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return shiftDate(date, -((day - start + 7) % 7));
}
export function formatDay(
  value: Date | string | number,
  preferences: Preferences,
  options?: Intl.DateTimeFormatOptions,
) {
  const date = new Date(value);
  const format = preferences.dateFormat;
  if (options)
    return new Intl.DateTimeFormat('fr-FR', { timeZone: preferences.timeZone, ...options }).format(
      date,
    );
  if (format === 'yyyy-MM-dd') return dateKey(date, preferences.timeZone);
  return new Intl.DateTimeFormat(format === 'MM/dd/yyyy' ? 'en-US' : 'fr-FR', {
    timeZone: preferences.timeZone,
    year: 'numeric',
    month: format === 'MMM d, yyyy' ? 'short' : '2-digit',
    day: format === 'MMM d, yyyy' ? 'numeric' : '2-digit',
  }).format(date);
}
export function formatTime(value: string | Date, preferences: Preferences) {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: preferences.timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: preferences.timeFormat === '12h',
  }).format(new Date(value));
}
export function minutesLabel(minutes: number) {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  return `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${Math.round(minutes % 60)}m` : ''}`;
}
export function completedSessions(data: WorkspaceData) {
  return data.focusSessions.filter(
    (session) => session.phase === 'focus' && session.status === 'completed',
  );
}
export function focusMinutes(sessions: FocusSession[]) {
  return sessions.reduce((sum, session) => sum + session.durationMinutes, 0);
}
export function metricSummary(data: WorkspaceData) {
  const today = dateKey(new Date(), data.preferences.timeZone);
  const week = startWeek(today, data.preferences.weekStartsOn);
  const sessions = completedSessions(data);
  const todays = sessions.filter((s) => dateKey(s.endedAt, data.preferences.timeZone) === today);
  const weeks = sessions.filter((s) => {
    const d = dateKey(s.endedAt, data.preferences.timeZone);
    return d >= week && d <= today;
  });
  const dates = new Set(sessions.map((s) => dateKey(s.endedAt, data.preferences.timeZone)));
  let cursor = dates.has(today) ? today : shiftDate(today, -1);
  let streak = 0;
  while (dates.has(cursor)) {
    streak++;
    cursor = shiftDate(cursor, -1);
  }
  return {
    today,
    todayCount: todays.length,
    todayMinutes: focusMinutes(todays),
    weekMinutes: focusMinutes(weeks),
    streak,
    sessions,
  };
}
