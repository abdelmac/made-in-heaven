import { describe, expect, it, vi } from 'vitest';
import { HttpError } from '@/lib/server/http';
import { nativeApiOptions, withNativeApiCors } from '@/lib/server/native-route';

const app = 'https://www.solace-pomodoro.com';

describe('route-owned native CORS', () => {
  it.each(['capacitor://localhost', 'https://localhost'])(
    'handles a native preflight in the route without Proxy (%s)',
    (origin) => {
      const response = nativeApiOptions(
        new Request(`${app}/api/sync`, {
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
    },
  );

  it.each([
    { origin: 'https://foreign.invalid', method: 'PUT', headers: 'authorization' },
    { origin: 'https://localhost', method: 'CONNECT', headers: 'authorization' },
    { origin: 'capacitor://localhost', method: 'PUT', headers: 'x-unapproved-header' },
  ])('rejects an unapproved route preflight (%j)', ({ origin, method, headers }) => {
    const response = nativeApiOptions(
      new Request(`${app}/api/sync`, {
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

  it.each([200, 400, 401, 403, 500])(
    'adds native CORS directly to a %s response and never returns browser cookies',
    async (status) => {
      const wrapped = withNativeApiCors<[Request]>(async () =>
        Response.json(
          { status },
          {
            status,
            headers: {
              Vary: 'Accept-Encoding',
              'Set-Cookie': 'browser-session=should-not-be-sent',
              'Access-Control-Allow-Credentials': 'true',
            },
          },
        ),
      );
      const response = await wrapped(
        new Request(`${app}/api/account`, { headers: { origin: 'capacitor://localhost' } }),
      );
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ status });
      expect(response.headers.get('access-control-allow-origin')).toBe('capacitor://localhost');
      expect(response.headers.get('vary')).toBe('Accept-Encoding, Origin');
      expect(response.headers.has('access-control-allow-credentials')).toBe(false);
      expect(response.headers.has('set-cookie')).toBe(false);
    },
  );

  it('includes CORS on a native handler exception without exposing its details', async () => {
    const wrapped = withNativeApiCors<[Request]>(async () => {
      throw new Error('private provider credentials');
    });
    const response = await wrapped(
      new Request(`${app}/api/account`, { headers: { origin: 'https://localhost' } }),
    );
    expect(response.status).toBe(500);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://localhost');
    expect(await response.text()).not.toContain('private provider credentials');
  });

  it('retains authentication failures and their response status', async () => {
    const wrapped = withNativeApiCors<[Request]>(async () => {
      throw new HttpError(401, 'Sign in to continue.');
    });
    const response = await wrapped(
      new Request(`${app}/api/workspaces`, { headers: { origin: 'https://localhost' } }),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://localhost');
  });

  it('preserves browser response objects and same-origin error handling', async () => {
    const original = Response.json({ browser: true }, { headers: { 'Set-Cookie': 'session=web' } });
    const handler = vi.fn<(request: Request) => Promise<Response>>(async () => original);
    const wrapped = withNativeApiCors(handler);
    expect(await wrapped(new Request(`${app}/api/account`, { headers: { origin: app } }))).toBe(
      original,
    );
    expect(original.headers.get('set-cookie')).toBe('session=web');
    expect(original.headers.has('access-control-allow-origin')).toBe(false);
    const throws = withNativeApiCors<[Request]>(async () => {
      throw new Error('existing browser error');
    });
    await expect(throws(new Request(`${app}/api/account`))).rejects.toThrow(
      'existing browser error',
    );
  });

  it('keeps zero-argument public GET calls compatible with existing unit tests', async () => {
    const original = Response.json({ configured: false });
    const wrapped = withNativeApiCors(async () => original);
    expect(await wrapped()).toBe(original);
  });
});
