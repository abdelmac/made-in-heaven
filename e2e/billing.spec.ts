import { expect, test, type Page } from '@playwright/test';
import { billingCopy } from '../src/lib/i18n/billing';
import { en } from '../src/lib/i18n/en';
import { DEFAULT_BILLING_POLICY, PLAN_FEATURES } from '../src/lib/billing/config';
import { createEmptyData } from '../src/lib/model';

const fixturePrices = [
  {
    tier: 'pro',
    interval: 'month',
    priceId: 'price_fixtureMonth',
    currency: 'eur',
    unitAmount: 1234,
    formattedAmount: '€12.34',
    checkoutAvailable: true,
  },
  {
    tier: 'pro',
    interval: 'year',
    priceId: 'price_fixtureYear',
    currency: 'eur',
    unitAmount: 12345,
    formattedAmount: '€123.45',
    checkoutAvailable: true,
  },
];

async function signInWithFixture(page: Page, tier: 'free' | 'pro') {
  const user = { id: '11111111-1111-4111-8111-111111111111', email: 'billing@example.test' };
  const workspaceId = '22222222-2222-4222-8222-222222222222';
  const entitlements = {
    tier,
    features: PLAN_FEATURES[tier],
    limits: DEFAULT_BILLING_POLICY.plans[tier],
  };
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const accessToken = [
    { alg: 'HS256', typ: 'JWT' },
    { sub: user.id, aud: 'authenticated', role: 'authenticated', exp: expiresAt },
  ]
    .map((part) => Buffer.from(JSON.stringify(part)).toString('base64url'))
    .concat('fixture-signature')
    .join('.');
  // Browser auth and application endpoints are entirely synthetic; no provider is contacted.
  await page.route('**/auth/v1/**', (route) =>
    route.fulfill({
      json: new URL(route.request().url()).pathname.endsWith('/token')
        ? {
            access_token: accessToken,
            refresh_token: 'fixture-refresh-token',
            token_type: 'bearer',
            expires_in: 3600,
            expires_at: expiresAt,
            user,
          }
        : user,
    }),
  );
  await page.route('**/api/workspaces', (route) =>
    route.fulfill({
      json: {
        user,
        workspaces: [
          {
            id: workspaceId,
            name: 'Espace de test',
            kind: 'personal',
            role: 'owner',
            plan: tier,
            entitlements,
          },
        ],
      },
    }),
  );
  await page.route('**/api/sync?*', (route) =>
    route.fulfill({ json: { data: createEmptyData(workspaceId), version: 0 } }),
  );
  await page.route('**/api/audio?*', (route) => route.fulfill({ json: { tracks: [] } }));
  await page.route('**/api/billing/prices', (route) =>
    route.fulfill({
      json: { configured: true, checkoutEnabled: false, mode: 'live', prices: fixturePrices },
    }),
  );
  await page.route('**/api/billing?*', (route) =>
    route.fulfill({
      json: {
        configured: true,
        checkoutEnabled: false,
        mode: 'live',
        // Deliberately inconsistent price flags ensure the UI respects the launch gate itself.
        prices: fixturePrices,
        canManage: true,
        portalAvailable: tier === 'pro',
        entitlements,
        subscription: tier === 'pro' ? { tier, status: 'active' } : null,
        invoices: [],
      },
    }),
  );
  await page.goto('/?view=billing');
  await page
    .locator('.billing-account')
    .getByRole('button', { name: en.account.signIn, exact: true })
    .click();
  const account = page.getByRole('dialog', { name: 'Votre compte Solace' });
  const submit = account.locator('button[type="submit"]');
  test.skip(
    await submit.isDisabled(),
    'A public Supabase URL/key is needed to instantiate the mocked browser auth client.',
  );
  await account.getByLabel(en.account.email, { exact: true }).fill(user.email);
  await account.getByLabel(en.account.password, { exact: true }).fill('fixture-password');
  await submit.click();
  await expect(
    account.getByRole('button', { name: en.account.signOut, exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(account).not.toBeVisible();
  await expect(page.locator('.subscription-status')).toHaveText(
    tier === 'pro' ? 'Actif' : 'Aucun abonnement',
  );
  return { workspaceId };
}

test('Free colors and notes stay clear, and an unconfigured upgrade leads to account setup', async ({
  page,
}) => {
  await page.route('**/api/billing/prices', (route) =>
    route.fulfill({ json: { configured: false, checkoutEnabled: false, mode: null, prices: [] } }),
  );
  await page.goto('/?view=billing');
  const free = page
    .locator('.pricing-card')
    .filter({ has: page.getByRole('heading', { name: 'Gratuit', exact: true }) });
  const pro = page
    .locator('.pricing-card')
    .filter({ has: page.getByRole('heading', { name: 'Pro', exact: true }) });
  await expect(free).toContainText(billingCopy.features.free[1]);
  await expect(free).toContainText('Fiches de notes');
  await expect(pro).toContainText(billingCopy.features.pro[1]);
  await expect(pro).toContainText(billingCopy.features.pro[3]);
  await expect(page.getByText(billingCopy.billingUnavailable)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choisir Pro', exact: true })).toHaveCount(0);
  await free.getByRole('button', { name: 'Personnaliser vos couleurs' }).click();
  await expect(page.locator('.breadcrumb strong')).toHaveText('Paramètres');
  await page.goto('/?view=billing');
  await pro.getByRole('button', { name: 'Se connecter pour changer d’offre' }).click();
  await expect(page.getByRole('dialog', { name: 'Votre compte Solace' })).toBeVisible();
});

test('monthly and annual amounts come from the Stripe catalog with explicit annual billing', async ({
  page,
}) => {
  // Synthetic API fixtures verify rendering only; these are not Folia's offered prices.
  await page.route('**/api/billing/prices', (route) =>
    route.fulfill({
      json: {
        configured: true,
        checkoutEnabled: true,
        mode: 'test',
        prices: fixturePrices,
      },
    }),
  );
  await page.goto('/?view=billing');
  const pro = page
    .locator('.pricing-card')
    .filter({ has: page.getByRole('heading', { name: 'Pro', exact: true }) });
  await expect(pro).toContainText('€12.34');
  await page.getByRole('button', { name: 'Annuel', exact: true }).click();
  await expect(pro).toContainText('€123.45');
  await expect(pro).toContainText(billingCopy.billedAnnually);
  await expect(pro).not.toContainText('€12.34');
  await expect(page.getByRole('button', { name: 'Annuel', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(
    pro.getByRole('button', { name: 'Se connecter pour changer d’offre' }),
  ).toBeEnabled();
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width + 1,
    );
  }
});

test('an unavailable billing API can be retried without showing a checkout success', async ({
  page,
}) => {
  let calls = 0;
  await page.route('**/api/billing/prices', (route) => {
    calls += 1;
    return calls === 1
      ? route.fulfill({ status: 503, json: { error: 'Billing is temporarily unavailable.' } })
      : route.fulfill({
          json: { configured: false, checkoutEnabled: false, mode: null, prices: [] },
        });
  });
  await page.goto('/?view=billing');
  await expect(page.locator('.error[role="alert"]')).toContainText(
    'Billing is temporarily unavailable.',
  );
  await page
    .getByRole('button', { name: 'Vérifier à nouveau la disponibilité', exact: true })
    .click();
  await expect(page.locator('.error[role="alert"]')).toHaveCount(0);
  await expect(page.getByText(billingCopy.billingUnavailable)).toBeVisible();
  await expect(
    page.getByText('Votre offre payante est active dans cet espace.', { exact: true }),
  ).toHaveCount(0);
});

for (const mode of ['test', 'live', null] as const) {
  test(`billing copy accurately describes ${mode ?? 'unknown'} payment mode`, async ({ page }) => {
    await page.route('**/api/billing/prices', (route) =>
      route.fulfill({
        json: {
          configured: mode !== null,
          checkoutEnabled: mode !== null,
          mode,
          prices: fixturePrices,
        },
      }),
    );
    await page.goto('/?view=billing');
    await expect(page.locator('.billing-top .badge')).toHaveText(
      mode === 'test'
        ? en.billing.test
        : mode === 'live'
          ? billingCopy.liveMode
          : billingCopy.unavailableAction,
    );
    await expect(page.getByText(billingCopy.testHint, { exact: true })).toHaveCount(
      mode === 'test' ? 1 : 0,
    );
    await expect(page.getByText(billingCopy.liveHint, { exact: true })).toHaveCount(
      mode === 'live' ? 1 : 0,
    );
    if (mode !== 'test') await expect(page.getByText(/aucun paiement réel/)).toHaveCount(0);
    const legal = page.getByRole('navigation', { name: billingCopy.legalNavigation });
    for (const { href, label } of billingCopy.legalLinks) {
      await expect(legal.getByRole('link', { name: label, exact: true })).toHaveAttribute(
        'href',
        href,
      );
    }
  });
}

test('payment mode stays unavailable until the catalog responds', async ({ page }) => {
  let release!: () => void;
  const catalogReady = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/billing/prices', async (route) => {
    await catalogReady;
    await route.fulfill({
      json: { configured: true, checkoutEnabled: true, mode: 'live', prices: fixturePrices },
    });
  });
  await page.goto('/?view=billing');
  await expect(page.locator('.billing-top .badge')).toHaveText(billingCopy.unavailableAction);
  await expect(page.getByText(/aucun paiement réel/)).toHaveCount(0);
  release();
  await expect(page.locator('.billing-top .badge')).toHaveText(billingCopy.liveMode);
});

test('closed live checkout keeps account access and free customization available', async ({
  page,
}) => {
  let checkoutCalls = 0;
  await page.route('**/api/billing/checkout', (route) => {
    checkoutCalls += 1;
    return route.fulfill({ status: 503, json: { error: 'Checkout is closed.' } });
  });
  await page.route('**/api/billing/prices', (route) =>
    route.fulfill({
      json: { configured: true, checkoutEnabled: false, mode: 'live', prices: fixturePrices },
    }),
  );
  await page.goto('/?view=billing');
  await expect(page.getByText(billingCopy.launchClosed, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: billingCopy.choosePro, exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByText(billingCopy.testHint, { exact: true })).toHaveCount(0);
  const pro = page
    .locator('.pricing-card')
    .filter({ has: page.getByRole('heading', { name: 'Pro', exact: true }) });
  await pro.getByRole('button', { name: en.account.signIn, exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Votre compte Solace' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: billingCopy.customizeFree, exact: true }).click();
  await expect(page.locator('.breadcrumb strong')).toHaveText('Paramètres');
  expect(checkoutCalls).toBe(0);
});

test('a signed-in Free account cannot check out before launch and audio has no purchase prompt', async ({
  page,
}) => {
  let checkoutCalls = 0;
  await page.route('**/api/billing/checkout', (route) => {
    checkoutCalls += 1;
    return route.fulfill({ status: 503, json: { error: 'Checkout is closed.' } });
  });
  await signInWithFixture(page, 'free');
  const pro = page
    .locator('.pricing-card')
    .filter({ has: page.getByRole('heading', { name: 'Pro', exact: true }) });
  await expect(
    pro.getByRole('button', { name: billingCopy.launchClosedAction, exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole('button', { name: billingCopy.choosePro, exact: true })).toHaveCount(
    0,
  );
  const audio = page.getByRole('complementary', { name: 'Ambiances audio', exact: true });
  await expect(audio).toContainText('Le catalogue d’ambiances audio n’est pas encore disponible.');
  await expect(audio.getByRole('button')).toHaveCount(0);
  await page.getByRole('button', { name: billingCopy.customizeFree, exact: true }).click();
  await expect(page.locator('.breadcrumb strong')).toHaveText('Paramètres');
  expect(checkoutCalls).toBe(0);
});

test('an existing subscriber can open the customer portal while live checkout is closed', async ({
  page,
}) => {
  let portalWorkspace = '';
  const destination = 'https://billing.stripe.com/p/session_fixture';
  await page.route(destination, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<p>Fixture customer portal</p>' }),
  );
  await page.route('**/api/billing/portal', (route) => {
    portalWorkspace = route.request().postDataJSON().workspaceId;
    return route.fulfill({ json: { url: destination } });
  });
  const { workspaceId } = await signInWithFixture(page, 'pro');
  await expect(page.getByText(billingCopy.launchClosed, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: en.billing.portal, exact: true }).last().click();
  await expect(page).toHaveURL(destination);
  expect(portalWorkspace).toBe(workspaceId);
});
