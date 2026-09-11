import { beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateAdvancedAnalytics, analyticsFiltersSchema } from '@/lib/advanced-analytics';
import { createEmptyData, id, type WorkspaceData } from '@/lib/model';
import { HttpError } from '@/lib/server/http';

const mocks = vi.hoisted(() => ({
  requireWorkspace: vi.fn(),
  assertFeature: vi.fn(),
  read: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/auth', () => ({
  requireWorkspace: mocks.requireWorkspace,
  durableRateLimit: vi.fn(async () => undefined),
}));
vi.mock('@/lib/billing/server', () => ({ assertWorkspaceFeature: mocks.assertFeature }));
vi.mock('@/lib/server/productivity', () => ({ readPermittedProductivity: mocks.read }));
vi.mock('@/lib/supabase/server', () => ({
  getAdminSupabase: () => ({
    from: () => ({
      select: () => ({
        in: async () => ({
          data: [{ id: '11111111-1111-4111-8111-111111111111', display_name: 'Alex' }],
          error: null,
        }),
      }),
    }),
  }),
}));
import { GET as analytics } from '@/app/api/analytics/route';
import { GET as template } from '@/app/api/templates/route';

const workspaceId = '22222222-2222-4222-8222-222222222222';
const actor = '11111111-1111-4111-8111-111111111111';
const other = '33333333-3333-4333-8333-333333333333';
function fixture(): WorkspaceData {
  const data = createEmptyData(workspaceId);
  data.preferences.timeZone = 'Europe/Paris';
  const stamp = '2026-10-24T12:00:00Z';
  const subjectId = id(),
    projectId = id(),
    taskId = id();
  data.subjects.push({
    id: subjectId,
    workspaceId,
    name: 'Research',
    description: '',
    color: '#123456',
    icon: 'leaf',
    archived: false,
    weeklyGoal: 4,
    resources: [],
    order: 0,
    createdAt: stamp,
    updatedAt: stamp,
  });
  data.projects.push({
    id: projectId,
    workspaceId,
    subjectId,
    name: 'Paper',
    description: '',
    archived: false,
    createdAt: stamp,
    updatedAt: stamp,
  });
  data.tasks.push({
    id: taskId,
    workspaceId,
    subjectId,
    projectId,
    title: 'Read findings',
    description: '',
    status: 'in_progress',
    priority: 'medium',
    tags: [],
    estimatedPomodoros: 4,
    assigneeId: actor,
    checklist: [],
    resources: [],
    createdAt: stamp,
    updatedAt: stamp,
  });
  const context = {
    workspaceId,
    userId: actor,
    subjectId,
    subjectName: 'Research',
    projectId,
    projectName: 'Paper',
    taskId,
    taskTitle: 'Read findings',
  };
  data.focusSessions.push({
    id: id(),
    workspaceId,
    userId: actor,
    phase: 'focus',
    status: 'completed',
    startedAt: '2026-10-25T09:00:00Z',
    endedAt: '2026-10-25T09:25:00Z',
    durationMinutes: 25,
    actualSeconds: 1500,
    context,
  });
  data.focusSessions.push({
    ...data.focusSessions[0],
    id: id(),
    userId: other,
    context: { ...context, userId: other },
    startedAt: '2026-10-25T10:00:00Z',
    endedAt: '2026-10-25T10:25:00Z',
  });
  data.focusSessions.push({
    ...data.focusSessions[0],
    id: id(),
    status: 'skipped',
    actualSeconds: 30,
  });
  data.focusSessions.push({ ...data.focusSessions[0], id: id(), phase: 'shortBreak' });
  for (const [startsAt, durationMinutes] of [
    ['2026-10-24T21:45:00Z', 30],
    ['2026-10-25T00:30:00Z', 120],
  ] as const)
    data.plannedSessions.push({
      id: id(),
      workspaceId,
      userId: actor,
      subjectId,
      projectId,
      taskId,
      title: 'Planned work',
      startsAt,
      durationMinutes,
      notes: '',
      completed: false,
      createdAt: stamp,
      updatedAt: stamp,
    });
  return data;
}

describe('advanced analytics calculations', () => {
  it('counts only completed focus and keeps estimates separate from actual effort', () => {
    const result = calculateAdvancedAnalytics(fixture(), {
      workspaceId,
      from: '2026-10-25',
      to: '2026-10-25',
      memberId: actor,
    });
    expect(result.totals.completedSessions).toBe(1);
    expect(result.totals.completedMinutes).toBe(25);
    expect(result.taskEffort[0]).toMatchObject({
      estimatedPomodoros: 4,
      completedPomodoros: 1,
      completedMinutes: 25,
    });
    expect(result.bySubject[0]).toMatchObject({ name: 'Research', minutes: 25 });
    expect(result.byProject[0]).toMatchObject({ name: 'Paper', minutes: 25 });
  });
  it('clips cross-midnight plans and counts real elapsed minutes through a DST repetition', () => {
    const result = calculateAdvancedAnalytics(fixture(), {
      workspaceId,
      from: '2026-10-25',
      to: '2026-10-25',
      memberId: actor,
    });
    expect(result.totals.plannedMinutes).toBe(135);
  });
  it('team totals contain only explicitly selected workspace records and members', () => {
    const data = fixture();
    const all = calculateAdvancedAnalytics(data, {
      workspaceId,
      from: '2026-10-25',
      to: '2026-10-25',
    });
    const selected = calculateAdvancedAnalytics(data, {
      workspaceId,
      from: '2026-10-25',
      to: '2026-10-25',
      memberId: other,
    });
    expect(all.totals.completedMinutes).toBe(50);
    expect(selected.totals.completedMinutes).toBe(25);
    expect(selected.totals.plannedMinutes).toBe(0);
  });
  it('rejects invalid date ranges and calendar dates', () => {
    expect(analyticsFiltersSchema.safeParse({ workspaceId, from: '2026-02-30' }).success).toBe(
      false,
    );
    expect(
      analyticsFiltersSchema.safeParse({ workspaceId, from: '2026-10-26', to: '2026-10-25' })
        .success,
    ).toBe(false);
  });
});

describe('protected premium endpoints', () => {
  beforeEach(() => {
    mocks.requireWorkspace.mockReset();
    mocks.assertFeature.mockReset();
    mocks.read.mockReset();
    mocks.requireWorkspace.mockResolvedValue({
      user: { id: actor },
      workspace: { id: workspaceId, kind: 'organization' },
      supabase: {
        from: () => ({
          select: () => ({
            eq: async () => ({ data: [{ user_id: actor }, { user_id: other }], error: null }),
          }),
        }),
      },
    });
    mocks.assertFeature.mockResolvedValue({ features: { teamWorkspaces: true } });
    mocks.read.mockResolvedValue(fixture());
  });
  it('denies Free analytics before reading productivity data', async () => {
    mocks.assertFeature.mockRejectedValue(new HttpError(403, 'A paid plan is required.'));
    expect(
      (await analytics(new Request(`http://localhost/api/analytics?workspaceId=${workspaceId}`)))
        .status,
    ).toBe(403);
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.assertFeature).toHaveBeenCalledWith(workspaceId, 'advancedAnalytics');
  });
  it('returns authenticated Team analytics with permitted member filters', async () => {
    const response = await analytics(
      new Request(
        `http://localhost/api/analytics?workspaceId=${workspaceId}&from=2026-10-25&to=2026-10-25&memberId=${actor}`,
      ),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      totals: { completedMinutes: 25 },
      features: { teamAnalytics: true },
    });
  });
  it('rejects a filter referencing an unrelated workspace subject', async () => {
    expect(
      (
        await analytics(
          new Request(
            `http://localhost/api/analytics?workspaceId=${workspaceId}&subjectId=${id()}`,
          ),
        )
      ).status,
    ).toBe(400);
  });
  it('never broadens personal Pro reports to other actors when a member filter is omitted', async () => {
    mocks.assertFeature.mockResolvedValue({ features: { teamWorkspaces: false } });
    const response = await analytics(
      new Request(
        `http://localhost/api/analytics?workspaceId=${workspaceId}&from=2026-10-25&to=2026-10-25`,
      ),
    );
    const body = await response.json();
    expect(body.totals.completedMinutes).toBe(25);
    expect(body.members).toEqual([{ id: actor, name: 'You' }]);
  });
  it('denies membership failures before checking paid access or reading data', async () => {
    mocks.requireWorkspace.mockRejectedValue(new HttpError(403, 'Workspace access denied.'));
    expect(
      (await analytics(new Request(`http://localhost/api/analytics?workspaceId=${workspaceId}`)))
        .status,
    ).toBe(403);
    expect(mocks.assertFeature).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('denies unpaid advanced template retrieval', async () => {
    mocks.assertFeature.mockRejectedValue(new HttpError(403, 'A paid plan is required.'));
    expect(
      (
        await template(
          new Request(
            `http://localhost/api/templates?workspaceId=${workspaceId}&template=software-development`,
          ),
        )
      ).status,
    ).toBe(403);
    expect(mocks.assertFeature).toHaveBeenCalledWith(workspaceId, 'advancedTemplates');
  });
  it('returns a safe software template only to an authorized editing member', async () => {
    const response = await template(
      new Request(
        `http://localhost/api/templates?workspaceId=${workspaceId}&template=software-development`,
      ),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      template: {
        id: 'software-development',
        checklist: [
          { text: 'Clarify acceptance criteria', done: false },
          { text: 'Implement the change', done: false },
          { text: 'Add meaningful tests', done: false },
          { text: 'Run checks', done: false },
          { text: 'Review the result', done: false },
        ],
      },
    });
    expect(mocks.requireWorkspace).toHaveBeenCalledWith(workspaceId, {
      roles: ['owner', 'admin', 'member'],
    });
  });
  it('rejects client-supplied paid flags and non-allowlisted templates', async () => {
    expect(
      (
        await template(
          new Request(`http://localhost/api/templates?workspaceId=${workspaceId}&template=unknown`),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await template(
          new Request(
            `http://localhost/api/templates?workspaceId=${workspaceId}&template=software-development&paid=true`,
          ),
        )
      ).status,
    ).toBe(400);
    expect(mocks.assertFeature).not.toHaveBeenCalled();
  });
});
