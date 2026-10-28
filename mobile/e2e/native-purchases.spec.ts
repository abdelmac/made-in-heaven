import { expect, test, type Page } from '@playwright/test';
import type { Product, Transaction } from '@capgo/native-purchases';
import { DEFAULT_BILLING_POLICY, PLAN_FEATURES } from '../../src/lib/billing/config';
import { installNativeBridge, installNativeAuthRoutes, openNativeAccount } from './native-fixture';

const productId = 'solace.pro.monthly';
const accountToken = '33333333-3333-4333-8333-333333333333';
const purchaseToken = 'intercepted-store-purchase-token';
const workspaceId = '22222222-2222-4222-8222-222222222222';
const intentId = '55555555-5555-4555-8555-555555555555';
// The Android 8.9.6 bridge omits its declared subscriptionPeriod field.
// The server's verified P1M base-plan duration supplies the missing metadata.
const catalog: Product = {
  identifier: 'monthly',
  planIdentifier: productId,
  offerToken: 'intercepted-base-offer',
  title: 'Solace Pro de la boutique',
  description: 'Fonctions personnelles Pro.',
  price: 7.28,
  priceString: '$7.28',
  currencyCode: 'USD',
  currencySymbol: '$',
  isFamilyShareable: false,
  subscriptionGroupIdentifier: '',
  introductoryPrice: null,
  discounts: [],
} as unknown as Product;
const transaction: Transaction = {
  transactionId: 'intercepted-order',
  productIdentifier: productId,
  appAccountToken: accountToken,
  purchaseToken,
  purchaseState: '1',
  purchaseDate: '2026-10-28T12:00:00Z',
  willCancel: null,
  isAcknowledged: false,
};
const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'authorization,content-type',
};
type PurchaseControl = {
  calls: { method: string; options: Record<string, unknown> }[];
  finishVerified(): void;
};

async function fixture(
  page: Page,
  options: {
    ready?: boolean;
    outcome?: 'success' | 'cancelled' | 'pending';
    waitForVerification?: boolean;
    failVerificationOnce?: boolean;
    legalGate?: boolean;
    workspaceKind?: 'personal' | 'organization';
    purchaseAllowed?: boolean;
    intentDenied?: boolean;
    expiredIntent?: boolean;
    releaseFails?: boolean;
  } = {},
) {
  await installNativeBridge(page, {
    purchases: { products: [catalog], transaction, outcome: options.outcome },
  });
  const auth = await installNativeAuthRoutes(page);
  let verified = false;
  let legalAccepted = !options.legalGate;
  let intentPending = false;
  const expiresAt = new Date(
    Date.now() + (options.expiredIntent ? -1000 : 15 * 60_000),
  ).toISOString();
  const intentRequests: unknown[] = [];
  const releaseRequests: unknown[] = [];
  const configurationRequests: string[] = [];
  let releaseVerification: (() => void) | undefined;
  const verifyRequests: { body: unknown; authorization?: string; cookie?: string }[] = [];
  const entitlements = () => {
    const tier = verified ? 'pro' : 'free';
    return { tier, features: PLAN_FEATURES[tier], limits: DEFAULT_BILLING_POLICY.plans[tier] };
  };
  await page.route('https://**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'OPTIONS') return route.fallback();
    if (url.pathname === '/api/account/consent' && request.method() === 'GET') {
      await route.fulfill({
        headers: cors,
        json: {
          eligible: legalAccepted,
          acceptance: legalAccepted
            ? {
                age_group: '18+',
                terms_version: '2026-10-28',
                privacy_version: '2026-10-28',
                accepted_at: '2026-10-28T12:00:00.000Z',
              }
            : null,
          versions: { terms: '2026-10-28', privacy: '2026-10-28' },
        },
      });
      return;
    }
    if (url.pathname === '/api/billing/native/intent') {
      intentRequests.push(request.postDataJSON());
      intentPending = true;
      await route.fulfill(
        options.intentDenied
          ? { status: 409, headers: cors, json: { error: 'An unresolved purchase already exists' } }
          : { headers: cors, json: { intentId, expiresAt } },
      );
      return;
    }
    if (url.pathname === '/api/billing/native/intent/release') {
      releaseRequests.push(request.postDataJSON());
      if (!options.releaseFails) intentPending = false;
      await route.fulfill(
        options.releaseFails
          ? { status: 503, headers: cors, json: { error: 'Reservation cleanup unavailable' } }
          : { headers: cors, json: { released: true } },
      );
      return;
    }
    if (url.pathname === '/api/workspaces') {
      await route.fulfill({
        headers: cors,
        json: {
          user: auth.user,
          workspaces: [
            {
              id: workspaceId,
              name: 'Espace mobile de test',
              kind: options.workspaceKind ?? 'personal',
              role: 'owner',
              plan: verified ? 'pro' : 'free',
              entitlements: entitlements(),
            },
          ],
        },
      });
      return;
    }
    if (url.pathname === '/api/billing/native') {
      configurationRequests.push(url.href);
      await route.fulfill({
        headers: cors,
        json: {
          ready: options.ready !== false && legalAccepted,
          purchaseAllowed:
            options.purchaseAllowed !== false && legalAccepted && !verified && !intentPending,
          pendingPurchaseIntent: intentPending
            ? { intentId, expiresAt, platform: 'android' }
            : null,
          reason: legalAccepted ? undefined : 'legal_acceptance_required',
          platform: 'android',
          productId,
          basePlanId: 'monthly',
          billingPeriod: 'P1M',
          appAccountToken: legalAccepted ? accountToken : null,
          environment: 'sandbox',
          entitlements: entitlements(),
        },
      });
      return;
    }
    if (url.pathname === '/api/billing/native/verify') {
      verifyRequests.push({
        body: request.postDataJSON(),
        authorization: request.headers().authorization,
        cookie: request.headers().cookie,
      });
      if (options.failVerificationOnce && verifyRequests.length === 1) {
        await route.fulfill({
          status: 503,
          headers: cors,
          json: { error: 'Temporary verification unavailable' },
        });
        return;
      }
      if (options.waitForVerification)
        await new Promise<void>((resolve) => {
          releaseVerification = resolve;
        });
      verified = true;
      intentPending = false;
      await page.evaluate(() =>
        (
          window as unknown as { __nativePurchaseFixture: PurchaseControl }
        ).__nativePurchaseFixture.finishVerified(),
      );
      await route.fulfill({
        headers: cors,
        json: {
          verified: true,
          acknowledged: true,
          entitlements: entitlements(),
          subscription: {
            provider: 'google',
            status: 'active',
            currentPeriodEnd: '2026-11-28T12:00:00Z',
          },
        },
      });
      return;
    }
    return route.fallback();
  });
  await page.goto('/?view=billing');
  const dialog = await openNativeAccount(page);
  await dialog
    .getByRole('combobox', { name: 'Votre tranche d’âge', exact: true })
    .selectOption('18+');
  await dialog.getByLabel('Adresse e-mail', { exact: true }).fill(auth.user.email);
  await dialog.locator('input[name="password"]').fill('fixture-password-12');
  await dialog.locator('button[type="submit"]').click();
  await expect(dialog.getByRole('heading', { name: 'Votre compte', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Fermer', exact: true }).click();
  return {
    ...auth,
    verifyRequests,
    configurationRequests,
    intentRequests,
    releaseRequests,
    acceptLegal: () => {
      legalAccepted = true;
    },
    release: () => releaseVerification?.(),
  };
}

test('native Pro uses localized store pricing and grants access only after server confirmation', async ({
  page,
}) => {
  const f = await fixture(page, { waitForVerification: true });
  await expect(page.getByText('$7.28 par mois', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'S’abonner à Pro', exact: true }).click();
  await expect.poll(() => f.verifyRequests.length).toBe(1);
  expect(f.intentRequests).toEqual([{ workspaceId, platform: 'android', productId }]);
  await expect(page.locator('.badge', { hasText: /^Gratuit$/ })).toBeVisible();
  expect(f.verifyRequests[0]).toEqual({
    body: { workspaceId, platform: 'android', productId, purchaseToken },
    authorization: `Bearer ${f.token}`,
    cookie: undefined,
  });
  f.release();
  const offerPanel = page
    .locator('section.panel')
    .filter({ has: page.getByRole('heading', { name: 'Votre offre', exact: true }) });
  await expect(offerPanel.locator('.badge', { hasText: /^Pro$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'S’abonner à Pro', exact: true })).toHaveCount(0);
  const calls = await page.evaluate(
    () =>
      (window as unknown as { __nativePurchaseFixture: PurchaseControl }).__nativePurchaseFixture
        .calls,
  );
  expect(calls.find((call) => call.method === 'purchaseProduct')?.options).toMatchObject({
    appAccountToken: accountToken,
    autoAcknowledgePurchases: false,
    isConsumable: false,
    productIdentifier: productId,
    planIdentifier: 'monthly',
  });
  expect(
    calls.some((call) => ['finishTransaction', 'acknowledgePurchase'].includes(call.method)),
  ).toBe(false);
  const storage = await page.evaluate(
    () =>
      `${JSON.stringify(localStorage)} ${sessionStorage.getItem('__native_mock.preferences') || ''}`,
  );
  expect(storage).not.toContain(purchaseToken);
});

for (const outcome of ['cancelled', 'pending'] as const) {
  test(`a ${outcome} store result never grants Pro or submits proof`, async ({ page }) => {
    const f = await fixture(page, { outcome });
    await page.getByRole('button', { name: 'S’abonner à Pro', exact: true }).click();
    await expect(
      page
        .getByRole('status')
        .filter({ hasText: outcome === 'cancelled' ? 'Achat annulé' : 'attend la confirmation' }),
    ).toBeVisible();
    await expect(page.locator('.badge', { hasText: /^Gratuit$/ })).toBeVisible();
    expect(f.verifyRequests).toEqual([]);
    expect(f.releaseRequests).toEqual(outcome === 'cancelled' ? [{ workspaceId, intentId }] : []);
    if (outcome === 'pending')
      await expect(
        page.getByRole('button', { name: 'S’abonner à Pro', exact: true }),
      ).toBeDisabled();
  });
}

test('missing server store configuration keeps native checkout unavailable', async ({ page }) => {
  const f = await fixture(page, { ready: false });
  await expect(
    page.getByText(
      'Les achats dans la boutique ne sont pas encore disponibles. Votre accès actuel reste vérifié par Solace.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'S’abonner à Pro', exact: true })).toHaveCount(0);
  expect(f.verifyRequests).toEqual([]);
  const calls = await page.evaluate(
    () =>
      (window as unknown as { __nativePurchaseFixture: PurchaseControl }).__nativePurchaseFixture
        .calls,
  );
  expect(calls).toEqual([]);
});

test('restoration retries a saved store purchase without opening a second payment sheet', async ({
  page,
}) => {
  const f = await fixture(page, { failVerificationOnce: true });
  await page.getByRole('button', { name: 'S’abonner à Pro', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'L’achat reste à vérifier' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'S’abonner à Pro', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Restaurer mes achats', exact: true }).click();
  const offerPanel = page
    .locator('section.panel')
    .filter({ has: page.getByRole('heading', { name: 'Votre offre', exact: true }) });
  await expect(offerPanel.locator('.badge', { hasText: /^Pro$/ })).toBeVisible();
  expect(f.verifyRequests).toHaveLength(2);
  await page.getByRole('button', { name: 'Gérer mon abonnement', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as { __nativePurchaseFixture: PurchaseControl }
          ).__nativePurchaseFixture.calls.filter((call) => call.method === 'manageSubscriptions')
            .length,
      ),
    )
    .toBe(1);
  const calls = await page.evaluate(
    () =>
      (window as unknown as { __nativePurchaseFixture: PurchaseControl }).__nativePurchaseFixture
        .calls,
  );
  expect(calls.filter((call) => call.method === 'purchaseProduct')).toHaveLength(1);
  expect(calls.filter((call) => call.method === 'restorePurchases')).toHaveLength(1);
});

test('an organization owner cannot open the personal Pro paywall', async ({ page }) => {
  const f = await fixture(page, { workspaceKind: 'organization' });
  await expect(
    page.getByText(/Les achats Pro concernent uniquement votre espace personnel/),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'S’abonner à Pro', exact: true })).toHaveCount(0);
  expect(f.configurationRequests).toEqual([]);
  expect(f.verifyRequests).toEqual([]);
});

test('a legal acceptance event rechecks server eligibility and cannot bypass it', async ({
  page,
}) => {
  const f = await fixture(page, { legalGate: true });
  await expect(
    page.getByRole('button', { name: 'Vérifier les conditions du compte', exact: true }),
  ).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('solace:legal-accepted')));
  await expect.poll(() => f.configurationRequests.length).toBeGreaterThan(1);
  await expect(page.getByRole('button', { name: 'S’abonner à Pro', exact: true })).toHaveCount(0);
  f.acceptLegal();
  await page.evaluate(() => window.dispatchEvent(new Event('solace:legal-accepted')));
  await expect(page.getByText('$7.28 par mois', { exact: true })).toBeVisible();
  expect(f.verifyRequests).toEqual([]);
});

test('a concurrently reserved purchase prevents the native payment sheet from opening', async ({
  page,
}) => {
  const f = await fixture(page, { intentDenied: true });
  await page.getByRole('button', { name: 'S’abonner à Pro', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Un abonnement ou une commande reste à vérifier' }),
  ).toBeVisible();
  const calls = await page.evaluate(
    () =>
      (window as unknown as { __nativePurchaseFixture: PurchaseControl }).__nativePurchaseFixture
        .calls,
  );
  expect(calls.filter((call) => call.method === 'purchaseProduct')).toEqual([]);
  expect(f.verifyRequests).toEqual([]);
  expect(f.intentRequests).toHaveLength(1);
});

test('an expired unresolved attempt stays blocked across refresh without a second charge', async ({
  page,
}) => {
  const f = await fixture(page, { expiredIntent: true });
  await page.getByRole('button', { name: 'S’abonner à Pro', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Le délai de confirmation' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Actualiser mon accès', exact: true }).click();
  await expect(
    page.getByText(/Une tentative d’achat reste à vérifier malgré le dépassement/),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'S’abonner à Pro', exact: true })).toBeDisabled();
  const calls = await page.evaluate(
    () =>
      (window as unknown as { __nativePurchaseFixture: PurchaseControl }).__nativePurchaseFixture
        .calls,
  );
  expect(calls.filter((call) => call.method === 'purchaseProduct')).toEqual([]);
  expect(f.releaseRequests).toEqual([]);
  expect(f.intentRequests).toHaveLength(1);
});

test('a cancelled store sheet does not silently unlock a failed reservation release', async ({
  page,
}) => {
  const f = await fixture(page, { outcome: 'cancelled', releaseFails: true });
  await page.getByRole('button', { name: 'S’abonner à Pro', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Un abonnement ou une commande reste à vérifier' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'S’abonner à Pro', exact: true })).toBeDisabled();
  expect(f.releaseRequests).toEqual([{ workspaceId, intentId }]);
  expect(f.verifyRequests).toEqual([]);
});

test('pending billing blocks a new payment while leaving restoration available', async ({
  page,
}) => {
  const f = await fixture(page, { purchaseAllowed: false });
  await expect(page.getByText(/Un abonnement ou une commande reste à vérifier/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'S’abonner à Pro', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Restaurer mes achats', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Aucun achat correspondant' }),
  ).toBeVisible();
  expect(f.verifyRequests).toEqual([]);
  const calls = await page.evaluate(
    () =>
      (window as unknown as { __nativePurchaseFixture: PurchaseControl }).__nativePurchaseFixture
        .calls,
  );
  expect(calls.filter((call) => call.method === 'purchaseProduct')).toEqual([]);
  expect(calls.filter((call) => call.method === 'restorePurchases')).toHaveLength(1);
});
