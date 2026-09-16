import { describe, expect, it } from 'vitest';
import { createDemoData, id, LOCAL_USER_ID, workspaceDataSchema } from '../src/lib/model';
import { isPlannableTask, preparePlannerPlacement } from '../src/lib/planner-placement';

const now = '2026-09-14T08:00:00.000Z';
function fixture() {
  const data = createDemoData(new Date(now));
  data.preferences.timeZone = 'Europe/Paris';
  const plan = data.plannedSessions[0];
  plan.startsAt = '2026-09-14T07:15:00.000Z';
  plan.durationMinutes = 90;
  plan.notes = 'Keep my notes';
  plan.completed = true;
  data.plannedSessions = [plan];
  const source = { kind: 'plan' as const, id: plan.id, workspaceId: data.workspaceId };
  return { data, plan, source };
}

describe('planner placement', () => {
  it('moves to the destination local hour and preserves every other session field', () => {
    const { data, plan, source } = fixture();
    const original = structuredClone(data);
    const result = preparePlannerPlacement(
      data,
      source,
      '2026-09-15',
      13,
      LOCAL_USER_ID,
      true,
      now,
    );
    expect(result.record).toEqual({
      ...plan,
      startsAt: '2026-09-15T11:00:00.000Z',
      updatedAt: now,
    });
    expect(result.changed).toBe(true);
    expect(data).toEqual(original);
    expect(
      workspaceDataSchema.safeParse({ ...data, plannedSessions: [result.record] }).success,
    ).toBe(true);
  });

  it('detects an unchanged slot without touching its timestamp', () => {
    const { data, plan, source } = fixture();
    plan.startsAt = '2026-09-14T07:00:00.000Z';
    const result = preparePlannerPlacement(data, source, '2026-09-14', 9, LOCAL_USER_ID, true);
    expect(result).toEqual({ record: plan, changed: false });
  });

  it('rejects overlap while allowing adjacent sessions and another person at the same time', () => {
    const { data, plan, source } = fixture();
    const other = { ...plan, id: id(), startsAt: '2026-09-15T10:00:00.000Z', durationMinutes: 60 };
    data.plannedSessions.push(other);
    expect(() =>
      preparePlannerPlacement(data, source, '2026-09-15', 12, LOCAL_USER_ID, true),
    ).toThrow(/overlap/);
    expect(
      preparePlannerPlacement(data, source, '2026-09-15', 13, LOCAL_USER_ID, true).changed,
    ).toBe(true);
    other.userId = id();
    expect(
      preparePlannerPlacement(data, source, '2026-09-15', 12, LOCAL_USER_ID, true).record.userId,
    ).toBe(plan.userId);
  });

  it('retains duration across midnight and daylight saving changes', () => {
    const { data, source } = fixture();
    const midnight = preparePlannerPlacement(data, source, '2026-09-15', 23, LOCAL_USER_ID, true);
    expect(midnight.record.durationMinutes).toBe(90);
    expect(new Date(Date.parse(midnight.record.startsAt) + 90 * 60000).toISOString()).toBe(
      '2026-09-15T22:30:00.000Z',
    );
    expect(() =>
      preparePlannerPlacement(data, source, '2026-03-29', 2, LOCAL_USER_ID, true),
    ).toThrow(/clocks change/);
    expect(
      preparePlannerPlacement(data, source, '2026-10-25', 2, LOCAL_USER_ID, true).record.startsAt,
    ).toBe('2026-10-25T00:00:00.000Z');
  });

  it('creates a personal session from a task with its subject/project and preferred focus duration', () => {
    const { data } = fixture();
    const task = data.tasks[1];
    const projectId = id();
    data.projects.push({
      id: projectId,
      workspaceId: data.workspaceId,
      subjectId: task.subjectId,
      name: 'Release',
      description: '',
      archived: false,
      createdAt: now,
      updatedAt: now,
    });
    task.projectId = projectId;
    data.preferences.focusMinutes = 40;
    const source = { kind: 'task' as const, id: task.id, workspaceId: data.workspaceId };
    const result = preparePlannerPlacement(
      data,
      source,
      '2026-09-15',
      14,
      LOCAL_USER_ID,
      true,
      now,
    );
    expect(result.record).toMatchObject({
      taskId: task.id,
      subjectId: task.subjectId,
      projectId,
      title: task.title,
      userId: LOCAL_USER_ID,
      durationMinutes: 40,
      completed: false,
      notes: '',
      createdAt: now,
    });
    expect(result.record.id).not.toBe(task.id);
    expect(
      workspaceDataSchema.safeParse({
        ...data,
        plannedSessions: [...data.plannedSessions, result.record],
      }).success,
    ).toBe(true);
    expect(data.focusSessions).toHaveLength(0);
    expect(task.status).toBe('todo');
  });

  it('rejects read-only, stale workspace and deleted source operations', () => {
    const { data, source } = fixture();
    expect(() =>
      preparePlannerPlacement(data, source, '2026-09-15', 9, LOCAL_USER_ID, false),
    ).toThrow(/read-only/);
    expect(() =>
      preparePlannerPlacement(
        data,
        { ...source, workspaceId: id() },
        '2026-09-15',
        9,
        LOCAL_USER_ID,
        true,
      ),
    ).toThrow(/no longer available/);
    data.plannedSessions = [];
    expect(() =>
      preparePlannerPlacement(data, source, '2026-09-15', 9, LOCAL_USER_ID, true),
    ).toThrow(/no longer available/);
  });

  it('does not schedule completed tasks or tasks in archived subjects/projects', () => {
    const { data } = fixture();
    const task = data.tasks[1];
    const source = { kind: 'task' as const, id: task.id, workspaceId: data.workspaceId };
    task.status = 'done';
    expect(isPlannableTask(data, task)).toBe(false);
    expect(() =>
      preparePlannerPlacement(data, source, '2026-09-15', 9, LOCAL_USER_ID, true),
    ).toThrow(/unfinished/);
    task.status = 'todo';
    data.subjects.find((subject) => subject.id === task.subjectId)!.archived = true;
    expect(isPlannableTask(data, task)).toBe(false);
    data.subjects.find((subject) => subject.id === task.subjectId)!.archived = false;
    data.projects.push({
      id: id(),
      workspaceId: data.workspaceId,
      subjectId: task.subjectId,
      name: 'Archived',
      description: '',
      archived: true,
      createdAt: now,
      updatedAt: now,
    });
    task.projectId = data.projects[0].id;
    expect(isPlannableTask(data, task)).toBe(false);
  });
});
