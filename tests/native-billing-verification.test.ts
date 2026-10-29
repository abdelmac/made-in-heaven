import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SignedDataVerifier, Environment } from '@apple/app-store-server-library';
vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ googleRequest: vi.fn(), tokenClaims: vi.fn() }));
vi.mock('@/lib/billing/native-config', () => ({
  appleConfig: () => ({
    environment: 'sandbox',
    bundleId: 'com.solace.pomodoro',
    productId: 'pro.monthly',
    appAppleId: 123,
    roots: [],
  }),
  googleConfig: () => ({
    environment: 'sandbox',
    packageName: 'com.solacepomodoro.myapp',
    productId: 'pro.monthly',
    basePlanId: 'monthly',
    credentials: {
      client_email: 'fixture@fixture.iam.gserviceaccount.com',
      private_key: 'fixture',
    },
    pushAudience: 'https://solace.example/api/billing/native/webhooks/google',
    pushServiceAccount: 'push@fixture.iam.gserviceaccount.com',
  }),
}));
vi.mock('google-auth-library', () => ({
  GoogleAuth: class {
    async getClient() {
      return { getAccessToken: async () => ({ token: 'fixture-access' }) };
    }
  },
  OAuth2Client: class {
    async verifyIdToken(input: unknown) {
      return mocks.tokenClaims(input);
    }
  },
}));
import { appleSubscriptionState, validateAppleTransaction } from '@/lib/billing/native-apple';
import {
  authenticateGooglePush,
  googleSubscriptionState,
  verifyGoogleProductConfiguration,
  verifyGoogleSubscription,
} from '@/lib/billing/native-google';

const account = '11111111-1111-4111-8111-111111111111';
const now = Date.parse('2026-10-28T12:00:00Z');
const future = now + 86_400_000;
const appleConfig = {
  environment: 'sandbox' as const,
  bundleId: 'com.solace.pomodoro',
  productId: 'pro.monthly',
};
const transaction = () => ({
  originalTransactionId: '1000001',
  transactionId: '1000002',
  bundleId: appleConfig.bundleId,
  productId: appleConfig.productId,
  type: 'Auto-Renewable Subscription',
  inAppOwnershipType: 'PURCHASED',
  appAccountToken: account,
  environment: Environment.SANDBOX,
  expiresDate: future,
  signedDate: now,
});
const renewal = () => ({
  originalTransactionId: '1000001',
  productId: 'pro.monthly',
  environment: Environment.SANDBOX,
  autoRenewStatus: 1,
});
const googleConfig = {
  environment: 'sandbox' as const,
  productId: 'pro.monthly',
  basePlanId: 'monthly',
};
const googlePurchase = () => ({
  testPurchase: {},
  subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
  acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
  externalAccountIdentifiers: { obfuscatedExternalAccountId: account },
  lineItems: [
    {
      productId: 'pro.monthly',
      expiryTime: new Date(future).toISOString(),
      latestSuccessfulOrderId: 'GPA.fixture',
      offerDetails: { basePlanId: 'monthly' },
      autoRenewingPlan: { autoRenewEnabled: true },
    },
  ],
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', mocks.googleRequest);
});
afterEach(() => vi.unstubAllGlobals());

describe('Apple server trust and entitlement normalization', () => {
  it('official verifier rejects forged JWS without a trusted Apple chain', async () => {
    const verifier = new SignedDataVerifier([], true, Environment.SANDBOX, appleConfig.bundleId);
    const forged = `${Buffer.from('{"alg":"ES256","x5c":[]}').toString('base64url')}.${Buffer.from(JSON.stringify(transaction())).toString('base64url')}.ZmFrZQ`;
    await expect(verifier.verifyAndDecodeTransaction(forged)).rejects.toThrow();
  });
  it.each([
    { bundleId: 'com.other.app' },
    { bundleId: 'com.solacepomodoro.myapp' },
    { productId: 'pro.yearly' },
    { environment: Environment.PRODUCTION },
    { type: 'Consumable' },
    { inAppOwnershipType: 'FAMILY_SHARED' },
    { appAccountToken: undefined },
    { appAccountToken: 'an-email@example.test' },
    { expiresDate: undefined },
    { signedDate: undefined },
  ])('rejects wrong or missing store identity: %j', (patch) => {
    expect(() => validateAppleTransaction({ ...transaction(), ...patch }, appleConfig)).toThrow();
  });
  it('recognizes paid active and canceled periods without an invented grace window', () => {
    expect(appleSubscriptionState(transaction(), renewal(), 1, appleConfig, now).status).toBe(
      'active',
    );
    expect(
      appleSubscriptionState(
        transaction(),
        { ...renewal(), autoRenewStatus: 0 },
        1,
        appleConfig,
        now,
      ).status,
    ).toBe('canceled');
    const retry = appleSubscriptionState(transaction(), renewal(), 3, appleConfig, now);
    expect(retry.status).toBe('expired');
    expect(Date.parse(retry.currentPeriodEnd)).toBe(now);
  });
  it('uses only signed provider grace and revokes refunded/upgraded transactions', () => {
    const grace = appleSubscriptionState(
      { ...transaction(), expiresDate: now - 1 },
      { ...renewal(), gracePeriodExpiresDate: future },
      4,
      appleConfig,
      now,
    );
    expect(grace.status).toBe('grace');
    expect(Date.parse(grace.currentPeriodEnd)).toBe(future);
    for (const patch of [{ revocationDate: now - 1 }, { isUpgraded: true }]) {
      const revoked = appleSubscriptionState(
        { ...transaction(), ...patch },
        renewal(),
        1,
        appleConfig,
        now,
      );
      expect(revoked.status).toBe('revoked');
      expect(Date.parse(revoked.currentPeriodEnd)).toBeLessThanOrEqual(now);
    }
  });
  it('rejects mismatched renewal ownership, product or environment', () => {
    for (const patch of [
      { originalTransactionId: 'another' },
      { productId: 'another' },
      { environment: Environment.PRODUCTION },
    ])
      expect(() =>
        appleSubscriptionState(transaction(), { ...renewal(), ...patch }, 1, appleConfig, now),
      ).toThrow();
  });
});

describe('Google authoritative subscription state', () => {
  it('requires exact account, environment, product and base plan', () => {
    expect(
      googleSubscriptionState(googlePurchase(), 'purchase-token', googleConfig, account, now)
        .acknowledged,
    ).toBe(false);
    for (const purchase of [
      { ...googlePurchase(), externalAccountIdentifiers: {} },
      { ...googlePurchase(), testPurchase: undefined },
      {
        ...googlePurchase(),
        lineItems: [{ ...googlePurchase().lineItems[0], productId: 'other' }],
      },
      {
        ...googlePurchase(),
        lineItems: [{ ...googlePurchase().lineItems[0], offerDetails: { basePlanId: 'annual' } }],
      },
      {
        ...googlePurchase(),
        lineItems: [
          {
            ...googlePurchase().lineItems[0],
            offerDetails: { basePlanId: 'monthly', offerId: 'unapproved-trial' },
          },
        ],
      },
      {
        ...googlePurchase(),
        lineItems: [googlePurchase().lineItems[0], googlePurchase().lineItems[0]],
      },
    ])
      expect(() =>
        googleSubscriptionState(purchase, 'purchase-token', googleConfig, account, now),
      ).toThrow();
    expect(() =>
      googleSubscriptionState(
        googlePurchase(),
        'purchase-token',
        googleConfig,
        '22222222-2222-4222-8222-222222222222',
        now,
      ),
    ).toThrow();
    expect(() =>
      googleSubscriptionState(
        googlePurchase(),
        'purchase-token',
        { ...googleConfig, environment: 'production' },
        account,
        now,
      ),
    ).toThrow();
  });
  it.each([
    ['SUBSCRIPTION_STATE_PENDING', 'pending'],
    ['SUBSCRIPTION_STATE_ON_HOLD', 'on_hold'],
    ['SUBSCRIPTION_STATE_PAUSED', 'paused'],
    ['SUBSCRIPTION_STATE_EXPIRED', 'expired'],
    ['SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED', 'expired'],
  ])('removes access for %s even when expiry is in future', (providerState, expected) => {
    const result = googleSubscriptionState(
      { ...googlePurchase(), subscriptionState: providerState },
      'purchase-token',
      googleConfig,
      account,
      now,
    );
    expect(result.status).toBe(expected);
    expect(Date.parse(result.currentPeriodEnd)).toBe(now);
  });
  it.each([
    ['SUBSCRIPTION_STATE_CANCELED', 'canceled'],
    ['SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'grace'],
  ])('keeps only provider coverage for %s', (providerState, expected) => {
    const result = googleSubscriptionState(
      { ...googlePurchase(), subscriptionState: providerState },
      'purchase-token',
      googleConfig,
      account,
      now,
    );
    expect(result.status).toBe(expected);
    expect(Date.parse(result.currentPeriodEnd)).toBe(future);
  });
  it('uses the monthly product catalog before subscriptionsv2 and never trusts the input as status', async () => {
    mocks.googleRequest
      .mockResolvedValueOnce(
        Response.json({
          packageName: 'com.solacepomodoro.myapp',
          productId: 'pro.monthly',
          basePlans: [
            {
              basePlanId: 'monthly',
              state: 'ACTIVE',
              autoRenewingBasePlanType: { billingPeriodDuration: 'P1M' },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(Response.json(googlePurchase()));
    await verifyGoogleSubscription('purchase-token', account);
    for (const [url] of mocks.googleRequest.mock.calls) {
      expect(url).toContain('/applications/com.solacepomodoro.myapp/');
      expect(url).not.toContain('/applications/com.solace.pomodoro/');
    }
    expect(mocks.googleRequest.mock.calls[0][0]).toContain('/subscriptions/pro.monthly');
    expect(mocks.googleRequest.mock.calls[1][0]).toContain(
      '/purchases/subscriptionsv2/tokens/purchase-token',
    );
  });
  it('rejects an annual, inactive or wrong catalog product before enabling monthly sales', async () => {
    for (const patch of [
      { packageName: 'com.solacepomodoro.myapp', state: 'INACTIVE', duration: 'P1M' },
      { packageName: 'com.solacepomodoro.myapp', state: 'ACTIVE', duration: 'P1Y' },
      { packageName: 'com.solace.pomodoro', state: 'ACTIVE', duration: 'P1M' },
    ]) {
      mocks.googleRequest.mockResolvedValueOnce(
        Response.json({
          packageName: patch.packageName,
          productId: 'pro.monthly',
          basePlans: [
            {
              basePlanId: 'monthly',
              state: patch.state,
              autoRenewingBasePlanType: { billingPeriodDuration: patch.duration },
            },
          ],
        }),
      );
      await expect(verifyGoogleProductConfiguration()).rejects.toThrow();
    }
  });
});

describe('Google RTDN identity', () => {
  const request = () =>
    new Request('https://solace.example/api/billing/native/webhooks/google', {
      headers: { authorization: 'Bearer oidc-fixture' },
    });
  it('verifies Google audience, exact sender email, issuer and verified email', async () => {
    mocks.tokenClaims.mockResolvedValue({
      getPayload: () => ({
        email: 'push@fixture.iam.gserviceaccount.com',
        email_verified: true,
        iss: 'https://accounts.google.com',
      }),
    });
    await authenticateGooglePush(request());
    expect(mocks.tokenClaims).toHaveBeenCalledWith({
      idToken: 'oidc-fixture',
      audience: 'https://solace.example/api/billing/native/webhooks/google',
    });
    for (const patch of [
      { email: 'another@fixture.iam.gserviceaccount.com' },
      { email_verified: false },
      { iss: 'https://evil.example' },
    ]) {
      mocks.tokenClaims.mockResolvedValue({
        getPayload: () => ({
          email: 'push@fixture.iam.gserviceaccount.com',
          email_verified: true,
          iss: 'https://accounts.google.com',
          ...patch,
        }),
      });
      await expect(authenticateGooglePush(request())).rejects.toMatchObject({ status: 401 });
    }
  });
  it('rejects unsigned and invalid JWT pushes', async () => {
    await expect(
      authenticateGooglePush(new Request('https://solace.example')),
    ).rejects.toMatchObject({ status: 401 });
    mocks.tokenClaims.mockRejectedValue(new Error('bad signature'));
    await expect(authenticateGooglePush(request())).rejects.toMatchObject({ status: 401 });
  });
});
