import { describe, expect, it } from 'vitest';
import { resolveNativeLink } from '../src/components/native-links';

const origin = 'https://www.solace-pomodoro.com';
const ios = 'capacitor://localhost/?view=notes';
const android = 'https://localhost/?view=notes';

describe('installed app link routing', () => {
  it.each([ios, android])(
    'keeps workspace, home and fragment navigation internal in %s',
    (location) => {
      for (const href of ['/', '/?view=overview', '/?view=planner', '#section', '']) {
        expect(resolveNativeLink(href, location, origin)).toEqual({ kind: 'internal' });
      }
    },
  );

  it.each([ios, android])('opens public documents at the hosted app in %s', (location) => {
    for (const path of ['/privacy', '/terms', '/legal', '/support']) {
      expect(resolveNativeLink(path, location, origin)).toEqual({
        kind: 'external',
        url: `${origin}${path}`,
      });
    }
  });

  it('opens external HTTPS resources while preserving file export URLs', () => {
    expect(resolveNativeLink('https://example.org/notes?q=1#chapter', ios, origin)).toEqual({
      kind: 'external',
      url: 'https://example.org/notes?q=1#chapter',
    });
    expect(resolveNativeLink('blob:https://localhost/export-id', android, origin)).toEqual({
      kind: 'internal',
    });
    expect(resolveNativeLink('file:///app/cache/export.json', ios, origin)).toEqual({
      kind: 'internal',
    });
  });

  it('blocks unsafe schemes, embedded credentials and native paths without app pages', () => {
    for (const href of [
      'javascript:alert(1)',
      'data:text/html,<h1>unsafe</h1>',
      'http://example.org',
      'https://user:password@example.org',
      'capacitor://other-host/privacy',
      '/api/account',
      '/unregistered-screen',
    ]) {
      expect(resolveNativeLink(href, ios, origin)).toEqual({ kind: 'blocked' });
    }
  });
});
