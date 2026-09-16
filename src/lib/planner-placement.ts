import { findOverlap, zonedDateTime } from './calendar';
import { id, type PlannedSession, type Task, type WorkspaceData } from './model';
import { plannerCopy } from './i18n/planner';

export type PlannerSource = { kind: 'plan' | 'task'; id: string; workspaceId: string };

export function isPlannableTask(data: WorkspaceData, task: Task) {
  return (
    task.status !== 'done' &&
    !data.subjects.find((subject) => subject.id === task.subjectId)?.archived &&
    !data.projects.find((project) => project.id === task.projectId)?.archived
  );
}

/** Prepare against the latest draft; store.update remains the persistence/permission boundary. */
export function preparePlannerPlacement(
  data: WorkspaceData,
  source: PlannerSource,
  day: string,
  hour: number,
  actorId: string,
  canEdit: boolean,
  now = new Date().toISOString(),
): { record: PlannedSession; changed: boolean } {
  if (!canEdit) throw new Error(plannerCopy.readOnly);
  if (source.workspaceId !== data.workspaceId) throw new Error(plannerCopy.stale);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23)
    throw new Error('Choisissez une heure valide.');
  const startsAt = zonedDateTime(
    day,
    `${String(hour).padStart(2, '0')}:00`,
    data.preferences.timeZone,
  );
  let record: PlannedSession;
  let changed = true;
  if (source.kind === 'plan') {
    const original = data.plannedSessions.find((session) => session.id === source.id);
    if (!original) throw new Error(plannerCopy.stale);
    changed = Date.parse(original.startsAt) !== Date.parse(startsAt);
    record = { ...original, startsAt, updatedAt: changed ? now : original.updatedAt };
  } else {
    const task = data.tasks.find((task) => task.id === source.id);
    if (!task) throw new Error(plannerCopy.stale);
    if (!isPlannableTask(data, task)) throw new Error(plannerCopy.unavailableTask);
    record = {
      id: id(),
      workspaceId: data.workspaceId,
      userId: actorId,
      title: task.title,
      taskId: task.id,
      subjectId: task.subjectId,
      projectId: task.projectId,
      startsAt,
      durationMinutes: data.preferences.focusMinutes,
      notes: '',
      completed: false,
      createdAt: now,
      updatedAt: now,
    };
  }
  if (findOverlap(record, data.plannedSessions)) throw new Error(plannerCopy.overlap);
  return { record, changed };
}
