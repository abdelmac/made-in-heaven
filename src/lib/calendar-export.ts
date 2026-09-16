import { dateKey } from './calendar';
import type { PlannedSession } from './model';

/** RFC 5545 sections 3.1 and 3.3.11: escape TEXT before folding UTF-8 lines. */
function escapeText(value: string) {
  return value
    .replaceAll('\\', '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '');
}

export function foldCalendarLine(line: string): string {
  const encoder = new TextEncoder();
  let result = '';
  let bytes = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (bytes + size > 75) {
      result += '\r\n ';
      bytes = 1;
    }
    result += character;
    bytes += size;
  }
  return result;
}

function stamp(value: string | Date) {
  return new Date(value)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

export function exportCalendar(
  sessions: PlannedSession[],
  options: {
    workspaceId: string;
    userId: string;
    startDay: string;
    endDay: string;
    timeZone: string;
    now?: Date;
  },
): { text: string; count: number } {
  for (const day of [options.startDay, options.endDay]) {
    const parsed = new Date(`${day}T12:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== day
    )
      throw new Error("Choisissez une période d'export valide.");
  }
  if (options.startDay > options.endDay)
    throw new Error("La fin de l'export doit suivre son début.");
  const selected = sessions
    .filter((session) => {
      if (session.workspaceId !== options.workspaceId || session.userId !== options.userId)
        return false;
      const end = Date.parse(session.startsAt) + session.durationMinutes * 60000;
      return (
        dateKey(session.startsAt, options.timeZone) <= options.endDay &&
        dateKey(end - 1, options.timeZone) >= options.startDay
      );
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id));
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Solace//Planning//FR',
    'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:Solace',
  ];
  for (const session of selected) {
    const end = new Date(Date.parse(session.startsAt) + session.durationMinutes * 60000);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${encodeURIComponent(session.workspaceId)}-${encodeURIComponent(session.id)}@solace`,
      `DTSTAMP:${stamp(options.now || new Date())}`,
      `CREATED:${stamp(session.createdAt)}`,
      `LAST-MODIFIED:${stamp(session.updatedAt)}`,
      `DTSTART:${stamp(session.startsAt)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${escapeText(session.title)}`,
      `DESCRIPTION:${escapeText([session.notes, session.completed ? 'Séance terminée dans Solace.' : 'Séance planifiée dans Solace.'].filter(Boolean).join('\n\n'))}`,
      'CLASS:PRIVATE',
      'STATUS:CONFIRMED',
      'TRANSP:OPAQUE',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return { text: lines.map(foldCalendarLine).join('\r\n') + '\r\n', count: selected.length };
}
