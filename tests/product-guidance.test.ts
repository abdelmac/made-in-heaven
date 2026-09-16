import { describe, expect, it } from 'vitest';
import { createEmptyData, id, LOCAL_USER_ID, workspaceDataSchema } from '@/lib/model';
import { addStarterPlan } from '@/lib/getting-started';
import { workSummary } from '@/lib/work-summary';

function fixture() {
  const data = createEmptyData();
  data.preferences.timeZone = 'Europe/Paris';
  addStarterPlan(data, LOCAL_USER_ID, {
    subject: 'Japonais',
    task: 'Réviser',
    date: '2026-09-16',
    time: '09:00',
    duration: 25,
  });
  return data;
}

describe('guided first workspace', () => {
  it('creates linked subject/task/plan without inventing completed work and rejects duplicate setup', () => {
    const data = fixture();
    expect(workspaceDataSchema.safeParse(data).success).toBe(true);
    expect(data.plannedSessions[0]).toMatchObject({
      taskId: data.tasks[0].id,
      subjectId: data.subjects[0].id,
      startsAt: '2026-09-16T07:00:00.000Z',
      completed: false,
    });
    expect(data.focusSessions).toEqual([]);
    expect(() =>
      addStarterPlan(data, LOCAL_USER_ID, {
        subject: 'Autre',
        task: 'Encore',
        date: '2026-09-16',
        time: '09:00',
        duration: 25,
      }),
    ).toThrow('contient déjà');
    expect(data.tasks).toHaveLength(1);
  });
  it('rejects impossible clock-change times before adding anything', () => {
    const data = createEmptyData();
    data.preferences.timeZone = 'Europe/Paris';
    expect(() =>
      addStarterPlan(data, LOCAL_USER_ID, {
        subject: 'Japonais',
        task: 'Réviser',
        date: '2026-03-29',
        time: '02:30',
        duration: 25,
      }),
    ).toThrow();
    expect(data.subjects).toHaveLength(0);
  });
});

describe('personal work summary', () => {
  it('counts completed personal focus only, clips plans at midnight and excludes future history', () => {
    const data = fixture();
    data.plannedSessions[0].startsAt = '2026-09-15T21:50:00Z';
    data.plannedSessions[0].durationMinutes = 30;
    const session = {
      id: id(),
      workspaceId: data.workspaceId,
      userId: LOCAL_USER_ID,
      phase: 'focus' as const,
      status: 'completed' as const,
      startedAt: '2026-09-16T07:00:00Z',
      endedAt: '2026-09-16T07:25:00Z',
      durationMinutes: 25,
      actualSeconds: 1500,
      context: { workspaceId: data.workspaceId, userId: LOCAL_USER_ID },
    };
    data.focusSessions.push(
      session,
      { ...session, id: id(), status: 'skipped' },
      { ...session, id: id(), phase: 'shortBreak' },
      { ...session, id: id(), userId: id() },
      { ...session, id: id(), endedAt: '2026-09-17T07:25:00Z' },
    );
    const result = workSummary(data, LOCAL_USER_ID, 'day', Date.parse('2026-09-16T12:00:00Z'));
    expect(result.completedMinutes).toBe(25);
    expect(result.completedCount).toBe(1);
    expect(result.plannedMinutes).toBe(20);
    expect(result.remainingToday).toBe(7);
  });
  it('suggests actionable own or unassigned tasks and keeps blocked work visible', () => {
    const data = fixture(),
      first = data.tasks[0];
    first.dueDate = '2026-09-14';
    first.status = 'blocked';
    data.tasks.push(
      { ...first, id: id(), title: 'Autre personne', assigneeId: id(), status: 'todo' },
      { ...first, id: id(), title: 'Prochaine action', status: 'todo', dueDate: '2026-09-16' },
    );
    const result = workSummary(data, LOCAL_USER_ID, 'week', Date.parse('2026-09-16T12:00:00Z'));
    expect(result.nextTask?.title).toBe('Prochaine action');
    expect(result.overdueCount).toBe(1);
    expect(result.blockedCount).toBe(1);
  });
});
