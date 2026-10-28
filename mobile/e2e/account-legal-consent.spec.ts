import { expect, test, type Page } from '@playwright/test';
import { en } from '../../src/lib/i18n/en';
import {
  installNativeAuthRoutes,
  installNativeBridge,
  openNativeAccount,
  type FixtureRequest,
} from './native-fixture';

test.use({ trace: 'off' });

async function signedInLegacyAccount(page: Page) {
  await installNativeBridge(page);
  const fixture = await installNativeAuthRoutes(page);
  const posts: FixtureRequest[] = [];
  let fail = false;
  await page.route('https://**/api/account/consent', async (route) => {
    const request = route.request();
    if (request.method() !== 'POST') return route.fallback();
    posts.push({
      url: request.url(),
      path: '/api/account/consent',
      method: 'POST',
      body: request.postDataJSON(),
      authorization: request.headers().authorization,
      cookie: request.headers().cookie,
    });
    await route.fulfill({
      status: fail ? 503 : 200,
      headers: { 'access-control-allow-origin': '*' },
      json: fail
        ? { error: 'La déclaration ne peut pas être enregistrée maintenant.' }
        : {
            eligible: true,
            acceptance: { ...request.postDataJSON(), accepted_at: '2026-10-28T12:00:00Z' },
          },
    });
  });
  await page.goto('/');
  const dialog = await openNativeAccount(page);
  await dialog
    .getByRole('combobox', { name: 'Votre tranche d’âge', exact: true })
    .selectOption('18+');
  await dialog.getByLabel(en.account.email, { exact: true }).fill(fixture.user.email);
  await dialog
    .getByLabel(en.account.password, { exact: true })
    .fill('fixture-legacy-consent-password');
  await dialog.locator('button[type="submit"]').click();
  await expect(
    dialog.locator('.account-summary').getByText(fixture.user.email, { exact: true }),
  ).toBeVisible();
  const consent = dialog.getByRole('region', {
    name: 'Conditions du compte en ligne',
    exact: true,
  });
  await expect(consent).toBeVisible();
  await page.evaluate(() =>
    window.addEventListener('solace:legal-accepted', () =>
      sessionStorage.setItem('__fixture_legal_accepted_event', 'received'),
    ),
  );
  return {
    ...fixture,
    dialog,
    consent,
    posts,
    setFailure: (value: boolean) => {
      fail = value;
    },
  };
}

test('legacy online acceptance stays neutral, blocks under-16 submission and records explicit current terms', async ({
  page,
}) => {
  const fixture = await signedInLegacyAccount(page);
  const age = fixture.consent.getByRole('combobox', {
    name: 'Votre tranche d’âge pour ce compte',
    exact: true,
  });
  await expect(age).toHaveValue('');
  expect(fixture.posts).toEqual([]);
  await age.selectOption('under16');
  await expect(fixture.consent.getByText(/Déconnectez-vous/)).toBeVisible();
  await expect(
    fixture.consent.getByRole('button', { name: 'Enregistrer mon acceptation', exact: true }),
  ).toHaveCount(0);
  expect(fixture.posts).toEqual([]);
  await age.selectOption('16-17');
  const save = fixture.consent.getByRole('button', {
    name: 'Enregistrer mon acceptation',
    exact: true,
  });
  await expect(save).toBeDisabled();
  await fixture.consent.getByRole('checkbox', { name: /J’accepte les/ }).check();
  await save.click();
  await expect(fixture.consent).not.toBeVisible();
  await expect(
    fixture.dialog.getByText('Les conditions actuelles sont enregistrées pour ce compte.'),
  ).toBeVisible();
  expect(fixture.posts).toHaveLength(1);
  expect(fixture.posts[0].body).toEqual({
    age_group: '16-17',
    terms_version: '2026-10-28',
    privacy_version: '2026-10-28',
    legal_accepted: true,
  });
  expect(fixture.posts[0].authorization).toBe(`Bearer ${fixture.token}`);
  expect(fixture.posts[0].cookie).toBeUndefined();
  expect(await page.evaluate(() => sessionStorage.getItem('__fixture_legal_accepted_event'))).toBe(
    'received',
  );
});

test('failed legal acceptance stays pending and can retry without a false eligibility event', async ({
  page,
}) => {
  const fixture = await signedInLegacyAccount(page);
  fixture.setFailure(true);
  await fixture.consent
    .getByRole('combobox', { name: 'Votre tranche d’âge pour ce compte', exact: true })
    .selectOption('18+');
  await fixture.consent.getByRole('checkbox', { name: /J’accepte les/ }).check();
  const save = fixture.consent.getByRole('button', {
    name: 'Enregistrer mon acceptation',
    exact: true,
  });
  await save.click();
  await expect(fixture.consent.getByRole('alert')).toHaveText(
    'La déclaration ne peut pas être enregistrée maintenant.',
  );
  await expect(save).toBeEnabled();
  expect(
    await page.evaluate(() => sessionStorage.getItem('__fixture_legal_accepted_event')),
  ).toBeNull();
  fixture.setFailure(false);
  await save.click();
  await expect(fixture.consent).not.toBeVisible();
  expect(fixture.posts).toHaveLength(2);
  expect(await page.evaluate(() => sessionStorage.getItem('__fixture_legal_accepted_event'))).toBe(
    'received',
  );
});
