import { describe, expect, it } from 'vitest';
import {
  activityForRange,
  activityViewStorageKey,
  monthActivityDays,
  parseActivityViewPreference,
  shiftActivityMonth,
} from '../src/lib/activity-range';
import { dateKey } from '../src/lib/calendar';
import { id, LOCAL_USER_ID, type FocusSession } from '../src/lib/model';

const workspaceId = id();
const subjectId = id();
const projectId = id();
const preferences = { timeZone: 'UTC', weekStartsOn: 1 as const };
const now = '2026-11-15T12:00:00Z';
function session(endedAt: string, minutes = 25, patch: Partial<FocusSession> = {}): FocusSession {
  return {
    id: id(),
    workspaceId,
    userId: LOCAL_USER_ID,
    phase: 'focus',
    status: 'completed',
    startedAt: new Date(Date.parse(endedAt) - minutes * 60_000).toISOString(),
    endedAt,
    durationMinutes: 25,
    actualSeconds: minutes * 60,
    context: { workspaceId, userId: LOCAL_USER_ID, subjectId, projectId },
    ...patch,
  };
}
function range(
  sessions: FocusSession[],
  options: Partial<Parameters<typeof activityForRange>[0]> = {},
) {
  return activityForRange({
    sessions,
    preferences,
    view: 'month',
    month: '2026-10',
    workspaceId,
    userId: LOCAL_USER_ID,
    now,
    ...options,
  });
}

describe('activity calendar ranges', () => {
  it('validates device preferences and keeps identities and workspaces isolated', () => {
    const valid = { version: 1, view: 'month', month: '2024-02' };
    expect(parseActivityViewPreference(JSON.stringify(valid))).toEqual(valid);
    expect(
      parseActivityViewPreference(JSON.stringify({ version: 1, view: 'year', month: null })),
    ).toEqual({ version: 1, view: 'year', month: null });
    for (const value of [
      null,
      '{broken',
      JSON.stringify({ ...valid, version: 2 }),
      JSON.stringify({ ...valid, view: 'week' }),
      JSON.stringify({ ...valid, month: '2026-13' }),
      JSON.stringify({ ...valid, month: '0000-01' }),
      JSON.stringify({ ...valid, month: { value: '2026-01' } }),
      JSON.stringify({ ...valid, role: 'owner' }),
      JSON.stringify([]),
    ]) {
      expect(parseActivityViewPreference(value)).toBeNull();
    }
    const first = activityViewStorageKey(LOCAL_USER_ID, workspaceId);
    expect(activityViewStorageKey(id(), workspaceId)).not.toBe(first);
    expect(activityViewStorageKey(LOCAL_USER_ID, id())).not.toBe(first);
  });
  it('includes leap day without borrowing sessions from the surrounding months', () => {
    const records = [
      session('2024-01-31T23:55:00Z'),
      session('2024-02-29T12:00:00Z', 17.5),
      session('2024-03-01T00:05:00Z'),
    ];
    const result = range(records, { month: '2024-02' });
    expect(result.days).toHaveLength(29);
    expect(result.leadingDays).toBe(3);
    expect(result.days[0].date).toBe('2024-02-01');
    expect(result.days.at(-1)?.date).toBe('2024-02-29');
    expect(result.count).toBe(1);
    expect(result.minutes).toBe(17.5);
    expect(result.days.at(-1)?.sessions).toEqual([records[1]]);
  });

  it('aligns Sunday and Monday starts, including a four-week February', () => {
    const sunday = monthActivityDays([], { ...preferences, weekStartsOn: 0 }, '2026-02', now);
    const monday = monthActivityDays([], preferences, '2026-02', now);
    expect(sunday.days).toHaveLength(28);
    expect(sunday.leadingDays).toBe(0);
    expect(monday.leadingDays).toBe(6);
    expect(new Set(monday.days.map((day) => day.date)).size).toBe(28);
    expect(shiftActivityMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftActivityMonth('2027-01', -1)).toBe('2026-12');
    expect(() => shiftActivityMonth('2026-13', 1)).toThrow(/calendar month/);
  });

  it('uses the workspace calendar date at year boundaries in UTC+14', () => {
    const instant = '2026-12-31T12:00:00Z';
    const zone = { ...preferences, timeZone: 'Pacific/Kiritimati' };
    const month = dateKey(instant, zone.timeZone).slice(0, 7);
    const result = range([session('2026-12-31T11:00:00Z')], {
      preferences: zone,
      month,
      now: instant,
    });
    expect(month).toBe('2027-01');
    expect(result.days[0]).toMatchObject({ date: '2027-01-01', count: 1, future: false });
    expect(result.leadingDays).toBe(4);
    expect(result.days[1]).toMatchObject({ date: '2027-01-02', count: 0, future: true });
  });

  it('groups both repeated DST hours on the same day and respects zoned month boundaries', () => {
    const records = [
      session('2026-10-25T00:30:00Z', 20),
      session('2026-10-25T01:30:00Z', 30),
      session('2026-10-31T23:15:00Z', 40),
    ];
    const result = range(records, { preferences: { ...preferences, timeZone: 'Europe/Paris' } });
    expect(result.days.find((day) => day.date === '2026-10-25')).toMatchObject({
      count: 2,
      minutes: 50,
    });
    expect(result.count).toBe(2);
    expect(result.minutes).toBe(50);
    const spring = range([], {
      month: '2026-03',
      preferences: { ...preferences, timeZone: 'Europe/Paris' },
    });
    expect(spring.days.slice(27, 30).map((day) => day.date)).toEqual([
      '2026-03-28',
      '2026-03-29',
      '2026-03-30',
    ]);
  });

  it('keeps workspace, actor, subject, project, status and inclusive date filters identical in totals and details', () => {
    const own = session('2026-10-25T12:00:00Z', 12.5);
    const records = [
      own,
      session('2026-10-24T12:00:00Z'),
      session('2026-10-26T12:00:00Z'),
      session('2026-10-25T12:00:00Z', 25, { userId: id() }),
      session('2026-10-25T12:00:00Z', 25, { workspaceId: id() }),
      session('2026-10-25T12:00:00Z', 25, { context: { ...own.context, subjectId: id() } }),
      session('2026-10-25T12:00:00Z', 25, { context: { ...own.context, projectId: id() } }),
      session('2026-10-25T12:00:00Z', 25, { status: 'skipped' }),
      session('2026-10-25T12:00:00Z', 25, { status: 'interrupted' }),
      session('2026-10-25T12:00:00Z', 25, { phase: 'shortBreak' }),
    ];
    const before = structuredClone(records);
    const result = range(records, { subjectId, projectId, from: '2026-10-25', to: '2026-10-25' });
    expect(result.count).toBe(1);
    expect(result.minutes).toBe(12.5);
    expect(result.days.flatMap((day) => day.sessions)).toEqual([own]);
    expect(records).toEqual(before);
    expect(range(records, { from: '2026-10-26', to: '2026-10-25' }).count).toBe(0);
  });

  it('retains the rolling 52-week view while month navigation can reveal older history', () => {
    const old = session('2024-02-29T12:00:00Z');
    const recent = session('2026-11-14T12:00:00Z');
    const future = session('2026-11-16T12:00:00Z');
    const records = [old, recent, future];
    const annual = range(records, { view: 'year' });
    expect(annual.days).toHaveLength(364);
    expect(annual.count).toBe(1);
    expect(range(records, { month: '2024-02' }).count).toBe(1);
    const month = range(records, { month: '2026-11' });
    expect(month.count).toBe(1);
    expect(month.days.find((day) => day.date === '2026-11-16')).toMatchObject({
      future: true,
      count: 0,
    });
  });
});
