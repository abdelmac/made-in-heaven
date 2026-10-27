import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requestHeaders: new Headers(),
  cookies: vi.fn(),
  createServerClient: vi.fn(),
  assertBillingEnvironment: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  headers: async () => mocks.requestHeaders,
  cookies: mocks.cookies,
}));
vi.mock('@supabase/ssr', () => ({ createServerClient: mocks.createServerClient }));
vi.mock('@/lib/billing/server', () => ({
  assertBillingEnvironment: mocks.assertBillingEnvironment,
}));

import { proxy } from '@/proxy';
import { assertSameOrigin } from '@/lib/server/http';
import { getServerSupabase } from '@/lib/supabase/server';
import { requireUser, requireWorkspace } from '@/lib/server/auth';

const appOrigin = 'https://www.solace-pomodoro.com';
const actor = '11111111-1111-4111-8111-111111111111';
const workspace = '22222222-2222-4222-8222-222222222222';
const bearer = 'native.access.token';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_APP_URL', appOrigin);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://native-fixture.supabase.test');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_native_fixture');
  mocks.requestHeaders = new Headers();
  mocks.cookies.mockResolvedValue({ getAll: () => [], set: vi.fn() });
  mocks.createServerClient.mockReturnValue({ kind: 'browser-cookie-client' });
  mocks.assertBillingEnvironment.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function nativeRequest(origin = 'capacitor://localhost', extra: Record<string, string> = {}) {
  return new Request(`${appOrigin}/api/preferences`, {
    method: 'PUT',
    headers: { origin, authorization: `Bearer ${bearer}`, ...extra },
  });
}

describe('native request security', () => {
  it.each(['capacitor://localhost', 'https://localhost'])(
    'accepts a native %s bearer request for subsequent token validation',
    (origin) => {
      expect(() =>
        assertSameOrigin(nativeRequest(origin, { 'sec-fetch-site': 'cross-site' })),
      ).not.toThrow();
    },
  );

  it.each([
    'http://localhost',
    'https://localhost:5173',
    'capacitor://localhost.attacker.test',
    'capacitor://attacker.test',
    'https://attacker.test',
    'null',
  ])('does not trust a lookalike or foreign origin %s even with a bearer token', (origin) => {
    expect(() => assertSameOrigin(nativeRequest(origin))).toThrow('come from Folia');
  });

  it('does not allow a native origin to authorize a cookie-only write', () => {
    const request = nativeRequest();
    request.headers.delete('authorization');
    request.headers.set('cookie', 'existing-browser-session=1');
    expect(() => assertSameOrigin(request)).toThrow('come from Folia');
  });

  it('retains strict browser origin and cross-site checks', () => {
    expect(() => assertSameOrigin(nativeRequest(appOrigin))).not.toThrow();
    expect(() =>
      assertSameOrigin(nativeRequest(appOrigin, { 'sec-fetch-site': 'cross-site' })),
    ).toThrow('Cross-site');
    const missing = nativeRequest();
    missing.headers.delete('origin');
    expect(() => assertSameOrigin(missing)).toThrow('come from Folia');
  });
});

describe('native CORS gateway', () => {
  it.each(['capacitor://localhost', 'https://localhost'])(
    'permits a scoped preflight from %s without cookie credentials',
    (origin) => {
      const response = proxy(
        new NextRequest(`${appOrigin}/api/sync`, {
          method: 'OPTIONS',
          headers: {
            origin,
            'access-control-request-method': 'PATCH',
            'access-control-request-headers':
              'Authorization,Content-Type,X-Folia-Document-Version,X-Folia-Mood-Version',
          },
        }),
      );
      expect(response.status).toBe(204);
      expect(response.headers.get('access-control-allow-origin')).toBe(origin);
      expect(response.headers.has('access-control-allow-credentials')).toBe(false);
      expect(response.headers.get('access-control-allow-methods')).toContain('PATCH');
      expect(response.headers.get('access-control-allow-headers')).toContain('authorization');
      expect(response.headers.get('vary')).toContain('Access-Control-Request-Headers');
    },
  );

  it.each([
    { origin: 'https://attacker.test', method: 'PUT', headers: 'authorization' },
    { origin: 'capacitor://localhost', method: 'CONNECT', headers: 'authorization' },
    { origin: 'https://localhost', method: 'PUT', headers: 'x-privileged-header' },
    { origin: 'https://localhost', method: 'PUT', headers: 'authorization,,content-type' },
  ])('rejects unapproved preflight combinations (%j)', ({ origin, method, headers }) => {
    const response = proxy(
      new NextRequest(`${appOrigin}/api/sync`, {
        method: 'OPTIONS',
        headers: {
          origin,
          'access-control-request-method': method,
          'access-control-request-headers': headers,
        },
      }),
    );
    expect(response.status).toBe(403);
    expect(response.headers.has('access-control-allow-origin')).toBe(false);
  });

  it('makes native public GETs readable and strips incoming cookies before routes run', () => {
    const response = proxy(
      new NextRequest(`${appOrigin}/api/billing/prices`, {
        headers: { origin: 'https://localhost', cookie: 'existing-browser-session=1' },
      }),
    );
    expect(response.headers.get('access-control-allow-origin')).toBe('https://localhost');
    expect(response.headers.has('access-control-allow-credentials')).toBe(false);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.has('x-middleware-request-cookie')).toBe(false);
    expect(response.headers.get('x-middleware-override-headers')).not.toContain('cookie');
  });

  it('leaves same-origin browser requests to their existing route guards', () => {
    const response = proxy(
      new NextRequest(`${appOrigin}/api/sync`, {
        headers: { origin: appOrigin, cookie: 'existing-browser-session=1' },
      }),
    );
    expect(response.headers.has('access-control-allow-origin')).toBe(false);
    expect(response.headers.has('x-middleware-override-headers')).toBe(false);
  });
});

describe('native Supabase request authentication', () => {
  it('preserves the browser SSR cookie client when no bearer token is supplied', async () => {
    mocks.requestHeaders.set('origin', appOrigin);
    expect(await getServerSupabase()).toEqual({ kind: 'browser-cookie-client' });
    expect(mocks.cookies).toHaveBeenCalledOnce();
    expect(mocks.createServerClient).toHaveBeenCalledWith(
      'https://native-fixture.supabase.test',
      'sb_publishable_native_fixture',
      expect.objectContaining({ cookies: expect.any(Object) }),
    );
  });

  it.each([undefined, '', 'Basic native-token', 'Bearer token with whitespace', 'Bearer '])(
    'never falls back to browser cookies for native authorization %s',
    async (authorization) => {
      mocks.requestHeaders.set('origin', 'capacitor://localhost');
      mocks.requestHeaders.set('cookie', 'existing-browser-session=1');
      if (authorization !== undefined) mocks.requestHeaders.set('authorization', authorization);
      await expect(getServerSupabase()).rejects.toMatchObject({ status: 401 });
      expect(mocks.cookies).not.toHaveBeenCalled();
      expect(mocks.createServerClient).not.toHaveBeenCalled();
    },
  );

  it('rejects an invalid bearer token even when browser cookies are present', async () => {
    mocks.requestHeaders = new Headers({
      origin: 'capacitor://localhost',
      authorization: `Bearer ${bearer}`,
      cookie: 'existing-browser-session=1',
    });
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${bearer}`);
      return Response.json({ code: 'bad_jwt', msg: 'Invalid token' }, { status: 401 });
    });
    vi.stubGlobal('fetch', fetcher);
    await expect(requireUser()).rejects.toMatchObject({ status: 401 });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(mocks.cookies).not.toHaveBeenCalled();
    expect(mocks.createServerClient).not.toHaveBeenCalled();
  });

  it('validates the bearer with Auth and retains it for user-scoped membership reads', async () => {
    mocks.requestHeaders = new Headers({
      origin: 'https://localhost',
      authorization: `Bearer ${bearer}`,
      cookie: 'existing-browser-session=1',
    });
    const paths: string[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      paths.push(url.pathname);
      const requestHeaders = new Headers(init?.headers);
      expect(requestHeaders.get('authorization')).toBe(`Bearer ${bearer}`);
      expect(requestHeaders.get('apikey')).toBe('sb_publishable_native_fixture');
      expect(requestHeaders.has('cookie')).toBe(false);
      if (url.pathname === '/auth/v1/user')
        return Response.json({
          id: actor,
          aud: 'authenticated',
          role: 'authenticated',
          email: 'native@example.test',
          created_at: '2026-10-27T10:00:00Z',
          app_metadata: {},
          user_metadata: {},
        });
      if (url.pathname === '/rest/v1/workspace_memberships') {
        expect(url.searchParams.get('user_id')).toBe(`eq.${actor}`);
        expect(url.searchParams.get('workspace_id')).toBe(`eq.${workspace}`);
        return Response.json({ role: 'viewer' });
      }
      if (url.pathname === '/rest/v1/workspaces')
        return Response.json({ id: workspace, name: 'Personal', kind: 'personal' });
      throw new Error(`Unexpected request ${url.pathname}`);
    });
    vi.stubGlobal('fetch', fetcher);
    await expect(requireWorkspace(workspace)).resolves.toMatchObject({
      user: { id: actor },
      role: 'viewer',
      workspace: { id: workspace },
    });
    expect(paths).toEqual([
      '/auth/v1/user',
      '/rest/v1/workspace_memberships',
      '/rest/v1/workspaces',
    ]);
    expect(mocks.assertBillingEnvironment).toHaveBeenCalledOnce();
    expect(mocks.cookies).not.toHaveBeenCalled();
    expect(mocks.createServerClient).not.toHaveBeenCalled();
  });
});
