import { describe, expect, it } from 'vitest';
import { exportCalendar, foldCalendarLine } from '../src/lib/calendar-export';
import { createDemoData, id, LOCAL_USER_ID } from '../src/lib/model';

function fixture() {
  const data = createDemoData(new Date('2026-09-14T08:00:00Z'));
  const session = {
    ...data.plannedSessions[0],
    startsAt: '2026-09-14T07:00:00.000Z',
    durationMinutes: 25,
  };
  const options = {
    workspaceId: data.workspaceId,
    userId: LOCAL_USER_ID,
    startDay: '2026-09-14',
    endDay: '2026-09-20',
    timeZone: 'Europe/Paris',
    now: new Date('2026-09-14T08:00:00Z'),
  };
  return { data, session, options };
}

describe('private iCalendar export', () => {
  it('exports stable event UIDs, UTC instants and elapsed duration', () => {
    const { session, options } = fixture();
    const result = exportCalendar([session], options);
    expect(result.count).toBe(1);
    const unfolded = result.text.replace(/\r\n /g, '');
    expect(unfolded).toContain(`UID:${session.workspaceId}-${session.id}@solace\r\n`);
    expect(unfolded).toContain('DTSTART:20260914T070000Z\r\nDTEND:20260914T072500Z');
    expect(unfolded).toContain('DTSTAMP:20260914T080000Z');
    expect(unfolded).toContain('CLASS:PRIVATE');
    const repeated = exportCalendar([{ ...session, title: 'Titre mis à jour' }], {
      ...options,
      now: new Date('2026-09-15T08:00:00Z'),
    });
    expect(repeated.text.replace(/\r\n /g, '').match(/^UID:.+$/m)?.[0]).toBe(
      unfolded.match(/^UID:.+$/m)?.[0],
    );
    expect(result.text.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('exports only this user, workspace, and inclusive local date range', () => {
    const { session, options } = fixture();
    const sessions = [
      session,
      { ...session, id: id(), userId: id(), title: 'Private teammate title' },
      { ...session, id: id(), workspaceId: id(), title: 'Other workspace title' },
      { ...session, id: id(), startsAt: '2026-09-20T22:00:00.000Z', title: 'Next week' },
      {
        ...session,
        id: id(),
        startsAt: '2026-09-13T21:45:00.000Z',
        durationMinutes: 15,
        title: 'Ends exactly before the week',
      },
      {
        ...session,
        id: id(),
        startsAt: '2026-09-13T21:45:00.000Z',
        durationMinutes: 30,
        title: 'Spans local midnight',
      },
    ];
    const result = exportCalendar(sessions, options);
    expect(result.count).toBe(2);
    expect(result.text).toContain('Spans local midnight');
    for (const text of [
      'Private teammate title',
      'Other workspace title',
      'Next week',
      'Ends exactly before',
    ])
      expect(result.text).not.toContain(text);
    expect(exportCalendar([], options).count).toBe(0);
    expect(() => exportCalendar([], { ...options, endDay: '2026-09-13' })).toThrow(/fin/);
    expect(() => exportCalendar([], { ...options, endDay: '2026-02-30' })).toThrow(/valide/);
  });

  it('escapes hostile newlines and text delimiters without creating calendar properties', () => {
    const { session, options } = fixture();
    session.title = 'Révision, maths; \\ idées\r\nATTENDEE:mailto:intruder@example.com';
    session.notes = 'Première ligne\rBEGIN:VEVENT\nFin\u0000';
    const text = exportCalendar([session], options).text;
    const unfolded = text.replace(/\r\n /g, '');
    expect(unfolded).toContain(
      'SUMMARY:Révision\\, maths\\; \\\\ idées\\nATTENDEE:mailto:intruder@example.com',
    );
    expect(unfolded).not.toMatch(/^ATTENDEE:/m);
    expect(unfolded.match(/^BEGIN:VEVENT$/gm)).toHaveLength(1);
    expect(unfolded).not.toContain('\u0000');
  });

  it('folds to 75 UTF-8 octets while preserving accents and emoji on unfolding', () => {
    const line = 'SUMMARY:' + 'Révisions 🧠 日本語 '.repeat(12);
    const folded = foldCalendarLine(line);
    expect(folded.replace(/\r\n /g, '')).toBe(line);
    for (const part of folded.split('\r\n')) {
      expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
      expect(part).not.toContain('�');
    }
  });
});
