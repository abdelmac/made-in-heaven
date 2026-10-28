import { expect, test, type Page } from '@playwright/test';
import { en } from '../../src/lib/i18n/en';
import { ui } from '../../src/lib/i18n/ui';
import {
  installNativeAuthRoutes,
  installNativeBridge,
  openNativeAccount,
  type FixtureRequest,
} from './native-fixture';

test.use({ trace: 'off' });

const currentPassword = 'fixture-account-deletion-password';

async function installDeletionRoutes(page: Page, options: { logoutFails?: boolean } = {}) {
  await installNativeBridge(page);
  const fixture = await installNativeAuthRoutes(page);
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const freshToken = [
    { alg: 'HS256', typ: 'JWT' },
    {
      sub: fixture.user.id,
      aud: 'authenticated',
      role: 'authenticated',
      session_id: 'fixture-reauthenticated-session',
      amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) }],
      exp: expiresAt,
    },
  ]
    .map((value) => Buffer.from(JSON.stringify(value)).toString('base64url'))
    .concat('fixture-reauthenticated-signature')
    .join('.');
  const deletions: FixtureRequest[] = [];
  let passwordAttempts = 0;
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
    'access-control-allow-headers':
      'authorization,content-type,x-client-info,apikey,x-supabase-api-version',
  };
  // The existing fixture fulfills recognized SDK/API requests and aborts all
  // other HTTPS. These narrower overrides exercise real SDK sign-in/sign-out
  // with deterministic provider responses; nothing reaches an external account.
  await page.route('https://**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'OPTIONS') return route.fallback();
    if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
      passwordAttempts++;
      if (passwordAttempts === 1) return route.fallback();
      const body = request.postDataJSON();
      if (body.password !== currentPassword) {
        await route.fulfill({
          status: 400,
          headers: cors,
          json: { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' },
        });
      } else {
        await route.fulfill({
          headers: cors,
          json: {
            access_token: freshToken,
            refresh_token: 'fixture-reauthenticated-refresh',
            token_type: 'bearer',
            expires_in: 3600,
            expires_at: expiresAt,
            user: fixture.user,
          },
        });
      }
      return;
    }
    if (url.pathname === '/auth/v1/logout') {
      await route.fulfill(
        options.logoutFails
          ? {
              status: 503,
              headers: cors,
              json: { msg: 'Synthetic logout unavailable' },
            }
          : { status: 204, headers: cors },
      );
      return;
    }
    if (url.pathname === '/api/account' && request.method() === 'DELETE') {
      deletions.push({
        url: url.href,
        path: url.pathname,
        method: request.method(),
        body: request.postDataJSON(),
        authorization: request.headers().authorization,
        cookie: request.headers().cookie,
      });
      await route.fulfill({ headers: cors, json: { ok: true } });
      return;
    }
    await route.fallback();
  });
  return { ...fixture, freshToken, deletions, passwordAttempts: () => passwordAttempts };
}

async function openSignedInDeletion(page: Page, email: string) {
  await page.goto('/');
  const account = await openNativeAccount(page);
  await account
    .getByRole('combobox', { name: 'Votre tranche d’âge', exact: true })
    .selectOption('18+');
  await account.getByLabel(en.account.email, { exact: true }).fill(email);
  await account.getByLabel(en.account.password, { exact: true }).fill(currentPassword);
  await account.locator('button[type="submit"]').click();
  await expect(account.locator('.account-summary').getByText(email, { exact: true })).toBeVisible();
  await account.getByRole('button', { name: en.account.delete, exact: true }).click();
  const deletion = page.getByRole('dialog', { name: en.account.delete, exact: true });
  await expect(deletion).toBeVisible();
  await expect(deletion.getByText(/résilié immédiatement/)).toBeVisible();
  await deletion.getByLabel(en.account.deleteConfirmation, { exact: true }).fill('DELETE');
  return { account, deletion };
}

async function storedNativeKeys(page: Page) {
  return page.evaluate(() => {
    const stored: Record<string, string> = JSON.parse(
      sessionStorage.getItem('__native_mock.preferences') || '{}',
    );
    return Object.keys(stored)
      .filter((key) => key.startsWith('solace.workspace.'))
      .map((key) => decodeURIComponent(key.slice('solace.workspace.'.length)));
  });
}

test('native deletion rejects a wrong password, clears the input and leaves the account signed in', async ({
  page,
}) => {
  const fixture = await installDeletionRoutes(page);
  const { account, deletion } = await openSignedInDeletion(page, fixture.user.email);
  const password = deletion.getByLabel(/^Votre mot de passe actuel/);
  await password.fill('fixture-wrong-password');
  await deletion.getByRole('button', { name: en.account.delete, exact: true }).click();

  await expect(deletion.getByRole('alert')).toHaveText('Adresse e-mail ou mot de passe incorrect.');
  await expect(password).toHaveValue('');
  await expect(
    deletion.getByRole('button', { name: en.account.delete, exact: true }),
  ).toBeEnabled();
  expect(fixture.passwordAttempts()).toBe(2);
  expect(fixture.deletions).toEqual([]);
  await expect(
    account.locator('.account-summary').getByText(fixture.user.email, { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('__native_mock.secure'))).toContain(
    'fixture-mobile-refresh',
  );
});

test('native deletion sends only typed confirmation using the fresh bearer and clears private account caches', async ({
  page,
}) => {
  const fixture = await installDeletionRoutes(page);
  const { account, deletion } = await openSignedInDeletion(page, fixture.user.email);
  const accountPrefix = `folia:v1:account:${fixture.user.id}:`;
  const activeKey = `folia:v1:active:${fixture.user.id}`;
  await expect
    .poll(
      async () =>
        (await storedNativeKeys(page)).filter((key) => key.startsWith(accountPrefix)).length,
    )
    .toBeGreaterThan(0);
  await expect.poll(async () => (await storedNativeKeys(page)).includes(activeKey)).toBe(true);
  await deletion.getByLabel(/^Votre mot de passe actuel/).fill(currentPassword);
  await deletion.getByRole('button', { name: en.account.delete, exact: true }).click();

  await expect(deletion).not.toBeVisible();
  await expect(
    account.getByRole('combobox', { name: 'Votre tranche d’âge', exact: true }),
  ).toBeVisible();
  await expect(account.locator('.account-summary')).toHaveCount(0);
  await expect(
    page.getByRole('status').filter({ hasText: ui.settings.yourAccountHasBeenDeleted }),
  ).toBeVisible();
  expect(fixture.passwordAttempts()).toBe(2);
  expect(fixture.deletions).toHaveLength(1);
  expect(fixture.deletions[0].body).toEqual({ confirmation: 'DELETE' });
  expect(fixture.deletions[0].authorization).toBe(`Bearer ${fixture.freshToken}`);
  expect(fixture.deletions[0].authorization).not.toBe(`Bearer ${fixture.token}`);
  expect(fixture.deletions[0].cookie).toBeUndefined();
  await expect
    .poll(async () =>
      (await storedNativeKeys(page)).filter(
        (key) => key.startsWith(accountPrefix) || key === activeKey,
      ),
    )
    .toEqual([]);
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem('__native_mock.secure') || ''))
    .not.toContain('fixture-reauthenticated-refresh');
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem('__native_mock.secure') || ''))
    .not.toContain('fixture-mobile-refresh');
  // Signed-out refresh uses the local workspace. Reload must not resurrect the
  // deleted account from native secure storage or its former workspace cache.
  await page.reload();
  const signedOut = await openNativeAccount(page);
  await expect(
    signedOut.getByRole('combobox', { name: 'Votre tranche d’âge', exact: true }),
  ).toBeVisible();
  await expect(signedOut.locator('.account-summary')).toHaveCount(0);
});

test('native deletion stays final when remote logout fails after successful deletion', async ({
  page,
}) => {
  const fixture = await installDeletionRoutes(page, { logoutFails: true });
  const { account, deletion } = await openSignedInDeletion(page, fixture.user.email);
  await deletion.getByLabel(/^Votre mot de passe actuel/).fill(currentPassword);
  await deletion.getByRole('button', { name: en.account.delete, exact: true }).click();

  await expect(deletion).not.toBeVisible();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: /Votre compte a été supprimé\. Le nettoyage local est incomplet/ }),
  ).toBeVisible();
  await expect(account.getByRole('alert')).toHaveCount(0);
  await expect(
    account.getByRole('combobox', { name: 'Votre tranche d’âge', exact: true }),
  ).toBeVisible();
  expect(fixture.deletions).toHaveLength(1);
  await expect
    .poll(async () =>
      (await storedNativeKeys(page)).filter(
        (key) =>
          key.startsWith(`folia:v1:account:${fixture.user.id}:`) ||
          key === `folia:v1:active:${fixture.user.id}`,
      ),
    )
    .toEqual([]);
});
