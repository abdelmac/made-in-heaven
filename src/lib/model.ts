import { z } from 'zod';

export const id = () => crypto.randomUUID();
const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const instant = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(instant.getTime()) && instant.toISOString().slice(0, 10) === value;
  }, 'Choose a valid calendar date.');
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const text = z.string().max(20000);
const optionalId = uuid.optional();
const resourceSchema = z
  .object({
    id: uuid,
    title: z.string().max(200),
    url: z
      .string()
      .url()
      .refine((value) => /^https?:\/\//i.test(value), 'Use an HTTP or HTTPS resource link.'),
  })
  .strict();
export type Resource = z.infer<typeof resourceSchema>;
const recordFields = { id: uuid, workspaceId: uuid, createdAt: timestamp, updatedAt: timestamp };
export const subjectSchema = z
  .object({
    ...recordFields,
    name: z.string().trim().min(1).max(100),
    description: text,
    icon: z.string().max(20),
    color,
    archived: z.boolean(),
    completedAt: timestamp.optional(),
    targetDate: date.optional(),
    weeklyGoal: z.number().int().min(0).max(1000),
    defaultPresetId: optionalId,
    resources: z.array(resourceSchema).max(100),
    order: z.number().int().min(0),
  })
  .strict();
export const projectSchema = z
  .object({
    ...recordFields,
    name: z.string().trim().min(1).max(150),
    description: text,
    subjectId: optionalId,
    archived: z.boolean(),
  })
  .strict();
export const taskSchema = z
  .object({
    ...recordFields,
    title: z.string().trim().min(1).max(300),
    description: text,
    subjectId: optionalId,
    projectId: optionalId,
    status: z.enum(['backlog', 'todo', 'in_progress', 'blocked', 'done']),
    priority: z.enum(['low', 'medium', 'high', 'urgent']),
    dueDate: date.optional(),
    tags: z.array(z.string().max(50)).max(30),
    estimatedPomodoros: z.number().int().min(0).max(10000),
    assigneeId: optionalId,
    checklist: z
      .array(z.object({ id: uuid, text: z.string().min(1).max(500), done: z.boolean() }).strict())
      .max(500),
    resources: z.array(resourceSchema).max(100),
  })
  .strict();
export const plannedSessionSchema = z
  .object({
    ...recordFields,
    userId: uuid,
    title: z.string().trim().min(1).max(300),
    subjectId: optionalId,
    projectId: optionalId,
    taskId: optionalId,
    startsAt: timestamp,
    durationMinutes: z.number().int().min(1).max(1440),
    notes: text,
    completed: z.boolean(),
  })
  .strict();
export const sessionContextSchema = z
  .object({
    workspaceId: uuid,
    userId: uuid,
    subjectId: optionalId,
    subjectName: z.string().max(100).optional(),
    subjectColor: color.optional(),
    projectId: optionalId,
    projectName: z.string().max(150).optional(),
    taskId: optionalId,
    taskTitle: z.string().max(300).optional(),
    plannedSessionId: optionalId,
    title: z.string().max(300).optional(),
  })
  .strict();
export const focusSessionSchema = z
  .object({
    id: uuid,
    workspaceId: uuid,
    userId: uuid,
    phase: z.enum(['focus', 'shortBreak', 'longBreak']),
    status: z.enum(['completed', 'interrupted', 'skipped']),
    startedAt: timestamp,
    endedAt: timestamp,
    durationMinutes: z.number().min(0).max(1440),
    actualSeconds: z.number().min(0).max(86400),
    context: sessionContextSchema,
  })
  .strict();
export const journalEntrySchema = z
  .object({
    ...recordFields,
    taskId: uuid,
    subjectId: optionalId,
    userId: uuid,
    kind: z.enum(['progress', 'decision', 'blocker', 'next_steps', 'reflection']),
    content: z.string().trim().min(1).max(20000),
    sessionId: optionalId,
    revisions: z.array(z.object({ content: text, editedAt: timestamp }).strict()).max(1000),
  })
  .strict();
export const activityEventSchema = z
  .object({
    id: uuid,
    workspaceId: uuid,
    userId: uuid,
    timestamp,
    type: z.enum([
      'task_created',
      'task_completed',
      'task_updated',
      'task_deleted',
      'status_changed',
      'subject_created',
      'subject_updated',
      'subject_archived',
      'subject_restored',
      'subject_completed',
      'subject_reopened',
      'note_created',
      'note_updated',
      'note_deleted',
      'flashcard_deck_created',
      'flashcard_deck_updated',
      'flashcard_deck_deleted',
      'flashcard_created',
      'flashcard_updated',
      'flashcard_deleted',
      'journal_added',
      'journal_edited',
      'focus_completed',
      'focus_interrupted',
      'focus_skipped',
      'plan_created',
      'plan_updated',
      'plan_deleted',
    ]),
    subjectId: optionalId,
    subjectName: z.string().max(100).optional(),
    taskId: optionalId,
    taskTitle: z.string().max(300).optional(),
    projectId: optionalId,
    details: z.string().max(2000),
  })
  .strict();
export const noteSheetSchema = z
  .object({
    ...recordFields,
    userId: uuid,
    title: z.string().trim().min(1).max(200),
    content: z.string().trim().min(1).max(20000),
    subjectId: optionalId,
    sessionId: optionalId,
    kind: z.enum(['note', 'session_reflection', 'subject_completion']),
    revisions: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(200),
            content: z.string().trim().min(1).max(20000),
            editedAt: timestamp,
          })
          .strict(),
      )
      .max(1000)
      .default([]),
  })
  .strict();
export const flashcardDeckSchema = z
  .object({
    ...recordFields,
    userId: uuid,
    title: z.string().trim().min(1).max(120),
    description: text,
    subjectId: optionalId,
  })
  .strict();
export const flashcardSchema = z
  .object({
    ...recordFields,
    userId: uuid,
    deckId: uuid,
    front: z.string().trim().min(1).max(4000),
    back: z.string().trim().min(1).max(10000),
  })
  .strict();
export const presetSchema = z
  .object({
    id: uuid,
    name: z.string().trim().min(1).max(60),
    focusMinutes: z.number().int().min(1).max(180),
    shortBreakMinutes: z.number().int().min(1).max(60),
    longBreakMinutes: z.number().int().min(1).max(120),
    cycleLength: z.number().int().min(1).max(12),
  })
  .strict();
export const widgetNames = ['timer', 'planner', 'tasks', 'activity', 'subjects'] as const;
const widgets = z
  .array(z.enum(widgetNames))
  .max(5)
  .refine((values) => new Set(values).size === values.length, 'Widgets must be unique.');
export const customThemeSchema = z
  .object({
    accent: color,
    background: color,
    surface: color,
    border: color,
    text: color,
    heatmap: z.array(color).length(5),
  })
  .strict();
export const backgroundSchema = z
  .object({
    kind: z.enum(['none', 'preset', 'image']),
    preset: z.enum(['aurora', 'dusk', 'ocean', 'forest']),
    image: z
      .string()
      .max(350000)
      .regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/)
      .nullable(),
    overlay: z.number().int().min(40).max(95),
    blur: z.number().int().min(0).max(16),
  })
  .strict()
  .refine((value) => value.kind !== 'image' || value.image !== null, 'Choose a background image.');
export const preferencesSchema = z
  .object({
    timeZone: z
      .string()
      .max(100)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }, 'Choose a valid IANA time zone.'),
    weekStartsOn: z.union([z.literal(0), z.literal(1)]),
    timeFormat: z.enum(['12h', '24h']),
    dateFormat: z.enum(['MMM d, yyyy', 'dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd']),
    appearance: z.enum(['light', 'dark', 'system']),
    accent: z.enum(['green', 'blue', 'plum', 'amber', 'neutral', 'blurple', 'rose', 'cyan']),
    accentColor: color.nullable().default(null),
    background: backgroundSchema.default({
      kind: 'none',
      preset: 'aurora',
      image: null,
      overlay: 70,
      blur: 0,
    }),
    customTheme: customThemeSchema.nullable(),
    density: z.enum(['comfortable', 'compact']),
    fontSize: z.enum(['small', 'medium', 'large']),
    radius: z.enum(['small', 'medium', 'large']),
    motion: z.enum(['standard', 'reduced']),
    focusMinutes: z.number().int().min(1).max(180),
    shortBreakMinutes: z.number().int().min(1).max(60),
    longBreakMinutes: z.number().int().min(1).max(120),
    cycleLength: z.number().int().min(1).max(12),
    dailyGoal: z.number().int().min(1).max(100),
    sound: z.boolean(),
    notifications: z.boolean(),
    visibleStartHour: z.number().int().min(0).max(23),
    visibleEndHour: z.number().int().min(1).max(24),
    presets: z.array(presetSchema).max(50),
    widgets,
    savedLayouts: z
      .array(z.object({ id: uuid, name: z.string().min(1).max(60), widgets }).strict())
      .max(30),
    heatmapMode: z.enum(['sessions', 'minutes']),
  })
  .strict()
  .refine(
    (value) => value.visibleEndHour > value.visibleStartHour,
    'The planner end hour must follow its start hour.',
  );
export const timerStateSchema = z
  .object({
    phase: z.enum(['focus', 'shortBreak', 'longBreak']),
    status: z.enum(['idle', 'running', 'paused']),
    sessionId: uuid.nullable(),
    startedAt: timestamp.nullable(),
    endAt: timestamp.nullable(),
    durationMs: z.number().int().min(60000).max(10800000),
    remainingMs: z.number().int().min(0).max(10800000),
    cycleCount: z.number().int().min(0),
    context: sessionContextSchema.nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.status !== 'idle' &&
      (!value.sessionId ||
        !value.startedAt ||
        !value.context ||
        (value.status === 'running' && !value.endAt))
    )
      ctx.addIssue({
        code: 'custom',
        message: 'An active timer needs a complete frozen session context.',
      });
    if (value.remainingMs > value.durationMs)
      ctx.addIssue({ code: 'custom', message: 'Remaining time exceeds the session duration.' });
    if (
      value.status === 'idle' &&
      (value.context || value.sessionId || value.startedAt || value.endAt)
    )
      ctx.addIssue({
        code: 'custom',
        message: 'A prepared timer cannot retain an active session identity.',
      });
    if (value.status === 'paused' && value.endAt)
      ctx.addIssue({ code: 'custom', message: 'A paused timer must not have a running deadline.' });
  });

const baseWorkspaceDataSchema = z
  .object({
    schemaVersion: z.literal(1),
    workspaceId: uuid,
    revision: z.number().int().min(0),
    updatedAt: timestamp,
    subjects: z.array(subjectSchema).max(10000),
    projects: z.array(projectSchema).max(10000),
    tasks: z.array(taskSchema).max(100000),
    plannedSessions: z.array(plannedSessionSchema).max(100000),
    focusSessions: z.array(focusSessionSchema).max(500000),
    journal: z.array(journalEntrySchema).max(100000),
    noteSheets: z.array(noteSheetSchema).max(100000).default([]),
    flashcardDecks: z.array(flashcardDeckSchema).max(10000).default([]),
    flashcards: z.array(flashcardSchema).max(100000).default([]),
    events: z.array(activityEventSchema).max(500000),
    preferences: preferencesSchema,
    timer: timerStateSchema,
  })
  .strict();
export const workspaceDataSchema = baseWorkspaceDataSchema.superRefine((data, ctx) => {
  const collections = [
    data.subjects,
    data.projects,
    data.tasks,
    data.plannedSessions,
    data.focusSessions,
    data.journal,
    data.noteSheets,
    data.flashcardDecks,
    data.flashcards,
    data.events,
  ];
  for (const collection of collections) {
    if (new Set(collection.map((item) => item.id)).size !== collection.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate record IDs are not allowed.' });
    if (collection.some((item) => item.workspaceId !== data.workspaceId))
      ctx.addIssue({ code: 'custom', message: 'Every record must belong to this workspace.' });
  }
  const subjects = new Map(data.subjects.map((item) => [item.id, item]));
  const projects = new Map(data.projects.map((item) => [item.id, item]));
  const tasks = new Map(data.tasks.map((item) => [item.id, item]));
  const decks = new Map(data.flashcardDecks.map((item) => [item.id, item]));
  for (const record of [...data.noteSheets, ...data.flashcardDecks])
    if (record.subjectId && !subjects.has(record.subjectId))
      ctx.addIssue({
        code: 'custom',
        message: 'A note or flashcard deck must link to a subject in this workspace.',
      });
  for (const card of data.flashcards)
    if (!decks.has(card.deckId))
      ctx.addIssue({ code: 'custom', message: 'A flashcard needs a deck in this workspace.' });
    else if (decks.get(card.deckId)!.userId !== card.userId)
      ctx.addIssue({
        code: 'custom',
        message: 'A flashcard and its deck must have the same author.',
      });
  for (const note of data.noteSheets) {
    if (note.kind === 'subject_completion' && !note.subjectId)
      ctx.addIssue({
        code: 'custom',
        message: 'A subject completion note needs a linked subject.',
      });
    if (note.kind === 'session_reflection' && !note.sessionId)
      ctx.addIssue({
        code: 'custom',
        message: 'A session reflection needs a completed focus session.',
      });
    if (note.sessionId) {
      const session = data.focusSessions.find((item) => item.id === note.sessionId);
      if (
        !session ||
        session.phase !== 'focus' ||
        session.status !== 'completed' ||
        session.userId !== note.userId ||
        (note.subjectId && session.context.subjectId !== note.subjectId)
      )
        ctx.addIssue({
          code: 'custom',
          message: 'A note must link to its author’s completed focus session and matching subject.',
        });
    }
  }
  const checklistIds = data.tasks.flatMap((task) => task.checklist.map((item) => item.id));
  if (new Set(checklistIds).size !== checklistIds.length)
    ctx.addIssue({
      code: 'custom',
      message: 'Checklist items must have unique IDs across this workspace.',
    });
  for (const item of [...data.projects, ...data.tasks, ...data.plannedSessions]) {
    if (item.subjectId && !subjects.has(item.subjectId))
      ctx.addIssue({
        code: 'custom',
        message: 'A linked subject does not exist in this workspace.',
      });
    if ('projectId' in item && item.projectId) {
      const project = projects.get(item.projectId);
      if (!project || (project.subjectId && project.subjectId !== item.subjectId))
        ctx.addIssue({ code: 'custom', message: 'A project and its subject must match.' });
    }
    if ('taskId' in item && item.taskId) {
      const task = tasks.get(item.taskId);
      if (!task || task.subjectId !== item.subjectId || task.projectId !== item.projectId)
        ctx.addIssue({
          code: 'custom',
          message: 'A planned session must match its linked task context.',
        });
    }
  }
  for (const note of data.journal) {
    if (!tasks.has(note.taskId))
      ctx.addIssue({ code: 'custom', message: 'A journal entry needs an existing task.' });
    if (
      note.sessionId &&
      !data.focusSessions.some(
        (session) => session.id === note.sessionId && session.context.taskId === note.taskId,
      )
    )
      ctx.addIssue({
        code: 'custom',
        message: 'A journal entry must link to a session for the same task.',
      });
  }
  for (const session of data.focusSessions) {
    if (
      session.context.workspaceId !== data.workspaceId ||
      session.context.userId !== session.userId
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Focus session snapshots must match their workspace and actor.',
      });
    if (session.status === 'completed' && session.actualSeconds < session.durationMinutes * 60)
      ctx.addIssue({
        code: 'custom',
        message: 'Incomplete focus time cannot be marked completed.',
      });
    if (session.actualSeconds > session.durationMinutes * 60)
      ctx.addIssue({
        code: 'custom',
        message: 'Recorded focus time cannot exceed the configured session duration.',
      });
    if (
      Date.parse(session.endedAt) - Date.parse(session.startedAt) + 1 <
      session.actualSeconds * 1000
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Recorded focus time cannot exceed the elapsed session time.',
      });
  }
  if (data.timer.context && data.timer.context.workspaceId !== data.workspaceId)
    ctx.addIssue({ code: 'custom', message: 'The active timer must belong to this workspace.' });
  const sorted = [...data.plannedSessions].sort(
    (a, b) => a.userId.localeCompare(b.userId) || Date.parse(a.startsAt) - Date.parse(b.startsAt),
  );
  for (let i = 1; i < sorted.length; i++) {
    const previous = sorted[i - 1];
    const current = sorted[i];
    if (
      previous.userId === current.userId &&
      Date.parse(previous.startsAt) + previous.durationMinutes * 60000 >
        Date.parse(current.startsAt)
    )
      ctx.addIssue({ code: 'custom', message: 'Planned sessions overlap for the same person.' });
  }
});
export type Subject = z.infer<typeof subjectSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Task = z.infer<typeof taskSchema>;
export type PlannedSession = z.infer<typeof plannedSessionSchema>;
export type SessionContext = z.infer<typeof sessionContextSchema>;
export type FocusSession = z.infer<typeof focusSessionSchema>;
export type JournalEntry = z.infer<typeof journalEntrySchema>;
export type NoteSheet = z.infer<typeof noteSheetSchema>;
export type FlashcardDeck = z.infer<typeof flashcardDeckSchema>;
export type Flashcard = z.infer<typeof flashcardSchema>;
export type ActivityEvent = z.infer<typeof activityEventSchema>;
export type Preferences = z.infer<typeof preferencesSchema>;
export type TimerState = z.infer<typeof timerStateSchema>;
export type WorkspaceData = z.infer<typeof workspaceDataSchema>;
export type TimerPhase = TimerState['phase'];
export const DEMO_WORKSPACE_ID = '00000000-0000-4000-8000-000000000001';
export const LOCAL_USER_ID = '00000000-0000-4000-8000-000000000002';
export const DEFAULT_PREFERENCES: Preferences = {
  timeZone: 'Europe/Paris',
  weekStartsOn: 1,
  timeFormat: '24h',
  dateFormat: 'MMM d, yyyy',
  appearance: 'system',
  accent: 'green',
  accentColor: null,
  background: { kind: 'none', preset: 'aurora', image: null, overlay: 70, blur: 0 },
  customTheme: null,
  density: 'comfortable',
  fontSize: 'medium',
  radius: 'large',
  motion: 'standard',
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  cycleLength: 4,
  dailyGoal: 8,
  sound: false,
  notifications: false,
  visibleStartHour: 8,
  visibleEndHour: 20,
  presets: [],
  widgets: [...widgetNames],
  savedLayouts: [],
  heatmapMode: 'sessions',
};
export function emptyTimer(
  preferences: Preferences = DEFAULT_PREFERENCES,
  phase: TimerPhase = 'focus',
  cycleCount = 0,
): TimerState {
  const durationMs =
    preferences[
      phase === 'focus'
        ? 'focusMinutes'
        : phase === 'shortBreak'
          ? 'shortBreakMinutes'
          : 'longBreakMinutes'
    ] * 60000;
  return {
    phase,
    status: 'idle',
    sessionId: null,
    startedAt: null,
    endAt: null,
    durationMs,
    remainingMs: durationMs,
    cycleCount,
    context: null,
  };
}
export function createEmptyData(workspaceId = DEMO_WORKSPACE_ID, now = new Date()): WorkspaceData {
  const preferences = structuredClone(DEFAULT_PREFERENCES);
  try {
    preferences.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    /* Retain an explicit fallback time zone. */
  }
  return {
    schemaVersion: 1,
    workspaceId,
    revision: 0,
    updatedAt: now.toISOString(),
    subjects: [],
    projects: [],
    tasks: [],
    plannedSessions: [],
    focusSessions: [],
    journal: [],
    noteSheets: [],
    flashcardDecks: [],
    flashcards: [],
    events: [],
    preferences,
    timer: emptyTimer(preferences),
  };
}
export function createDemoData(now = new Date()): WorkspaceData {
  const data = createEmptyData(DEMO_WORKSPACE_ID, now);
  const stamp = now.toISOString();
  const subjects = [
    {
      name: 'Product design',
      description: 'Thoughtful interfaces, one focused session at a time.',
      icon: '✦',
      color: '#708C64',
      weeklyGoal: 240,
    },
    {
      name: 'Development',
      description: 'Build useful things and keep learning.',
      icon: '⌘',
      color: '#7395B0',
      weeklyGoal: 300,
    },
    {
      name: 'Reading & learning',
      description: 'Make space for a little curiosity every day.',
      icon: '▤',
      color: '#B391B5',
      weeklyGoal: 120,
    },
  ];
  data.subjects = subjects.map((subject, order) => ({
    ...subject,
    id: id(),
    workspaceId: data.workspaceId,
    archived: false,
    resources: [],
    order,
    createdAt: stamp,
    updatedAt: stamp,
  }));
  data.tasks = [
    {
      title: 'Explore the dashboard direction',
      subjectId: data.subjects[0].id,
      priority: 'high' as const,
      status: 'in_progress' as const,
      estimatedPomodoros: 3,
    },
    {
      title: 'Build the first working prototype',
      subjectId: data.subjects[1].id,
      priority: 'medium' as const,
      status: 'todo' as const,
      estimatedPomodoros: 4,
    },
    {
      title: 'Read a chapter & capture ideas',
      subjectId: data.subjects[2].id,
      priority: 'low' as const,
      status: 'todo' as const,
      estimatedPomodoros: 2,
    },
  ].map((task) => ({
    ...task,
    id: id(),
    workspaceId: data.workspaceId,
    description: 'This is a sample task. Make it your own, or use Start fresh in Settings.',
    tags: [],
    checklist: [{ id: id(), text: 'Define the next small step', done: false }],
    resources: [],
    createdAt: stamp,
    updatedAt: stamp,
  }));
  for (let offset = 0; offset < 5; offset++) {
    const start = new Date(now);
    start.setDate(start.getDate() + offset);
    start.setHours(9 + (offset % 3), offset % 2 ? 30 : 0, 0, 0);
    const task = data.tasks[offset % data.tasks.length];
    data.plannedSessions.push({
      id: id(),
      workspaceId: data.workspaceId,
      userId: LOCAL_USER_ID,
      title: task.title,
      subjectId: task.subjectId,
      taskId: task.id,
      startsAt: start.toISOString(),
      durationMinutes: 25,
      notes: 'Sample planning block. Planned work is never counted as completed focus.',
      completed: false,
      createdAt: stamp,
      updatedAt: stamp,
    });
  }
  return data;
}
