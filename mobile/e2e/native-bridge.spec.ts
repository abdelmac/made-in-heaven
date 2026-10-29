import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { en } from '../../src/lib/i18n/en';
import { ui } from '../../src/lib/i18n/ui';
import {
  installNativeBridge,
  emitNativeAppUrl,
  installNativeAuthRoutes,
  openNativeAccount,
} from './native-fixture';
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

const nativeCallback = 'com.solacepomodoro.myapp://auth/callback';

async function beginEmailFlow(page: Page, mode: 'signUp' | 'reset', email: string) {
  const dialog = await openNativeAccount(page);
  await dialog
    .locator('.detail-tabs')
    .getByRole('button', { name: en.account[mode], exact: true })
    .click();
  if (mode === 'signUp')
    await dialog
      .getByRole('combobox', { name: 'Votre tranche d’âge', exact: true })
      .selectOption('18+');
  await dialog.getByLabel(en.account.email, { exact: true }).fill(email);
  if (mode === 'signUp') {
    await dialog.locator('input[name="password"]').fill('fixture-password-12');
    await dialog.getByRole('checkbox', { name: /J’accepte les/ }).check();
  }
  await dialog.locator('button[type="submit"]').click();
  await expect(dialog.getByRole('status')).toHaveText(
    mode === 'signUp' ? en.account.verify : en.account.resetSent,
  );
  return dialog;
}

async function browserStorage(page: Page) {
  return page.evaluate(() => ({
    secure: sessionStorage.getItem('__native_mock.secure') || '',
    preferences: sessionStorage.getItem('__native_mock.preferences') || '',
    web: JSON.stringify(
      Object.fromEntries(Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)])),
    ),
  }));
}

test('native signup redeems its persisted PKCE verifier on cold launch only once', async ({
  page,
}) => {
  await installNativeBridge(page);
  const { user, token, authRequests, requests } = await installNativeAuthRoutes(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await beginEmailFlow(page, 'signUp', user.email);

  const signup = authRequests.find((request) => request.path === '/auth/v1/signup')!;
  expect(signup.method).toBe('POST');
  expect(new URL(signup.url).searchParams.get('redirect_to')).toBe(nativeCallback);
  expect(signup.body?.code_challenge_method).toBe('s256');
  expect(signup.body?.code_challenge).toEqual(expect.any(String));
  const pendingStorage = await browserStorage(page);
  expect(pendingStorage.secure).toContain('-code-verifier');
  expect(pendingStorage.preferences).not.toContain('-code-verifier');
  expect(pendingStorage.web).not.toContain('-code-verifier');

  const callback = `${nativeCallback}?code=fixture-signup-code`;
  await page.evaluate((url) => sessionStorage.setItem('__native_mock.launchUrl', url), callback);
  await page.reload();
  await expect
    .poll(
      () =>
        authRequests.filter(
          (request) => new URL(request.url).searchParams.get('grant_type') === 'pkce',
        ).length,
    )
    .toBe(1);
  const dialog = await openNativeAccount(page);
  await expect(
    dialog.locator('.account-summary').getByText(user.email, { exact: true }),
  ).toBeVisible();
  const exchange = authRequests.find(
    (request) => new URL(request.url).searchParams.get('grant_type') === 'pkce',
  )!;
  expect(exchange.body?.auth_code).toBe('fixture-signup-code');
  const verifier = String(exchange.body?.code_verifier);
  expect(verifier.length).toBeGreaterThanOrEqual(43);
  expect(pendingStorage.secure).toContain(verifier);
  expect(createHash('sha256').update(verifier).digest('base64url')).toBe(
    signup.body?.code_challenge,
  );

  await emitNativeAppUrl(page, callback, 2);
  await expect(page).toHaveURL(/\?view=overview$/);
  expect(
    authRequests.filter(
      (request) => new URL(request.url).searchParams.get('grant_type') === 'pkce',
    ),
  ).toHaveLength(1);
  await expect
    .poll(() => requests.filter((request) => request.path === '/api/sync').length)
    .toBeGreaterThan(0);
  for (const request of requests) {
    expect(request.authorization).toBe(`Bearer ${token}`);
    expect(request.cookie).toBeUndefined();
  }
  const stored = await browserStorage(page);
  expect(stored.secure).toContain('fixture-mobile-refresh');
  expect(stored.preferences + stored.web).not.toContain('fixture-mobile-refresh');
  expect(stored.preferences + stored.web).not.toContain(verifier);
  expect(page.url()).not.toContain('fixture-signup-code');
  expect(errors).toEqual([]);
});

test('native recovery opens the password form from a warm callback and updates through the session', async ({
  page,
}) => {
  await installNativeBridge(page);
  const { user, token, authRequests } = await installNativeAuthRoutes(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await beginEmailFlow(page, 'reset', user.email);
  const recovery = authRequests.find((request) => request.path === '/auth/v1/recover')!;
  expect(new URL(recovery.url).searchParams.get('redirect_to')).toBe(nativeCallback);
  expect(recovery.body?.code_challenge_method).toBe('s256');
  const pendingStorage = await browserStorage(page);
  expect(pendingStorage.secure).toContain('/recovery');

  // The account dialog is already open in reset mode: the lifecycle handler must
  // remount it after the SDK verifies recovery, rather than keep the old form.
  await emitNativeAppUrl(page, `${nativeCallback}?code=fixture-recovery-code`, 2);
  const dialog = page.getByRole('dialog', { name: 'Votre compte Solace', exact: true });
  const password = dialog.getByLabel(ui.settings.newPassword);
  await expect(password).toBeVisible();
  await expect(page).toHaveURL(/view=settings.*reset-password=1/);
  const exchanges = authRequests.filter(
    (request) => new URL(request.url).searchParams.get('grant_type') === 'pkce',
  );
  expect(exchanges).toHaveLength(1);
  expect(exchanges[0].body?.auth_code).toBe('fixture-recovery-code');
  const verifier = String(exchanges[0].body?.code_verifier);
  expect(createHash('sha256').update(verifier).digest('base64url')).toBe(
    recovery.body?.code_challenge,
  );
  expect(pendingStorage.secure).toContain(`${verifier}/recovery`);

  await password.fill('fixture-updated-password-12');
  await dialog.getByRole('button', { name: ui.settings.updatePassword, exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveText(ui.settings.passwordUpdated);
  const update = authRequests.find(
    (request) => request.path === '/auth/v1/user' && request.method === 'PUT',
  )!;
  expect(update.body?.password).toBe('fixture-updated-password-12');
  expect(update.authorization).toBe(`Bearer ${token}`);
  expect(update.cookie).toBeUndefined();
  expect(new URL(page.url()).searchParams.has('reset-password')).toBe(false);
  expect(page.url()).not.toContain('fixture-recovery-code');
  expect(errors).toEqual([]);
});

test('native recovery retains its session after same_password rejection and allows a different password retry', async ({
  page,
}) => {
  await installNativeBridge(page);
  const existingPassword = 'fixture-existing-password-12';
  const replacementPassword = 'fixture-different-password-12';
  const { user, token, authRequests } = await installNativeAuthRoutes(page, {
    samePassword: existingPassword,
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await beginEmailFlow(page, 'reset', user.email);
  await emitNativeAppUrl(page, `${nativeCallback}?code=fixture-recovery-retry-code`);
  const dialog = page.getByRole('dialog', { name: 'Votre compte Solace', exact: true });
  const password = dialog.getByLabel(ui.settings.newPassword);
  const update = dialog.getByRole('button', { name: ui.settings.updatePassword, exact: true });
  await expect(password).toBeVisible();
  await password.fill(existingPassword);
  const rejectedResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/auth/v1/user' && response.request().method() === 'PUT',
  );
  await update.click();
  expect((await rejectedResponse).status()).toBe(422);
  await expect(dialog.getByRole('status')).toHaveText(
    'New password should be different from the old password.',
  );
  await expect(dialog.getByRole('status')).not.toHaveText(ui.settings.passwordUpdated);
  await expect(password).toBeVisible();
  await expect(update).toBeEnabled();
  expect(new URL(page.url()).searchParams.get('reset-password')).toBe('1');
  await expect(dialog.locator('.account-summary')).toBeVisible();

  // Reuse the verified recovery session: a rejected update must not consume it
  // or require a second email and one-time-code exchange.
  await password.fill(replacementPassword);
  const acceptedResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/auth/v1/user' && response.request().method() === 'PUT',
  );
  await update.click();
  expect((await acceptedResponse).status()).toBe(200);
  await expect(dialog.getByRole('status')).toHaveText(ui.settings.passwordUpdated);
  expect(new URL(page.url()).searchParams.has('reset-password')).toBe(false);
  await expect(password).not.toBeVisible();
  const updates = authRequests.filter(
    (request) => request.path === '/auth/v1/user' && request.method === 'PUT',
  );
  expect(updates.map((request) => request.body?.password)).toEqual([
    existingPassword,
    replacementPassword,
  ]);
  for (const request of updates) {
    expect(request.authorization).toBe(`Bearer ${token}`);
    expect(request.cookie).toBeUndefined();
  }
  expect(authRequests.filter((request) => request.path === '/auth/v1/recover')).toHaveLength(1);
  expect(
    authRequests.filter(
      (request) => new URL(request.url).searchParams.get('grant_type') === 'pkce',
    ),
  ).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('native callback without this installation PKCE verifier stays signed out', async ({
  page,
}) => {
  await installNativeBridge(page);
  const { authRequests } = await installNativeAuthRoutes(page);
  await page.goto('/');
  await emitNativeAppUrl(page, `${nativeCallback}?code=borrowed-code`);
  await expect(
    page.getByRole('status').filter({ hasText: 'Demandez un nouveau lien' }),
  ).toBeVisible();
  expect(authRequests.filter((request) => request.path === '/auth/v1/token')).toHaveLength(0);
  const dialog = await openNativeAccount(page);
  await expect(
    dialog.getByRole('combobox', { name: 'Votre tranche d’âge', exact: true }),
  ).toBeVisible();
  expect((await browserStorage(page)).secure).not.toContain('fixture-mobile-refresh');
  expect(page.url()).not.toContain('borrowed-code');
});

test('expired native PKCE exchange shows a safe error without creating a session', async ({
  page,
}) => {
  await installNativeBridge(page);
  const { user, authRequests } = await installNativeAuthRoutes(page);
  await page.goto('/');
  await beginEmailFlow(page, 'signUp', user.email);
  await emitNativeAppUrl(page, `${nativeCallback}?code=expired-code`, 2);
  await expect(
    page.getByRole('status').filter({ hasText: 'Demandez un nouveau lien' }),
  ).toBeVisible();
  expect(authRequests.filter((request) => request.path === '/auth/v1/token')).toHaveLength(1);
  expect(
    authRequests.filter((request) => request.path === '/auth/v1/token')[0].body?.code_verifier,
  ).toEqual(expect.any(String));
  await expect(page.locator('body')).not.toContainText('private-provider-diagnostic');
  await expect(page.locator('body')).not.toContainText('fixture-mobile-refresh');
  expect((await browserStorage(page)).secure).not.toContain('fixture-mobile-refresh');
  expect(page.url()).not.toContain('expired-code');
});

test('native bridge uses secure session storage and bearer API requests across reload', async ({
  page,
}) => {
  await installNativeBridge(page);

  const { user, token, requests } = await installNativeAuthRoutes(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.app-shell')).toBeVisible();
  await page
    .locator('.mobile-header')
    .getByRole('button', { name: 'Ouvrir le compte', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Votre compte Solace', exact: true });
  await dialog
    .getByRole('combobox', { name: 'Votre tranche d’âge', exact: true })
    .selectOption('18+');
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
