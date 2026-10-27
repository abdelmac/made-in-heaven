import { expect, test } from '@playwright/test';

for (const origin of ['capacitor://localhost', 'https://localhost']) {
  test(`API routes return native CORS without requiring Proxy (${origin})`, async ({ request }) => {
    const preflight = await request.fetch('/api/sync', {
      method: 'OPTIONS',
      headers: {
        origin,
        'access-control-request-method': 'PATCH',
        'access-control-request-headers':
          'authorization,content-type,x-folia-document-version,x-folia-mood-version',
      },
    });
    expect(preflight.status()).toBe(204);
    expect(preflight.headers()['access-control-allow-origin']).toBe(origin);
    expect(preflight.headers()['access-control-allow-credentials']).toBeUndefined();
    expect(preflight.headers()['access-control-allow-headers']).toContain('authorization');

    const signedOut = await request.get('/api/account', {
      headers: { origin, cookie: 'browser-session=must-not-authorize-native' },
    });
    expect(signedOut.status()).toBe(401);
    expect(signedOut.headers()['access-control-allow-origin']).toBe(origin);
    expect(signedOut.headers()['access-control-allow-credentials']).toBeUndefined();
    expect(signedOut.headers()['set-cookie']).toBeUndefined();

    const malformedToken = await request.get('/api/account', {
      headers: { origin, authorization: 'Basic invalid-native-token' },
    });
    expect(malformedToken.status()).toBe(401);
    expect(malformedToken.headers()['access-control-allow-origin']).toBe(origin);

    const prices = await request.get('/api/billing/prices', { headers: { origin } });
    expect(prices.status()).toBe(200);
    expect(prices.headers()['access-control-allow-origin']).toBe(origin);
    expect(prices.headers()['access-control-allow-credentials']).toBeUndefined();
  });
}

test('API route preflights reject foreign origins and unapproved native headers', async ({
  request,
}) => {
  for (const headers of [
    {
      origin: 'https://foreign.invalid',
      'access-control-request-method': 'PATCH',
      'access-control-request-headers': 'authorization',
    },
    {
      origin: 'capacitor://localhost',
      'access-control-request-method': 'PATCH',
      'access-control-request-headers': 'x-unapproved-header',
    },
    {
      origin: 'https://localhost',
      'access-control-request-method': 'CONNECT',
      'access-control-request-headers': 'authorization',
    },
  ]) {
    const response = await request.fetch('/api/sync', { method: 'OPTIONS', headers });
    expect(response.status()).toBe(403);
    expect(response.headers()['access-control-allow-origin']).toBeUndefined();
  }
});

test('browser request-origin protections remain effective with native CORS enabled', async ({
  request,
}) => {
  const home = await request.get('/');
  const localOrigin = new URL(home.url());
  // Next normalizes its unconfigured loopback Request URL to localhost.
  if (localOrigin.hostname === '127.0.0.1') localOrigin.hostname = 'localhost';
  const canonical =
    process.env.PLAYWRIGHT_CANONICAL_ORIGIN ||
    process.env.NEXT_PUBLIC_APP_URL ||
    localOrigin.origin;
  const allowed = await request.put('/api/preferences', {
    headers: { origin: canonical },
    data: {},
  });
  expect(allowed.status()).toBe(400); // Correct origin reaches workspace-ID validation.
  expect(allowed.headers()['access-control-allow-origin']).toBeUndefined();
  const foreign = await request.put('/api/preferences', {
    headers: { origin: 'https://foreign.invalid' },
    data: {},
  });
  expect(foreign.status()).toBe(403);
  const crossSite = await request.put('/api/preferences', {
    headers: { origin: canonical, 'sec-fetch-site': 'cross-site' },
    data: {},
  });
  expect(crossSite.status()).toBe(403);
});
