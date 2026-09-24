import { describe, expect, it } from 'vitest';
import { createDemoData, id } from '../src/lib/model';
import { plannerDateRange, plannerDays, shiftPlannerDate } from '../src/lib/planner-calendar';

describe('planner calendar ranges and entries', () => {
  it('builds exact leap months and respects the first day of the week', () => {
    const month = plannerDateRange('month', '2024-02-20', 1);
    expect(month.days).toHaveLength(29);
    expect(month).toMatchObject({ start: '2024-02-01', end: '2024-02-29', leadingDays: 3 });
    expect(plannerDateRange('month', '2026-02-20', 0)).toMatchObject({ leadingDays: 0 });
    expect(plannerDateRange('month', '2026-02-20', 0).days).toHaveLength(28);
    expect(plannerDateRange('week', '2026-09-20', 1).days).toEqual([
      '2026-09-14',
      '2026-09-15',
      '2026-09-16',
      '2026-09-17',
      '2026-09-18',
      '2026-09-19',
      '2026-09-20',
    ]);
    expect(plannerDateRange('agenda', '2026-09-20', 0).start).toBe('2026-09-20');
  });

  it('clamps long month dates and navigates across years', () => {
    expect(shiftPlannerDate('2024-01-31', 1, 'month')).toBe('2024-02-29');
    expect(shiftPlannerDate('2026-03-31', -1, 'month')).toBe('2026-02-28');
    expect(shiftPlannerDate('2026-12-31', 1, 'month')).toBe('2027-01-31');
    expect(shiftPlannerDate('2026-12-31', 1, 'agenda')).toBe('2027-01-07');
    expect(() => plannerDateRange('month', '2026-02-31', 1)).toThrow(/date valide/);
  });

  it('bounds native month-input extremes without letting week navigation leave supported years', () => {
    expect(plannerDateRange('week', '0001-01-01', 0).start).toBe('0001-01-01');
    expect(plannerDateRange('agenda', '9999-12-31', 1).end).toBe('9999-12-31');
    expect(() => shiftPlannerDate('0001-01-01', -1, 'week')).toThrow();
    expect(() => shiftPlannerDate('9999-12-31', 1, 'week')).toThrow();
    expect(() => shiftPlannerDate('0001-01-01', -1, 'month')).toThrow();
  });

  it('allocates midnight crossings to both days without counting hourly buckets as sessions', () => {
    const data = createDemoData(new Date('2026-09-14T08:00:00Z'));
    const plan = {
      ...data.plannedSessions[0],
      startsAt: '2026-09-30T23:30:00Z',
      durationMinutes: 120,
    };
    const result = plannerDays(['2026-09-30', '2026-10-01'], [plan], [], 'UTC', data.workspaceId);
    expect(
      result.map((day) => ({ date: day.date, count: day.sessions.length, minutes: day.minutes })),
    ).toEqual([
      { date: '2026-09-30', count: 1, minutes: 30 },
      { date: '2026-10-01', count: 1, minutes: 90 },
    ]);
    expect(
      plannerDays(
        plannerDateRange('month', '2026-10-03', 1).days,
        [plan],
        [],
        'UTC',
        data.workspaceId,
      )[0].minutes,
    ).toBe(90);
  });

  it('uses zoned dates for sessions but preserves literal task due dates', () => {
    const data = createDemoData(new Date('2026-09-14T08:00:00Z'));
    const plan = {
      ...data.plannedSessions[0],
      startsAt: '2026-09-30T10:30:00Z',
      durationMinutes: 45,
    };
    const task = { ...data.tasks[0], dueDate: '2026-09-30' };
    const before = structuredClone({ plan, task });
    const days = plannerDays(
      ['2026-09-30', '2026-10-01'],
      [plan],
      [task],
      'Pacific/Kiritimati',
      data.workspaceId,
    );
    expect(days[0]).toMatchObject({ tasks: [task], sessions: [], minutes: 0 });
    expect(days[1]).toMatchObject({ tasks: [], sessions: [plan], minutes: 45 });
    expect({ plan, task }).toEqual(before);
  });

  it('keeps elapsed focus minutes intact across the repeated DST hour', () => {
    const data = createDemoData(new Date('2026-09-14T08:00:00Z'));
    const plan = {
      ...data.plannedSessions[0],
      startsAt: '2026-10-25T00:30:00Z',
      durationMinutes: 120,
    };
    const result = plannerDays(['2026-10-25'], [plan], [], 'Europe/Paris', data.workspaceId);
    expect(result[0]).toMatchObject({ sessions: [plan], minutes: 120 });
  });

  it('never pulls foreign workspace records or dates outside the requested range', () => {
    const data = createDemoData(new Date('2026-09-14T08:00:00Z'));
    const foreign = id();
    const plans = data.plannedSessions.map((plan) => ({
      ...plan,
      startsAt: '2026-09-14T09:00:00Z',
      workspaceId: foreign,
    }));
    const tasks = [
      { ...data.tasks[0], dueDate: '2026-09-14', workspaceId: foreign },
      { ...data.tasks[1], dueDate: '2026-09-15' },
    ];
    expect(plannerDays(['2026-09-14'], plans, tasks, 'UTC', data.workspaceId)).toEqual([
      { date: '2026-09-14', sessions: [], tasks: [], minutes: 0 },
    ]);
  });
});
