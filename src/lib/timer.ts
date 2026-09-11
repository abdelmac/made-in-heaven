import {
  emptyTimer,
  id,
  type ActivityEvent,
  type FocusSession,
  type SessionContext,
  type TimerPhase,
  type TimerState,
  type WorkspaceData,
} from './model';

export type StartTimerContext = {
  phase?: TimerPhase;
  userId?: string;
  subjectId?: string;
  projectId?: string;
  taskId?: string;
  plannedSessionId?: string;
  durationMinutes?: number;
  title?: string;
};
export function remainingTime(timer: TimerState, now = Date.now()) {
  return timer.status === 'running' && timer.endAt
    ? Math.max(0, Date.parse(timer.endAt) - now)
    : timer.remainingMs;
}
export function startTimer(
  data: WorkspaceData,
  selection: StartTimerContext,
  userId: string,
  now = Date.now(),
): WorkspaceData {
  if (data.timer.status !== 'idle')
    throw new Error('Pause or reset the active timer before starting another session.');
  const planned = selection.plannedSessionId
    ? data.plannedSessions.find((item) => item.id === selection.plannedSessionId)
    : undefined;
  if (selection.plannedSessionId && (!planned || planned.userId !== userId))
    throw new Error('Only the person assigned to a planned session can start it.');
  if (planned?.completed) throw new Error('This planned session is already completed.');
  const taskId = planned?.taskId || selection.taskId;
  const task = taskId ? data.tasks.find((item) => item.id === taskId) : undefined;
  if (taskId && !task) throw new Error('The selected task no longer exists.');
  const subjectId = task ? task.subjectId : planned?.subjectId || selection.subjectId;
  const projectId = task ? task.projectId : planned?.projectId || selection.projectId;
  const subject = subjectId ? data.subjects.find((item) => item.id === subjectId) : undefined;
  const project = projectId ? data.projects.find((item) => item.id === projectId) : undefined;
  if (subjectId && (!subject || subject.archived))
    throw new Error('Restore the archived subject before starting new work.');
  if (projectId && (!project || project.archived)) throw new Error('Choose an active project.');
  if (project?.subjectId && project.subjectId !== subjectId)
    throw new Error('Choose a project in the selected subject.');
  const preset = subject?.defaultPresetId
    ? data.preferences.presets.find((item) => item.id === subject.defaultPresetId)
    : undefined;
  const shouldFocus = Boolean(planned || selection.taskId || selection.subjectId);
  const timer =
    shouldFocus || selection.phase
      ? emptyTimer(data.preferences, selection.phase || 'focus', data.timer.cycleCount)
      : data.timer;
  const minutes =
    selection.durationMinutes ??
    planned?.durationMinutes ??
    (timer.phase === 'focus' && preset ? preset.focusMinutes : timer.durationMs / 60000);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 180)
    throw new Error('Focus duration must be between 1 and 180 minutes.');
  const context: SessionContext = {
    workspaceId: data.workspaceId,
    userId,
    subjectId,
    subjectName: subject?.name,
    subjectColor: subject?.color,
    projectId,
    projectName: project?.name,
    taskId: task?.id,
    taskTitle: task?.title,
    plannedSessionId: planned?.id,
    title: selection.title || planned?.title,
  };
  return {
    ...data,
    timer: {
      ...timer,
      status: 'running',
      sessionId: id(),
      startedAt: new Date(now).toISOString(),
      endAt: new Date(now + minutes * 60000).toISOString(),
      durationMs: minutes * 60000,
      remainingMs: minutes * 60000,
      context,
    },
  };
}
export function pauseTimer(data: WorkspaceData, now = Date.now()): WorkspaceData {
  if (data.timer.status !== 'running') return data;
  if (remainingTime(data.timer, now) === 0) return completeTimer(data, now);
  return {
    ...data,
    timer: {
      ...data.timer,
      status: 'paused',
      remainingMs: remainingTime(data.timer, now),
      endAt: null,
    },
  };
}
export function resumeTimer(data: WorkspaceData, now = Date.now()): WorkspaceData {
  if (data.timer.status !== 'paused') return data;
  return {
    ...data,
    timer: {
      ...data.timer,
      status: 'running',
      endAt: new Date(now + data.timer.remainingMs).toISOString(),
    },
  };
}
function recordTimer(
  data: WorkspaceData,
  status: FocusSession['status'],
  now: number,
): WorkspaceData {
  const timer = data.timer;
  if (!timer.sessionId || !timer.startedAt || !timer.context) return data;
  if (data.focusSessions.some((session) => session.id === timer.sessionId)) return data;
  const actualSeconds =
    Math.min(timer.durationMs, timer.durationMs - remainingTime(timer, now)) / 1000;
  const endedAt = status === 'completed' && timer.endAt ? timer.endAt : new Date(now).toISOString();
  const session: FocusSession = {
    id: timer.sessionId,
    workspaceId: timer.context.workspaceId,
    userId: timer.context.userId,
    phase: timer.phase,
    status,
    startedAt: timer.startedAt,
    endedAt,
    durationMinutes: timer.durationMs / 60000,
    actualSeconds: status === 'completed' ? timer.durationMs / 1000 : actualSeconds,
    context: structuredClone(timer.context),
  };
  const event: ActivityEvent = {
    id: id(),
    workspaceId: data.workspaceId,
    userId: timer.context.userId,
    timestamp: endedAt,
    type:
      status === 'completed'
        ? 'focus_completed'
        : status === 'skipped'
          ? 'focus_skipped'
          : 'focus_interrupted',
    subjectId: timer.context.subjectId,
    subjectName: timer.context.subjectName,
    taskId: timer.context.taskId,
    taskTitle: timer.context.taskTitle,
    projectId: timer.context.projectId,
    details: `${timer.phase === 'focus' ? 'Focus' : 'Break'} ${status}: ${Math.round(session.actualSeconds / 60)} minutes${timer.context.taskTitle ? ` · ${timer.context.taskTitle}` : ''}.`,
  };
  return {
    ...data,
    focusSessions: [...data.focusSessions, session],
    events: [...data.events, event],
    plannedSessions:
      status === 'completed' && timer.phase === 'focus'
        ? data.plannedSessions.map((planned) =>
            planned.id === timer.context?.plannedSessionId
              ? { ...planned, completed: true, updatedAt: endedAt }
              : planned,
          )
        : data.plannedSessions,
  };
}
function nextPhase(data: WorkspaceData, completed: boolean): TimerState {
  const cycleCount = data.timer.cycleCount + (completed && data.timer.phase === 'focus' ? 1 : 0);
  const phase =
    data.timer.phase === 'focus'
      ? completed && cycleCount % data.preferences.cycleLength === 0
        ? 'longBreak'
        : 'shortBreak'
      : 'focus';
  return emptyTimer(data.preferences, phase, cycleCount);
}
export function completeTimer(data: WorkspaceData, now = Date.now()): WorkspaceData {
  if (data.timer.status !== 'running' || remainingTime(data.timer, now) > 0) return data;
  const result = recordTimer(data, 'completed', now);
  return { ...result, timer: nextPhase(data, true) };
}
export function resetTimer(data: WorkspaceData, now = Date.now()): WorkspaceData {
  const settled =
    data.timer.status === 'running' && remainingTime(data.timer, now) === 0
      ? completeTimer(data, now)
      : recordTimer(data, 'interrupted', now);
  return {
    ...settled,
    timer: emptyTimer(data.preferences, settled.timer.phase, settled.timer.cycleCount),
  };
}
export function skipTimer(data: WorkspaceData, now = Date.now()): WorkspaceData {
  if (data.timer.status === 'running' && remainingTime(data.timer, now) === 0)
    return completeTimer(data, now);
  return { ...recordTimer(data, 'skipped', now), timer: nextPhase(data, false) };
}
export function selectPhase(
  data: WorkspaceData,
  phase: TimerPhase,
  now = Date.now(),
): WorkspaceData {
  const settled = resetTimer(data, now);
  return { ...settled, timer: emptyTimer(data.preferences, phase, settled.timer.cycleCount) };
}
