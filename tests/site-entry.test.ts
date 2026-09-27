import { describe, expect, it } from 'vitest';
import { opensWorkspace } from '../src/lib/site-entry';
import manifest from '../src/app/manifest';

describe('public home and workspace entry', () => {
  it.each(['', '?utm_source=newsletter', '?theme=dark'])(
    'keeps public visits on the home page (%s)',
    (search) => expect(opensWorkspace(search)).toBe(false),
  );

  it.each([
    '?view=overview',
    '?view=planner',
    '?view=unrecognized',
    '?invite=invitation-token',
    '?auth-error=verification',
    '?reset-password=1',
    '?view=billing&checkout=success',
    '?checkout=cancelled',
  ])('preserves workspace and account deep links (%s)', (search) => {
    expect(opensWorkspace(search)).toBe(true);
  });

  it('opens the workspace directly when the installed app launches', () => {
    expect(manifest().start_url).toBe('/?view=overview');
    expect(manifest().id).toBe('/');
    expect(manifest().scope).toBe('/');
  });
});
