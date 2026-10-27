import { expect, test, type Page } from '@playwright/test';
import { createEmptyData } from '../../src/lib/model';
import { DEFAULT_BILLING_POLICY, PLAN_FEATURES } from '../../src/lib/billing/config';
import { en } from '../../src/lib/i18n/en';

async function installNativeBridge(page: Page) {
  // This bridge is a deterministic fixture for the real bundled JS. It does not
  // claim to verify Android Keystore, device notifications or native Java code.
  await page.addInitScript(() => {
    const read = (key: string): Record<string, string> =>
      JSON.parse(sessionStorage.getItem(key) || '{}');
    const write = (key: string, value: Record<string, string>) =>
      sessionStorage.setItem(key, JSON.stringify(value));
    const fakeWindow = window as unknown as Record<string, unknown>;
    fakeWindow.androidBridge = {};
    const plugins: Record<string, string[]> = {
      Preferences: ['get', 'set', 'remove', 'keys'],
      SecureStorage: [
        'internalGetItem',
        'internalSetItem',
        'internalRemoveItem',
        'setSynchronizeKeychain',
        'internalGetPrefixedKeys',
      ],
      App: ['addListener', 'removeListener', 'getState', 'getLaunchUrl', 'minimizeApp'],
      LocalNotifications: [
        'addListener',
        'removeListener',
        'checkPermissions',
        'getPending',
        'cancel',
        'schedule',
        'createChannel',
        'checkExactNotificationSetting',
      ],
      Browser: ['open'],
    };
    fakeWindow.Capacitor = {
      PluginHeaders: Object.entries(plugins).map(([name, methods]) => ({
        name,
        methods: methods.map((method) => ({
          name: method,
          rtype: method === 'addListener' ? 'callback' : 'promise',
        })),
      })),
      nativePromise: async (
        plugin: string,
        method: string,
        options: Record<string, unknown> = {},
      ) => {
        const prefsKey = '__native_mock.preferences';
        const secureKey = '__native_mock.secure';
        if (plugin === 'Preferences') {
          const prefs = read(prefsKey);
          const key = String(options.key);
          if (method === 'get') return { value: prefs[key] ?? null };
          if (method === 'keys') return { keys: Object.keys(prefs) };
          if (method === 'set') {
            prefs[key] = String(options.value);
            write(prefsKey, prefs);
          }
          if (method === 'remove') {
            delete prefs[key];
            write(prefsKey, prefs);
          }
          return {};
        }
        if (plugin === 'SecureStorage') {
          const secure = read(secureKey);
          const key = String(options.prefixedKey);
          if (method === 'internalGetItem') return { data: secure[key] ?? null };
          if (method === 'internalSetItem') {
            secure[key] = String(options.data);
            write(secureKey, secure);
          }
          if (method === 'internalRemoveItem') {
            delete secure[key];
            write(secureKey, secure);
            return { success: true };
          }
          if (method === 'internalGetPrefixedKeys') return { keys: Object.keys(secure) };
          return {};
        }
        if (plugin === 'App' && method === 'getState') return { isActive: true };
        if (plugin === 'App' && method === 'getLaunchUrl') return {};
        if (plugin === 'LocalNotifications' && method === 'getPending')
          return { notifications: [] };
        if (plugin === 'LocalNotifications' && method === 'checkPermissions')
          return { display: 'denied' };
        if (plugin === 'LocalNotifications' && method === 'checkExactNotificationSetting')
          return { exact_alarm: 'denied' };
        return {};
      },
      nativeCallback: () => Promise.resolve('mock-listener'),
    };
  });
}

test('native bridge starts without thenable-plugin errors and restores private local work', async ({
  page,
}) => {
  await installNativeBridge(page);
  await page.route('https://**/*', (route) => route.abort());
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?view=tasks');
  await expect(page.locator('.app-shell')).toBeVisible();
  await page.getByRole('button', { name: en.tasks.add, exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(en.tasks.titleField, { exact: true }).fill('Native local task');
  await dialog.getByRole('button', { name: en.tasks.add, exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem('__native_mock.preferences') || ''))
    .toContain('Native local task');
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((key) => key.startsWith('folia:v1:')),
    ),
  ).toEqual([]);
  await page.reload();
  await expect(page.getByRole('button', { name: /^Native local task/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('native bridge uses secure session storage and bearer API requests across reload', async ({
  page,
}) => {
  await installNativeBridge(page);

  const user = { id: '11111111-1111-4111-8111-111111111111', email: 'mobile@example.test' };
  const workspaceId = '22222222-2222-4222-8222-222222222222';
  const entitlements = {
    tier: 'free',
    features: PLAN_FEATURES.free,
    limits: DEFAULT_BILLING_POLICY.plans.free,
  };
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const token = [
    { alg: 'HS256', typ: 'JWT' },
    { sub: user.id, aud: 'authenticated', role: 'authenticated', exp: expiresAt },
  ]
    .map((value) => Buffer.from(JSON.stringify(value)).toString('base64url'))
    .concat('fixture-signature')
    .join('.');
  const requests: { path: string; authorization?: string; cookie?: string }[] = [];
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers':
      'authorization,content-type,x-client-info,apikey,x-supabase-api-version,x-folia-document-version,x-folia-mood-version',
  };
  await page.route('https://**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }
    if (url.pathname.startsWith('/auth/v1/')) {
      await route.fulfill({
        headers: cors,
        json: url.pathname.endsWith('/token')
          ? {
              access_token: token,
              refresh_token: 'fixture-mobile-refresh',
              token_type: 'bearer',
              expires_in: 3600,
              expires_at: expiresAt,
              user,
            }
          : user,
      });
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      requests.push({
        path: url.pathname,
        authorization: request.headers().authorization,
        cookie: request.headers().cookie,
      });
      if (url.pathname === '/api/workspaces') {
        await route.fulfill({
          headers: cors,
          json: {
            user,
            workspaces: [
              {
                id: workspaceId,
                name: 'Espace mobile de test',
                kind: 'personal',
                role: 'owner',
                plan: 'free',
                entitlements,
              },
            ],
          },
        });
      } else if (url.pathname === '/api/sync') {
        await route.fulfill({
          headers: cors,
          json: { data: createEmptyData(workspaceId), version: 0 },
        });
      } else if (url.pathname === '/api/audio') {
        await route.fulfill({ headers: cors, json: { tracks: [] } });
      } else {
        await route.fulfill({
          status: 404,
          headers: cors,
          json: { error: 'Unexpected fixture route' },
        });
      }
      return;
    }
    await route.abort();
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.app-shell')).toBeVisible();
  await page
    .locator('.mobile-header')
    .getByRole('button', { name: 'Ouvrir le compte', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Votre compte Solace', exact: true });
  const submit = dialog.locator('button[type="submit"]');
  test.skip(
    await submit.isDisabled(),
    'The mobile bundle needs public Supabase configuration to run the mocked native sign-in.',
  );
  await dialog.getByLabel(en.account.email, { exact: true }).fill(user.email);
  await dialog.getByLabel(en.account.password, { exact: true }).fill('fixture-password');
  await submit.click();
  await expect(
    dialog.locator('.account-summary').getByText(user.email, { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => requests.filter((request) => request.path === '/api/sync').length)
    .toBeGreaterThan(0);
  for (const request of requests) {
    expect(request.authorization).toBe(`Bearer ${token}`);
    expect(request.cookie).toBeUndefined();
  }
  const stored = await page.evaluate(() => ({
    secure: sessionStorage.getItem('__native_mock.secure') || '',
    preferences: sessionStorage.getItem('__native_mock.preferences') || '',
    web: JSON.stringify(
      Object.fromEntries(Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)])),
    ),
  }));
  expect(stored.secure).toContain('fixture-mobile-refresh');
  expect(stored.preferences).not.toContain('fixture-mobile-refresh');
  expect(stored.web).not.toContain('fixture-mobile-refresh');
  const syncCount = requests.filter((request) => request.path === '/api/sync').length;
  await page.reload();
  await expect(page.locator('.app-shell')).toBeVisible();
  await expect
    .poll(() => requests.filter((request) => request.path === '/api/sync').length)
    .toBeGreaterThan(syncCount);
  await page
    .locator('.mobile-header')
    .getByRole('button', { name: 'Ouvrir le compte', exact: true })
    .click();
  await expect(
    page.getByRole('dialog').locator('.account-summary').getByText(user.email, { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
