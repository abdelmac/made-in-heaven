import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SignedDataVerifier, Environment } from '@apple/app-store-server-library';
vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({
  googleRequest: vi.fn(),
  tokenClaims: vi.fn(),
  purchaseConfigurationBlocked: false,
  googleEnvironment: 'sandbox' as 'sandbox' | 'production',
}));
vi.mock('@/lib/billing/native-config', () => ({
  appleConfig: () => ({
    environment: 'sandbox',
    bundleId: 'com.solace.pomodoro',
    productId: 'pro.monthly',
    appAppleId: 123,
    roots: [],
  }),
  googleConfig: () => {
    if (mocks.purchaseConfigurationBlocked) throw new Error('Purchases are disabled.');
    return {
      environment: mocks.googleEnvironment,
      packageName: 'com.solace.pomodoro',
      productId: 'pro.monthly',
      basePlanId: 'monthly',
      credentials: {
        client_email: 'fixture@fixture.iam.gserviceaccount.com',
        private_key: 'fixture',
      },
      pushAudience: 'https://solace.example/api/billing/native/webhooks/google',
      pushServiceAccount: 'push@fixture.iam.gserviceaccount.com',
    };
  },
  googlePushConfig: () => ({
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
  inspectGooglePurchaseForRecovery,
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
  mocks.googleEnvironment = 'sandbox';
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
          packageName: 'com.solace.pomodoro',
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
      expect(url).toContain('/applications/com.solace.pomodoro/');
      expect(url).not.toContain('/applications/com.solacepomodoro.myapp/');
    }
    expect(mocks.googleRequest.mock.calls[0][0]).toContain('/subscriptions/pro.monthly');
    expect(mocks.googleRequest.mock.calls[1][0]).toContain(
      '/purchases/subscriptionsv2/tokens/purchase-token',
    );
  });
  it('rejects an annual, inactive or wrong catalog product before enabling monthly sales', async () => {
    for (const patch of [
      { packageName: 'com.solace.pomodoro', state: 'INACTIVE', duration: 'P1M' },
      { packageName: 'com.solace.pomodoro', state: 'ACTIVE', duration: 'P1Y' },
      { packageName: 'com.solacepomodoro.myapp', state: 'ACTIVE', duration: 'P1M' },
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

describe('Google owner-only inactive receipt inspection', () => {
  const catalog = () => ({
    packageName: 'com.solace.pomodoro',
    productId: 'pro.monthly',
    basePlans: [
      {
        basePlanId: 'monthly',
        state: 'ACTIVE',
        autoRenewingBasePlanType: { billingPeriodDuration: 'P1M' },
      },
    ],
  });
  const expired = () => ({
    ...googlePurchase(),
    testPurchase: undefined,
    subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED',
    lineItems: [
      {
        ...googlePurchase().lineItems[0],
        expiryTime: new Date(Date.now() - 86_400_000).toISOString(),
      },
    ],
  });
  const inspect = async (raw: unknown, expectedAccount = account) => {
    mocks.googleRequest
      .mockResolvedValueOnce(Response.json(catalog()))
      .mockResolvedValueOnce(Response.json(raw));
    return inspectGooglePurchaseForRecovery('purchase-token', expectedAccount);
  };

  it.each(['ACKNOWLEDGEMENT_STATE_PENDING', 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED'])(
    'authoritatively inspects an expired production receipt and preserves actual %s',
    async (acknowledgementState) => {
      const purchase = { ...expired(), acknowledgementState };
      const result = await inspect(purchase);
      expect(result).toMatchObject({
        inactive: true,
        state: {
          provider: 'google',
          environment: 'production',
          status: 'expired',
          currentPeriodEnd: purchase.lineItems[0].expiryTime,
          acknowledged: acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
        },
      });
      expect(mocks.googleRequest).toHaveBeenCalledTimes(2);
      expect(mocks.googleRequest.mock.calls[0][0]).toBe(
        'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.solace.pomodoro/subscriptions/pro.monthly',
      );
      expect(mocks.googleRequest.mock.calls[1][0]).toBe(
        'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.solace.pomodoro/purchases/subscriptionsv2/tokens/purchase-token',
      );
      for (const [, options] of mocks.googleRequest.mock.calls) {
        expect(options.headers.Authorization).toBe('Bearer fixture-access');
        expect(options.method).toBe('GET');
        expect(options.cache).toBe('no-store');
      }
    },
  );
  it('requires strict expiry evidence for same-environment terminal recovery too', async () => {
    expect(await inspect({ ...expired(), testPurchase: {} })).toMatchObject({
      inactive: true,
      state: { environment: 'sandbox', status: 'expired', acknowledged: false },
    });
  });
  it('requires the raw expiry to be strictly before the server clock', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    try {
      await expect(
        inspect({
          ...expired(),
          lineItems: [{ ...expired().lineItems[0], expiryTime: new Date(now).toISOString() }],
        }),
      ).rejects.toMatchObject({ status: 400 });
    } finally {
      clock.mockRestore();
    }
  });
  it.each([
    'SUBSCRIPTION_STATE_ACTIVE',
    'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
    'SUBSCRIPTION_STATE_CANCELED',
    'SUBSCRIPTION_STATE_PENDING',
    'SUBSCRIPTION_STATE_ON_HOLD',
    'SUBSCRIPTION_STATE_PAUSED',
    'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED',
    'SUBSCRIPTION_STATE_UNSPECIFIED',
    'unknown',
  ])('keeps a cross-environment %s receipt blocked', async (subscriptionState) => {
    await expect(inspect({ ...expired(), subscriptionState })).rejects.toMatchObject({
      status: 400,
    });
  });
  it.each([
    undefined,
    'not-a-date',
    '2020-01-01',
    '2026-02-31T00:00:00Z',
    () => new Date(Date.now() + 86_400_000).toISOString(),
  ])('rejects missing, malformed or future raw expiry: %s', async (expiry) => {
    const expiryTime = typeof expiry === 'function' ? expiry() : expiry;
    for (const testPurchase of [undefined, {}])
      await expect(
        inspect({
          ...expired(),
          testPurchase,
          lineItems: [{ ...expired().lineItems[0], expiryTime }],
        }),
      ).rejects.toMatchObject({ status: 400 });
  });
  it.each(['replacement-token', '', null])(
    'does not resolve a receipt with any linked purchase field (%s)',
    async (linkedPurchaseToken) => {
      for (const testPurchase of [undefined, {}])
        await expect(
          inspect({ ...expired(), testPurchase, linkedPurchaseToken }),
        ).rejects.toMatchObject({
          status: 400,
        });
    },
  );
  it('requires exact account UUID, single product, plan, auto-renewing type and absence of offers', async () => {
    const line = expired().lineItems[0];
    for (const patch of [
      { externalAccountIdentifiers: undefined },
      { externalAccountIdentifiers: { obfuscatedExternalAccountId: 'not-a-uuid' } },
      {
        externalAccountIdentifiers: {
          obfuscatedExternalAccountId: '22222222-2222-4222-8222-222222222222',
        },
      },
      { lineItems: [] },
      { lineItems: [line, line] },
      { lineItems: [{ ...line, productId: 'other' }] },
      { lineItems: [{ ...line, offerDetails: { basePlanId: 'annual' } }] },
      { lineItems: [{ ...line, autoRenewingPlan: undefined }] },
      { lineItems: [{ ...line, offerDetails: { basePlanId: 'monthly', offerId: 'trial' } }] },
      { lineItems: [{ ...line, offerDetails: { basePlanId: 'monthly', offerId: '' } }] },
      { acknowledgementState: 'unknown' },
    ])
      await expect(inspect({ ...expired(), ...patch })).rejects.toThrow();
  });
  it('never permits the reverse sandbox-to-production environment exception', async () => {
    mocks.googleEnvironment = 'production';
    await expect(inspect({ ...expired(), testPurchase: {} })).rejects.toMatchObject({
      status: 400,
    });
  });
  it('keeps the RTDN verifier strict even for an expired production receipt', async () => {
    mocks.googleRequest
      .mockResolvedValueOnce(Response.json(catalog()))
      .mockResolvedValueOnce(Response.json(expired()));
    await expect(verifyGoogleSubscription('purchase-token', account)).rejects.toMatchObject({
      status: 400,
    });
  });
  it('preserves the normal same-environment active verification path', async () => {
    expect(await inspect(googlePurchase())).toMatchObject({
      inactive: false,
      state: { environment: 'sandbox', status: 'active', acknowledged: false },
    });
    expect(mocks.googleRequest).toHaveBeenCalledTimes(2);
  });
  it('does not treat pending-purchase cancellation as an inactive resolution', async () => {
    expect(
      await inspect({
        ...googlePurchase(),
        subscriptionState: 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED',
      }),
    ).toMatchObject({ inactive: false });
  });
  it.each([401, 403, 404, 410, 503])(
    'fails closed when the authoritative token request fails with %s',
    async (status) => {
      mocks.googleRequest
        .mockResolvedValueOnce(Response.json(catalog()))
        .mockResolvedValueOnce(new Response(null, { status }));
      await expect(
        inspectGooglePurchaseForRecovery('purchase-token', account),
      ).rejects.toMatchObject({
        status: 503,
      });
    },
  );
  it('fails closed on a network error or invalid catalog before resolving a token', async () => {
    mocks.googleRequest.mockRejectedValueOnce(new Error('provider unavailable'));
    await expect(inspectGooglePurchaseForRecovery('purchase-token', account)).rejects.toMatchObject(
      {
        status: 503,
      },
    );
    mocks.googleRequest.mockResolvedValueOnce(
      Response.json({ ...catalog(), packageName: 'other' }),
    );
    await expect(inspectGooglePurchaseForRecovery('purchase-token', account)).rejects.toMatchObject(
      {
        status: 503,
      },
    );
  });
});

describe('Google RTDN identity', () => {
  afterEach(() => {
    mocks.purchaseConfigurationBlocked = false;
  });
  it('authenticates signed push delivery without invoking disabled purchase configuration', async () => {
    mocks.purchaseConfigurationBlocked = true;
    mocks.tokenClaims.mockResolvedValue({
      getPayload: () => ({
        email: 'push@fixture.iam.gserviceaccount.com',
        email_verified: true,
        iss: 'https://accounts.google.com',
      }),
    });
    await expect(authenticateGooglePush(request())).resolves.toBeUndefined();
    expect(mocks.googleRequest).not.toHaveBeenCalled();
  });
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
