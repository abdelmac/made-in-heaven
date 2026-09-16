import { describe, expect, it } from 'vitest';
import { createDemoData, id, workspaceDataSchema } from '../src/lib/model';
import {
  createTaskOccurrences,
  preparePlannedOccurrences,
  recurrenceDates,
} from '../src/lib/recurrence';

function fixture() {
  const data = createDemoData(new Date('2026-03-20T08:00:00Z'));
  data.preferences.timeZone = 'Europe/Paris';
  const session = { ...data.plannedSessions[0], startsAt: '2026-03-27T08:00:00.000Z' };
  data.plannedSessions = [];
  return { data, session };
}

describe('finite task and planner recurrence', () => {
  it('advances actual calendar dates across month, year and leap-day boundaries', () => {
    expect(recurrenceDates('2028-02-28', { frequency: 'daily', count: 3 })).toEqual([
      '2028-02-28',
      '2028-02-29',
      '2028-03-01',
    ]);
    expect(recurrenceDates('2026-12-28', { frequency: 'weekly', count: 2 })).toEqual([
      '2026-12-28',
      '2027-01-04',
    ]);
    expect(recurrenceDates('2026-09-14', { frequency: 'none', count: 500 })).toEqual([
      '2026-09-14',
    ]);
    for (const count of [0, -1, 1.5, 53, NaN])
      expect(() => recurrenceDates('2026-09-14', { frequency: 'daily', count })).toThrow(
        /occurrences/,
      );
    expect(() => recurrenceDates('2026-02-30', { frequency: 'weekly', count: 2 })).toThrow(
      /valide/,
    );
    expect(() => recurrenceDates('9999-12-31', { frequency: 'daily', count: 2 })).toThrow(/limite/);
  });

  it('creates separately editable tasks with unique unchecked checklists and due dates', () => {
    const { data } = fixture();
    const task = { ...data.tasks[0], dueDate: '2026-09-14' };
    task.checklist[0].done = true;
    const before = structuredClone(task);
    const records = createTaskOccurrences(task, { frequency: 'weekly', count: 3 });
    expect(records.map((record) => record.dueDate)).toEqual([
      '2026-09-14',
      '2026-09-21',
      '2026-09-28',
    ]);
    expect(new Set(records.map((record) => record.id)).size).toBe(3);
    expect(records[0].id).toBe(task.id);
    const checklists = records.flatMap((record) => record.checklist);
    expect(new Set(checklists.map((item) => item.id)).size).toBe(checklists.length);
    expect(checklists.every((item) => !item.done && item.id !== task.checklist[0].id)).toBe(true);
    expect(records[1].status).toBe('todo');
    expect(task).toEqual(before);
    expect(workspaceDataSchema.safeParse({ ...data, tasks: records }).success).toBe(true);
    records[0].title = 'Une seule occurrence modifiée';
    expect(records[1].title).toBe(task.title);
    expect(() =>
      createTaskOccurrences({ ...task, dueDate: undefined }, { frequency: 'daily', count: 2 }),
    ).toThrow(/date/);
  });

  it('preserves local wall time and actual duration across spring and autumn DST', () => {
    const { data, session } = fixture();
    const spring = preparePlannedOccurrences(data, session, { frequency: 'weekly', count: 2 });
    expect(spring.map((record) => record.startsAt)).toEqual([
      '2026-03-27T08:00:00.000Z',
      '2026-04-03T07:00:00.000Z',
    ]);
    const autumn = preparePlannedOccurrences(
      data,
      { ...session, startsAt: '2026-10-23T07:00:00.000Z' },
      { frequency: 'weekly', count: 2 },
    );
    expect(autumn.map((record) => record.startsAt)).toEqual([
      '2026-10-23T07:00:00.000Z',
      '2026-10-30T08:00:00.000Z',
    ]);
    expect(autumn.every((record) => record.durationMinutes === session.durationMinutes)).toBe(true);
    expect(workspaceDataSchema.safeParse({ ...data, plannedSessions: spring }).success).toBe(true);
  });

  it('rejects the entire series if a later local time does not exist', () => {
    const { data, session } = fixture();
    const before = structuredClone(data);
    expect(() =>
      preparePlannedOccurrences(
        data,
        { ...session, startsAt: '2026-03-28T01:30:00.000Z' },
        { frequency: 'daily', count: 3 },
      ),
    ).toThrow(/2026-03-29/);
    expect(data).toEqual(before);
  });

  it('rejects a later overlap without mutating or inserting the first occurrence', () => {
    const { data, session } = fixture();
    const conflict = { ...session, id: id(), startsAt: '2026-04-03T07:05:00.000Z' };
    data.plannedSessions.push(conflict);
    const before = structuredClone(data);
    expect(() =>
      preparePlannedOccurrences(data, session, { frequency: 'weekly', count: 3 }),
    ).toThrow(/chevauche/);
    expect(data).toEqual(before);
    conflict.userId = id();
    const records = preparePlannedOccurrences(data, session, { frequency: 'weekly', count: 3 });
    expect(records).toHaveLength(3);
    expect(new Set(records.map((record) => record.id)).size).toBe(3);
    expect(() =>
      preparePlannedOccurrences(
        data,
        { ...session, workspaceId: id() },
        { frequency: 'none', count: 1 },
      ),
    ).toThrow(/autre espace/);
  });

  it('edits only the selected occurrence and preserves an existing ambiguous-hour instant', () => {
    const { data, session } = fixture();
    session.startsAt = '2026-10-25T01:30:00.000Z';
    data.plannedSessions = [session];
    const records = preparePlannedOccurrences(data, session, { frequency: 'none', count: 1 });
    expect(records).toEqual([session]);
  });
});
