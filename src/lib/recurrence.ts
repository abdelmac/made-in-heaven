import { addDays, dateKey, findOverlap, zonedDateTime, zonedParts } from './calendar';
import { id, type PlannedSession, type Task, type WorkspaceData } from './model';

export type RepeatFrequency = 'none' | 'daily' | 'weekly';
export type RepeatOptions = { frequency: RepeatFrequency; count: number };
export const MAX_REPEAT_COUNT = 52;

/** Finite, materialized occurrences keep local/offline and cloud documents compatible. */
export function recurrenceDates(firstDay: string, repeat: RepeatOptions): string[] {
  if (!['none', 'daily', 'weekly'].includes(repeat.frequency))
    throw new Error('Choisissez une fréquence de répétition valide.');
  const count = repeat.frequency === 'none' ? 1 : repeat.count;
  if (!Number.isInteger(count) || count < 1 || count > MAX_REPEAT_COUNT)
    throw new Error(`Choisissez entre 1 et ${MAX_REPEAT_COUNT} occurrences.`);
  const parsed = new Date(`${firstDay}T12:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(firstDay) ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== firstDay
  )
    throw new Error('Une date de départ valide est nécessaire pour répéter cet élément.');
  const interval = repeat.frequency === 'weekly' ? 7 : 1;
  return Array.from({ length: count }, (_, index) => {
    const day = addDays(firstDay, interval * index);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day))
      throw new Error('La dernière date dépasse la limite du calendrier.');
    return day;
  });
}

export function createTaskOccurrences(task: Task, repeat: RepeatOptions): Task[] {
  if (repeat.frequency === 'none') return [task];
  const days = recurrenceDates(task.dueDate || '', repeat);
  return days.map((dueDate, index) => ({
    ...structuredClone(task),
    id: index === 0 ? task.id : id(),
    dueDate,
    status: index === 0 ? task.status : 'todo',
    checklist: task.checklist.map((item) => ({ ...item, id: id(), done: false })),
  }));
}

/** Validate every occurrence against the latest draft before any insertion. */
export function preparePlannedOccurrences(
  data: WorkspaceData,
  session: PlannedSession,
  repeat: RepeatOptions,
): PlannedSession[] {
  if (session.workspaceId !== data.workspaceId)
    throw new Error('Cette séance appartient à un autre espace de travail.');
  const timeZone = data.preferences.timeZone;
  const local = zonedParts(session.startsAt, timeZone);
  const time = `${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}`;
  const days = recurrenceDates(dateKey(session.startsAt, timeZone), repeat);
  const records = days.map((day, index) => {
    let startsAt = session.startsAt;
    if (index > 0) {
      try {
        startsAt = zonedDateTime(day, time, timeZone);
      } catch {
        throw new Error(
          `L'heure ${time} n'existe pas le ${day} dans ${timeZone}. Choisissez une autre heure pour la série.`,
        );
      }
    }
    return {
      ...session,
      id: index === 0 ? session.id : id(),
      startsAt,
      completed: index === 0 ? session.completed : false,
    };
  });
  const existing = data.plannedSessions.filter((item) => item.id !== session.id);
  for (const record of records) {
    if (findOverlap(record, [...existing, ...records]))
      throw new Error(
        `Une séance se chevauche avec celle du ${dateKey(record.startsAt, timeZone)} à ${time}. Aucun élément n'a été enregistré.`,
      );
  }
  return records;
}
