'use client';
import { createContext, useContext } from 'react';
import { useFolia } from '@/lib/use-folia';
import { id, LOCAL_USER_ID, type WorkspaceData, type ActivityEvent, type Task } from '@/lib/model';
import type { View } from '@/lib/i18n/en';
export type FoliaStore = ReturnType<typeof useFolia>;
export interface AppContextValue {
  store: FoliaStore;
  notify: (message: string) => void;
  navigate: (view: View) => void;
  openTask: (id?: string) => void;
  openSubject: (id?: string) => void;
  openPlan: (id?: string, date?: string, hour?: number) => void;
  openAccount: () => void;
  canEdit: boolean;
}
export const AppContext = createContext<AppContextValue | null>(null);
export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error('Folia context is missing.');
  return value;
}
export function addEvent(
  data: WorkspaceData,
  type: ActivityEvent['type'],
  details: string,
  context: { subjectId?: string; taskId?: string; projectId?: string; userId?: string } = {},
) {
  const subject = data.subjects.find((s) => s.id === context.subjectId);
  const task = data.tasks.find((t) => t.id === context.taskId);
  data.events.unshift({
    id: id(),
    workspaceId: data.workspaceId,
    userId: context.userId || LOCAL_USER_ID,
    timestamp: new Date().toISOString(),
    type,
    details,
    subjectId: subject?.id,
    subjectName: subject?.name,
    taskId: task?.id,
    taskTitle: task?.title,
    projectId: context.projectId,
  });
}
export function changeTaskStatus(
  data: WorkspaceData,
  task: Task,
  status: Task['status'],
  userId?: string,
) {
  const record = data.tasks.find((t) => t.id === task.id);
  if (!record) return;
  const previous = record.status;
  record.status = status;
  record.updatedAt = new Date().toISOString();
  addEvent(
    data,
    status === 'done' ? 'task_completed' : 'status_changed',
    `${previous.replaceAll('_', ' ')} → ${status.replaceAll('_', ' ')}`,
    { taskId: task.id, subjectId: task.subjectId, userId },
  );
}
