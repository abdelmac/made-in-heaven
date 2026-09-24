import type { MoodEntry, WorkspaceData } from './model';
import { dateKey, shiftDate } from './display';
import { shiftActivityMonth } from './activity-range';

export function moodMonth(month: string, weekStartsOn: 0 | 1) {
  const first = `${shiftActivityMonth(month, 0)}-01`;
  const end = new Date(`${first}T12:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  return {
    leading: (new Date(`${first}T12:00:00Z`).getUTCDay() - weekStartsOn + 7) % 7,
    days: Array.from({ length: end.getUTCDate() }, (_, index) => shiftDate(first, index)),
  };
}

export function moodFocusMinutes(
  data: WorkspaceData,
  userId: string,
  day: string,
  now = new Date(),
) {
  return data.focusSessions
    .filter(
      (session) =>
        session.userId === userId &&
        session.workspaceId === data.workspaceId &&
        session.phase === 'focus' &&
        session.status === 'completed' &&
        Date.parse(session.endedAt) <= now.getTime() &&
        dateKey(session.endedAt, data.preferences.timeZone) === day,
    )
    .reduce((sum, session) => sum + session.actualSeconds / 60, 0);
}

export function saveMoodEntry(entries: MoodEntry[], entry: MoodEntry, today: string) {
  if (entry.date > today) throw new Error('Choisissez aujourd’hui ou une date passée.');
  return [...entries.filter((item) => item.date !== entry.date), entry].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
}

export function formatMoodDay(day: string, short = false) {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'UTC',
    weekday: short ? 'short' : 'long',
    day: 'numeric',
    month: short ? 'short' : 'long',
  }).format(new Date(`${day}T12:00:00Z`));
}
