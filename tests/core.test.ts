import { describe, expect, it } from 'vitest';
import {
  activityDays,
  addDays,
  allocateToHourBuckets,
  calculateMetrics,
  contrastRatio,
  dateKey,
  findOverlap,
  plannerIntensity,
  visibleHours,
  weekDays,
  zonedDateTime,
} from '../src/lib/calendar';
import {
  createDemoData,
  createEmptyData,
  id,
  LOCAL_USER_ID,
  workspaceDataSchema,
  type PlannedSession,
} from '../src/lib/model';
import {
  addMutationHistory,
  acknowledgePending,
  ConflictError,
  findActiveTimerConflict,
  prepareImport,
  previewImport,
  saveLocal,
  readPending,
  storageKey,
  isPreferencesOnlyChange,
  serializeExport,
} from '../src/lib/persistence';
import {
  completeTimer,
  pauseTimer,
  remainingTime,
  resetTimer,
  resumeTimer,
  selectPhase,
  skipTimer,
  startTimer,
} from '../src/lib/timer';

const now = Date.parse('2026-09-11T09:00:00Z');
const makePlan = (
  startsAt: string,
  durationMinutes = 30,
  userId = LOCAL_USER_ID,
): PlannedSession => ({
  id: id(),
  workspaceId: createEmptyData().workspaceId,
  userId,
  title: 'Focused work',
  startsAt,
  durationMinutes,
  notes: '',
  completed: false,
  createdAt: new Date(now).toISOString(),
  updatedAt: new Date(now).toISOString(),
});

describe('timestamp timer', () => {
  it('preserves remaining time through pause, reload and resume', () => {
    const initial = createEmptyData();
    const started = startTimer(initial, {}, LOCAL_USER_ID, now);
    const paused = pauseTimer(started, now + 60000);
    expect(paused.timer.remainingMs).toBe(24 * 60000);
    const restored = workspaceDataSchema.parse(JSON.parse(JSON.stringify(paused)));
    expect(remainingTime(restored.timer, now + 86400000)).toBe(24 * 60000);
    const resumed = resumeTimer(restored, now + 86400000);
    expect(remainingTime(resumed.timer, now + 86460000)).toBe(23 * 60000);
    expect(resumed.timer.sessionId).toBe(started.timer.sessionId);
  });
  it('completes exactly once after a long absence and prepares a stopped break', () => {
    const started = startTimer(createEmptyData(), {}, LOCAL_USER_ID, now);
    const completed = completeTimer(started, now + 86400000);
    expect(completed.focusSessions).toHaveLength(1);
    expect(completed.focusSessions[0].endedAt).toBe(new Date(now + 25 * 60000).toISOString());
    expect(completed.timer.status).toBe('idle');
    expect(completed.timer.phase).toBe('shortBreak');
    expect(completeTimer(completed, now + 172800000).focusSessions).toHaveLength(1);
  });
  it('never completes early and does not count reset, skip or break sessions', () => {
    const data = startTimer(createEmptyData(), {}, LOCAL_USER_ID, now);
    expect(completeTimer(data, now + 100).focusSessions).toHaveLength(0);
    const reset = resetTimer(data, now + 60000);
    expect(reset.focusSessions[0]).toMatchObject({ status: 'interrupted', actualSeconds: 60 });
    expect(calculateMetrics(reset, now).totalCount).toBe(0);
    const skipped = skipTimer(data, now + 30000);
    expect(skipped.focusSessions[0].status).toBe('skipped');
    expect(skipped.timer.cycleCount).toBe(0);
    let rest = selectPhase(createEmptyData(), 'shortBreak', now);
    rest = startTimer(rest, {}, LOCAL_USER_ID, now);
    rest = completeTimer(rest, now + 5 * 60000);
    expect(calculateMetrics(rest, now).totalCount).toBe(0);
  });
  it('prepares a long break after the configured number of completed focuses', () => {
    let data = createEmptyData();
    for (let cycle = 0; cycle < 4; cycle++) {
      data = selectPhase(data, 'focus', now + cycle * 3600000);
      data = startTimer(data, {}, LOCAL_USER_ID, now + cycle * 3600000);
      data = completeTimer(data, now + cycle * 3600000 + 25 * 60000);
    }
    expect(data.timer.phase).toBe('longBreak');
    expect(data.timer.cycleCount).toBe(4);
  });
  it('freezes session context after a task or subject is renamed or deleted', () => {
    let data = createDemoData(new Date(now));
    const task = data.tasks[0];
    const subject = data.subjects[0];
    const originalTitle = task.title;
    const originalSubject = subject.name;
    data = startTimer(data, { taskId: task.id }, LOCAL_USER_ID, now);
    data.tasks[0].title = 'A new name';
    data.subjects[0].name = 'A different subject';
    data = completeTimer(data, now + 25 * 60000);
    expect(data.focusSessions[0].context.taskTitle).toBe(originalTitle);
    expect(data.focusSessions[0].context.subjectName).toBe(originalSubject);
    data.tasks = data.tasks.filter((record) => record.id !== task.id);
    data.plannedSessions = data.plannedSessions.filter((record) => record.taskId !== task.id);
    expect(workspaceDataSchema.safeParse(data).success).toBe(true);
    expect(data.focusSessions[0].context.subjectId).toBe(subject.id);
  });
  it('marks linked planning complete only after actual focus completion', () => {
    let data = createDemoData(new Date(now));
    const plan = data.plannedSessions[0];
    data = startTimer(
      data,
      { plannedSessionId: plan.id, taskId: plan.taskId, durationMinutes: plan.durationMinutes },
      LOCAL_USER_ID,
      now,
    );
    expect(data.plannedSessions[0].completed).toBe(false);
    expect(resetTimer(data, now + 60000).plannedSessions[0].completed).toBe(false);
    expect(completeTimer(data, now + 25 * 60000).plannedSessions[0].completed).toBe(true);
  });
  it('prevents active timer replacement and archived subject selection', () => {
    const data = createDemoData(new Date(now));
    data.subjects[0].archived = true;
    expect(() => startTimer(data, { subjectId: data.subjects[0].id }, LOCAL_USER_ID, now)).toThrow(
      /Restore/,
    );
    const started = startTimer(data, {}, LOCAL_USER_ID, now);
    expect(() => startTimer(started, {}, LOCAL_USER_ID, now)).toThrow(/active timer/);
  });
});

describe('calendar rules', () => {
  it('counts only the part of a planned session inside the requested calendar week', () => {
    const data = createEmptyData();
    data.preferences.timeZone = 'UTC';
    data.plannedSessions = [makePlan('2026-09-06T23:45:00Z', 30)];
    expect(calculateMetrics(data, now).plannedMinutes).toBe(15);
  });
  it('uses explicit time zones at midnight and Sunday or Monday boundaries', () => {
    const data = createEmptyData();
    data.preferences.timeZone = 'America/New_York';
    expect(dateKey('2026-09-12T01:00:00Z', data.preferences.timeZone)).toBe('2026-09-11');
    expect(weekDays('2026-09-13T15:00:00Z', data.preferences)[0]).toBe('2026-09-07');
    data.preferences.weekStartsOn = 0;
    expect(weekDays('2026-09-13T15:00:00Z', data.preferences)[0]).toBe('2026-09-13');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('rejects nonexistent DST time and deterministically uses earlier repeated time', () => {
    expect(() => zonedDateTime('2026-03-29', '02:30', 'Europe/Paris')).toThrow(/n'existe pas/);
    expect(zonedDateTime('2026-10-25', '02:30', 'Europe/Paris')).toBe('2026-10-25T00:30:00.000Z');
    expect(zonedDateTime('2026-03-29', '03:30', 'Europe/Paris')).toBe('2026-03-29T01:30:00.000Z');
    expect(() => zonedDateTime('2026-02-30', '12:00', 'UTC')).toThrow(/calendar date/);
  });
  it('allocates partial hours and sessions crossing midnight', () => {
    const buckets = allocateToHourBuckets([makePlan('2026-09-11T09:45:00Z')], 'UTC');
    expect(buckets.get('2026-09-11:9')?.minutes).toBe(15);
    expect(buckets.get('2026-09-11:10')?.minutes).toBe(15);
    const midnight = allocateToHourBuckets([makePlan('2026-09-11T23:45:00Z')], 'UTC');
    expect(midnight.get('2026-09-12:0')?.minutes).toBe(15);
  });
  it('allocates elapsed minutes across a DST skip without creating nonexistent hours', () => {
    const buckets = allocateToHourBuckets([makePlan('2026-03-29T00:45:00Z', 30)], 'Europe/Paris');
    expect(buckets.get('2026-03-29:1')?.minutes).toBe(15);
    expect(buckets.has('2026-03-29:2')).toBe(false);
    expect(buckets.get('2026-03-29:3')?.minutes).toBe(15);
  });
  it('prevents same-person overlap across workspaces and allows adjacent or different-person sessions', () => {
    const first = makePlan('2026-09-11T09:00:00Z');
    const second = makePlan('2026-09-11T09:15:00Z');
    second.workspaceId = id();
    expect(findOverlap(first, [second])).toBe(second);
    expect(findOverlap(first, [makePlan('2026-09-11T09:30:00Z')])).toBeUndefined();
    expect(findOverlap(first, [makePlan('2026-09-11T09:15:00Z', 30, id())])).toBeUndefined();
  });
  it('expands the planner range and keeps planning separate from completed metrics', () => {
    const data = createEmptyData();
    data.preferences.timeZone = 'UTC';
    data.plannedSessions = [makePlan('2026-09-11T05:45:00Z')];
    const hours = visibleHours(data.plannedSessions, data.preferences, ['2026-09-11']);
    expect(hours[0]).toBe(5);
    expect(calculateMetrics(data, now).totalCount).toBe(0);
    expect(plannerIntensity(15)).toBe(1);
    expect(plannerIntensity(16)).toBe(2);
  });
  it('includes 52 weeks, future disabled cells and an active yesterday streak', () => {
    let data = createEmptyData();
    data.preferences.timeZone = 'UTC';
    data = startTimer(data, {}, LOCAL_USER_ID, now - 86400000);
    data = completeTimer(data, now - 86400000 + 25 * 60000);
    expect(calculateMetrics(data, now).streak).toBe(1);
    expect(calculateMetrics(data, now).todayCount).toBe(0);
    const days = activityDays(data.focusSessions, data.preferences, now);
    expect(days).toHaveLength(364);
    expect(days.filter((day) => day.future)).toHaveLength(2);
  });
});

describe('validation, history and durable persistence', () => {
  it('distinguishes private preference updates from forbidden viewer content and timer edits', () => {
    const original = createDemoData(new Date(now));
    const theme = structuredClone(original);
    theme.preferences.appearance = 'dark';
    expect(isPreferencesOnlyChange(original, theme)).toBe(true);
    theme.tasks[0].title = 'Not a preference';
    expect(isPreferencesOnlyChange(original, theme)).toBe(false);
    const timer = startTimer(original, {}, LOCAL_USER_ID, now);
    expect(isPreferencesOnlyChange(original, timer)).toBe(false);
  });
  it('atomically stores queued cloud work and preserves later edits when an earlier operation is acknowledged', () => {
    const values = new Map<string, string>();
    let writes = 0;
    const storage = {
      getItem: (key: string) => values.get(key) || null,
      setItem: (key: string, value: string) => {
        writes++;
        values.set(key, value);
      },
      removeItem: (key: string) => {
        values.delete(key);
      },
    };
    const account = id();
    const data = createEmptyData(id());
    const key = storageKey(data.workspaceId, account);
    const first = id();
    saveLocal(key, data, 0, storage, first, {
      expectedVersion: 2,
      createdAt: new Date(now).toISOString(),
    });
    expect(writes).toBe(1);
    expect(readPending(account, data.workspaceId, storage)?.id).toBe(first);
    const second = id();
    saveLocal(key, data, 1, storage, second, {
      expectedVersion: 2,
      createdAt: new Date(now).toISOString(),
    });
    acknowledgePending(account, data.workspaceId, first, 3, storage);
    expect(readPending(account, data.workspaceId, storage)).toMatchObject({
      id: second,
      expectedVersion: 3,
    });
    acknowledgePending(account, data.workspaceId, second, 4, storage);
    expect(readPending(account, data.workspaceId, storage)).toBeNull();
  });
  it('rejects impossible due dates and repeated checklist identities before saving', () => {
    const data = createDemoData(new Date(now));
    data.tasks[0].dueDate = '2026-02-30';
    expect(workspaceDataSchema.safeParse(data).success).toBe(false);
    data.tasks[0].dueDate = '2028-02-29';
    expect(workspaceDataSchema.safeParse(data).success).toBe(true);
    data.tasks[1].checklist[0].id = data.tasks[0].checklist[0].id;
    expect(workspaceDataSchema.safeParse(data).success).toBe(false);
  });
  it('detects another workspace timer for this actor while preserving other members’ timers', () => {
    const first = startTimer(createEmptyData(), {}, LOCAL_USER_ID, now);
    const second = startTimer(createEmptyData(id()), {}, LOCAL_USER_ID, now);
    expect(findActiveTimerConflict(first, [second])).toBe(second);
    const teammate = startTimer(createEmptyData(id()), {}, id(), now);
    expect(findActiveTimerConflict(first, [teammate])).toBeUndefined();
  });
  it('contains sample content without fabricated completed focus metrics', () => {
    const data = createDemoData(new Date(now));
    expect(workspaceDataSchema.safeParse(data).success).toBe(true);
    expect(data.subjects.length).toBeGreaterThan(0);
    expect(data.focusSessions).toEqual([]);
    expect(data.events).toEqual([]);
  });
  it('validates the full import before mutation and rejects trusted fields or unsafe URLs', () => {
    const data = createDemoData(new Date(now));
    const original = JSON.stringify(data);
    const exported = JSON.parse(serializeExport(data));
    exported.data.entitlements = { plan: 'team' };
    expect(() => previewImport(JSON.stringify(exported))).toThrow();
    expect(JSON.stringify(data)).toBe(original);
    delete exported.data.entitlements;
    exported.data.subjects[0].resources = [
      { id: id(), title: 'Unsafe', url: 'javascript:alert(1)' },
    ];
    expect(() => previewImport(JSON.stringify(exported))).toThrow();
  });
  it('rejects invalid references, duplicate IDs and false completion time', () => {
    const data = createDemoData(new Date(now));
    data.tasks[0].subjectId = id();
    expect(workspaceDataSchema.safeParse(data).success).toBe(false);
    const blank = createEmptyData();
    blank.tasks = [createDemoData().tasks[0]];
    expect(workspaceDataSchema.safeParse(blank).success).toBe(false);
    let completed = startTimer(createEmptyData(), {}, LOCAL_USER_ID, now);
    completed = completeTimer(completed, now + 25 * 60000);
    completed.focusSessions[0].actualSeconds = 5;
    expect(workspaceDataSchema.safeParse(completed).success).toBe(false);
  });
  it('imports only portable data with new IDs and the current account/workspace', () => {
    const source = createDemoData(new Date(now));
    const current = createEmptyData(id());
    const actor = id();
    const imported = prepareImport(previewImport(serializeExport(source)), current, actor);
    expect(imported.workspaceId).toBe(current.workspaceId);
    expect(imported.subjects[0].id).not.toBe(source.subjects[0].id);
    expect(imported.tasks[0].subjectId).toBe(imported.subjects[0].id);
    expect(imported.plannedSessions.every((plan) => plan.userId === actor)).toBe(true);
    expect(imported.timer.status).toBe('idle');
  });
  it('detects stale local writes and supports idempotent retries', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) || null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    const data = createEmptyData();
    const operationId = id();
    const first = saveLocal('workspace', data, 0, storage, operationId);
    expect(first.version).toBe(1);
    expect(saveLocal('workspace', data, 0, storage, operationId).version).toBe(1);
    expect(() => saveLocal('workspace', data, 0, storage)).toThrow(ConflictError);
  });
  it('surfaces storage failures without destroying the previous saved state', () => {
    const raw = serializeExport(createEmptyData());
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('Quota exceeded');
      },
    };
    expect(() => saveLocal('workspace', createEmptyData(), 0, storage)).toThrow('Quota exceeded');
    expect(previewImport(raw).tasks).toBe(0);
  });
  it('records subject lifecycle and task journal revisions with contextual snapshots', () => {
    const before = createDemoData(new Date(now));
    const after = structuredClone(before);
    after.subjects[0].archived = true;
    after.tasks[0].status = 'done';
    const history = addMutationHistory(before, after, LOCAL_USER_ID);
    expect(history.events.map((event) => event.type)).toEqual([
      'subject_archived',
      'task_completed',
    ]);
    expect(history.events[1].taskTitle).toBe(before.tasks[0].title);
    const note = {
      id: id(),
      workspaceId: before.workspaceId,
      taskId: before.tasks[0].id,
      userId: LOCAL_USER_ID,
      kind: 'progress' as const,
      content: 'First draft',
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
      revisions: [],
    };
    before.journal.push(note);
    after.journal.push({ ...note, content: 'Second draft' });
    const revised = addMutationHistory(before, after, LOCAL_USER_ID);
    expect(revised.journal[0].revisions[0].content).toBe('First draft');
  });
  it('validates theme values and computes contrast independently from subject colors', () => {
    const data = createEmptyData();
    expect(contrastRatio('#000000', '#ffffff')).toBe(21);
    data.preferences.customTheme = {
      accent: 'red;display:none',
      background: '#FFFFFF',
      surface: '#FFFFFF',
      text: '#000000',
      border: '#DDDDDD',
      heatmap: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'],
    };
    expect(workspaceDataSchema.safeParse(data).success).toBe(false);
  });
});
