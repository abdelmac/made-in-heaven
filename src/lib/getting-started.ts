import { z } from 'zod';
import { id, type WorkspaceData } from './model';
import { zonedDateTime } from './calendar';

export const starterSchema = z.object({
  subject: z.string().trim().min(1, 'Indiquez une matière ou un objectif.').max(100),
  task: z.string().trim().min(1, 'Indiquez votre première tâche.').max(300),
  date: z.string(),
  time: z.string(),
  duration: z.number().int().min(1).max(180),
});

export function addStarterPlan(
  data: WorkspaceData,
  userId: string,
  input: z.infer<typeof starterSchema>,
) {
  const values = starterSchema.parse(input);
  if (data.subjects.length || data.tasks.length || data.plannedSessions.length)
    throw new Error(
      'Cet espace contient déjà du travail. Utilisez les boutons d’ajout de matières, tâches et séances.',
    );
  const startsAt = zonedDateTime(values.date, values.time, data.preferences.timeZone);
  const now = new Date().toISOString();
  const fields = { workspaceId: data.workspaceId, createdAt: now, updatedAt: now };
  const subjectId = id();
  const taskId = id();
  data.subjects.push({
    ...fields,
    id: subjectId,
    name: values.subject,
    description: '',
    icon: '📚',
    color: '#426b50',
    archived: false,
    weeklyGoal: values.duration * 3,
    resources: [],
    order: 0,
  });
  data.tasks.push({
    ...fields,
    id: taskId,
    title: values.task,
    description: '',
    subjectId,
    status: 'todo',
    priority: 'medium',
    dueDate: values.date,
    tags: [],
    estimatedPomodoros: 1,
    checklist: [],
    resources: [],
  });
  data.plannedSessions.push({
    ...fields,
    id: id(),
    userId,
    subjectId,
    taskId,
    title: values.task,
    startsAt,
    durationMinutes: values.duration,
    notes: '',
    completed: false,
  });
}
