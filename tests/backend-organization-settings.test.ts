import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES } from '@/lib/model';
import {
  applyOrganizationDefaults,
  organizationDefaults,
  organizationDefaultsSchema,
  workspaceIconSchema,
} from '@/lib/workspace-settings';

describe('organization defaults', () => {
  it('rejects appearance and entitlement keys in organization defaults', () => {
    expect(
      organizationDefaultsSchema.safeParse({ ...organizationDefaults(), appearance: 'dark' })
        .success,
    ).toBe(false);
    expect(
      organizationDefaultsSchema.safeParse({ ...organizationDefaults(), plan: 'team' }).success,
    ).toBe(false);
  });
  it('rejects executable icons and impossible planner hours', () => {
    expect(workspaceIconSchema.safeParse('<script>').success).toBe(false);
    expect(
      organizationDefaultsSchema.safeParse({
        ...organizationDefaults(),
        visibleStartHour: 20,
        visibleEndHour: 8,
      }).success,
    ).toBe(false);
  });
  it('applies only timer/calendar defaults and retains personal accessibility choices', () => {
    const preferences = {
      ...structuredClone(DEFAULT_PREFERENCES),
      appearance: 'dark' as const,
      accent: 'plum' as const,
      fontSize: 'large' as const,
      motion: 'reduced' as const,
      density: 'compact' as const,
      timeZone: 'America/New_York',
    };
    const defaults = { ...organizationDefaults(), focusMinutes: 45, weekStartsOn: 0 as const };
    const result = applyOrganizationDefaults(preferences, defaults);
    expect(result).toMatchObject({
      focusMinutes: 45,
      weekStartsOn: 0,
      appearance: 'dark',
      accent: 'plum',
      fontSize: 'large',
      motion: 'reduced',
      density: 'compact',
      timeZone: 'America/New_York',
    });
    expect(preferences.focusMinutes).toBe(25);
  });
  it('provides supported defaults before an organization has customized settings', () => {
    expect(organizationDefaults({})).toMatchObject({
      focusMinutes: 25,
      shortBreakMinutes: 5,
      longBreakMinutes: 15,
      cycleLength: 4,
    });
  });
});
