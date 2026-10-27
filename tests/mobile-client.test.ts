import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  native: false,
  getSession: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('@/lib/mobile-platform', () => ({
  isNativeApp: () => mocks.native,
  appApiOrigin: () => 'https://www.solace-pomodoro.com',
}));
vi.mock('@/lib/supabase/browser', () => ({
  createBrowserSupabase: () => ({ auth: { getSession: mocks.getSession } }),
}));

import { appFetch } from '../src/lib/app-fetch';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.native = false;
  mocks.getSession.mockResolvedValue({
    data: { session: { access_token: 'fixture-session-token' } },
    error: null,
  });
  mocks.fetch.mockResolvedValue(Response.json({ ok: true }));
  vi.stubGlobal('fetch', mocks.fetch);
});

describe('installed app API requests', () => {
  it('preserves the existing browser fetch and cookie behavior', async () => {
    const init = { method: 'PUT', body: '{}', credentials: 'same-origin' as const };
    await appFetch('/api/preferences', init);
    expect(mocks.fetch).toHaveBeenCalledWith('/api/preferences', init);
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it('uses only the native session token and the configured HTTPS API', async () => {
    mocks.native = true;
    await appFetch('/api/preferences?workspaceId=fixture', {
      method: 'PUT',
      body: '{}',
      credentials: 'include',
      redirect: 'follow',
      headers: {
        'content-type': 'application/json',
        'X-Folia-Mood-Version': '1',
        authorization: 'Bearer caller-token',
        cookie: 'unwanted-cookie',
      },
    });
    const [url, options] = mocks.fetch.mock.calls[0];
    expect(url).toBe('https://www.solace-pomodoro.com/api/preferences?workspaceId=fixture');
    expect(options.credentials).toBe('omit');
    expect(options.redirect).toBe('error');
    expect(options.body).toBe('{}');
    expect(options.headers.get('authorization')).toBe('Bearer fixture-session-token');
    expect(options.headers.get('cookie')).toBeNull();
    expect(options.headers.get('X-Folia-Mood-Version')).toBe('1');
  });

  it('allows public requests without borrowing caller credentials when signed out', async () => {
    mocks.native = true;
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
    await appFetch('/api/billing/prices', { headers: { authorization: 'Bearer borrowed-token' } });
    expect(mocks.fetch.mock.calls[0][1].headers.has('authorization')).toBe(false);
  });

  it.each([
    'https://attacker.invalid/api/sync',
    '//attacker.invalid/api/sync',
    '/api/../../private',
    '/api/%2e%2e/%2e%2e/private',
    '/api/\\attacker.invalid',
    '/api/sync#fragment',
    '/auth/callback',
    '/api/sync\n',
  ])('rejects unsafe native request destinations before reading a session: %s', async (input) => {
    mocks.native = true;
    await expect(appFetch(input)).rejects.toThrow('API Solace');
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('fails closed if the native session cannot be obtained', async () => {
    mocks.native = true;
    mocks.getSession.mockResolvedValue({
      data: { session: null },
      error: new Error('storage unavailable'),
    });
    await expect(appFetch('/api/workspaces')).rejects.toThrow('Reconnectez-vous');
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
