import { z } from 'zod';
import { DEFAULT_PREFERENCES, type Preferences } from './model';

export const workspaceIconSchema = z.enum(['leaf', 'sprout', 'book', 'code', 'sparkles']);
export const organizationDefaultsSchema = z
  .object({
    focusMinutes: z.number().int().min(1).max(180),
    shortBreakMinutes: z.number().int().min(1).max(60),
    longBreakMinutes: z.number().int().min(1).max(120),
    cycleLength: z.number().int().min(1).max(12),
    visibleStartHour: z.number().int().min(0).max(23),
    visibleEndHour: z.number().int().min(1).max(24),
    weekStartsOn: z.union([z.literal(0), z.literal(1)]),
  })
  .strict()
  .refine(
    (value) => value.visibleEndHour > value.visibleStartHour,
    'The end hour must follow the start hour.',
  );

export type OrganizationDefaults = z.infer<typeof organizationDefaultsSchema>;
export type WorkspaceIcon = z.infer<typeof workspaceIconSchema>;
export function organizationDefaults(settings?: unknown): OrganizationDefaults {
  const candidate =
    settings && typeof settings === 'object' && 'defaultPreferences' in settings
      ? settings.defaultPreferences
      : null;
  const result = organizationDefaultsSchema.safeParse(candidate);
  if (result.success) return result.data;
  const {
    focusMinutes,
    shortBreakMinutes,
    longBreakMinutes,
    cycleLength,
    visibleStartHour,
    visibleEndHour,
    weekStartsOn,
  } = DEFAULT_PREFERENCES;
  return {
    focusMinutes,
    shortBreakMinutes,
    longBreakMinutes,
    cycleLength,
    visibleStartHour,
    visibleEndHour,
    weekStartsOn,
  };
}

export function applyOrganizationDefaults(
  preferences: Preferences,
  defaults: OrganizationDefaults,
): Preferences {
  return { ...preferences, ...organizationDefaultsSchema.parse(defaults) };
}
