import { expect, test } from '@playwright/test';
import { en } from '../../src/lib/i18n/en';
import { installNativeAuthRoutes, installNativeBridge, openNativeAccount } from './native-fixture';

test.use({ trace: 'off' });

test('age choice starts neutral and under-16 people can keep local tools without sending identity data', async ({
  page,
}) => {
  await installNativeBridge(page);
  const { authRequests } = await installNativeAuthRoutes(page);
  await page.goto('/');
  const dialog = await openNativeAccount(page);
  await dialog
    .locator('.detail-tabs')
    .getByRole('button', { name: en.account.signUp, exact: true })
    .click();
  const age = dialog.getByRole('combobox', { name: 'Votre tranche d’âge', exact: true });
  await expect(age).toHaveValue('');
  await expect(dialog.getByLabel(en.account.email, { exact: true })).toHaveCount(0);
  await age.selectOption('under16');
  await expect(dialog.getByRole('status')).toContainText(
    'Le minuteur, les tâches et le planning restent disponibles',
  );
  await expect(dialog.getByLabel(en.account.email, { exact: true })).toHaveCount(0);
  await expect(dialog.locator('button[type="submit"]')).toHaveCount(0);
  expect(authRequests).toEqual([]);
  await dialog.getByRole('button', { name: en.common.close, exact: true }).click();
  await expect(page.getByRole('button', { name: en.timer.start, exact: true })).toBeVisible();
});

test('signup requires legal acceptance and sends only the age-band/legal-version declaration', async ({
  page,
}) => {
  await installNativeBridge(page);
  const { user, authRequests } = await installNativeAuthRoutes(page);
  await page.goto('/');
  const dialog = await openNativeAccount(page);
  await dialog
    .locator('.detail-tabs')
    .getByRole('button', { name: en.account.signUp, exact: true })
    .click();
  await dialog
    .getByRole('combobox', { name: 'Votre tranche d’âge', exact: true })
    .selectOption('16-17');
  await dialog.getByLabel(en.account.email, { exact: true }).fill(user.email);
  await dialog.locator('input[name="password"]').fill('fixture-eligibility-password');
  const acceptance = dialog.getByRole('checkbox', { name: /J’accepte les/ });
  await expect(acceptance).not.toBeChecked();
  await expect(
    dialog.getByRole('link', { name: 'conditions d’utilisation', exact: true }),
  ).toHaveAttribute('href', '/terms');
  await expect(
    dialog.getByRole('link', { name: 'politique de confidentialité', exact: true }),
  ).toHaveAttribute('href', '/privacy');
  await dialog.locator('button[type="submit"]').click();
  expect(authRequests.filter((request) => request.path === '/auth/v1/signup')).toEqual([]);
  await acceptance.check();
  await dialog.locator('button[type="submit"]').click();
  await expect(dialog.getByRole('status')).toHaveText(en.account.verify);
  const signup = authRequests.filter((request) => request.path === '/auth/v1/signup');
  expect(signup).toHaveLength(1);
  expect(signup[0].body?.data).toEqual({
    age_group: '16-17',
    terms_version: '2026-10-28',
    privacy_version: '2026-10-28',
    legal_accepted: true,
  });
  expect(signup[0].body).not.toHaveProperty('date_of_birth');
});

test('legacy sign-in requires a neutral age declaration without changing unknown account metadata', async ({
  page,
}) => {
  await installNativeBridge(page);
  const { user, authRequests } = await installNativeAuthRoutes(page);
  await page.goto('/');
  const dialog = await openNativeAccount(page);
  const age = dialog.getByRole('combobox', { name: 'Votre tranche d’âge', exact: true });
  await expect(age).toHaveValue('');
  await age.selectOption('under16');
  await expect(dialog.locator('button[type="submit"]')).toHaveCount(0);
  expect(authRequests).toEqual([]);
  await age.selectOption('18+');
  await dialog.getByLabel(en.account.email, { exact: true }).fill(user.email);
  await dialog.getByLabel(en.account.password, { exact: true }).fill('fixture-legacy-password');
  await dialog.locator('button[type="submit"]').click();
  await expect(
    dialog.locator('.account-summary').getByText(user.email, { exact: true }),
  ).toBeVisible();
  const signIns = authRequests.filter(
    (request) => new URL(request.url).searchParams.get('grant_type') === 'password',
  );
  expect(signIns).toHaveLength(1);
  expect(signIns[0].body).not.toHaveProperty('data');
  expect(signIns[0].body).not.toHaveProperty('age_group');
  expect(
    authRequests.filter((request) => request.path === '/auth/v1/user' && request.method === 'PUT'),
  ).toEqual([]);
});
