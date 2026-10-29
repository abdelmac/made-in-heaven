import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpError } from '@/lib/server/http';
vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({
  owner: vi.fn(),
  rate: vi.fn(),
  config: vi.fn(),
  legal: vi.fn(),
  availability: vi.fn(),
  prepare: vi.fn(),
  refresh: vi.fn(),
  verify: vi.fn(),
  entitlements: vi.fn(),
  catalog: vi.fn(),
  pendingIntent: vi.fn(),
  reserve: vi.fn(),
  release: vi.fn(),
  authenticate: vi.fn(),
  reconcile: vi.fn(),
  appleNotification: vi.fn(),
  appleTransaction: vi.fn(),
  reconcileBatch: vi.fn(),
}));
vi.mock('@/lib/server/auth', () => ({
  requireWorkspace: mocks.owner,
  durableRateLimit: mocks.rate,
}));
vi.mock('@/lib/billing/server', () => ({ getWorkspaceEntitlements: mocks.entitlements }));
vi.mock('@/lib/billing/native-config', () => ({
  nativePublicConfiguration: mocks.config,
  googleConfig: () => ({ packageName: 'com.solacepomodoro.myapp' }),
  nativePurchaseLaunchReady: () => true,
}));
vi.mock('@/lib/billing/native-server', () => ({
  nativeLegalEligible: mocks.legal,
  nativePurchaseAvailable: mocks.availability,
  pendingNativePurchaseIntent: mocks.pendingIntent,
  reserveNativePurchase: mocks.reserve,
  releaseNativePurchase: mocks.release,
  prepareNativeBilling: mocks.prepare,
  refreshNativeWorkspace: mocks.refresh,
  verifyNativePurchase: mocks.verify,
  reconcileNativeNotification: mocks.reconcile,
  reconcileNativeSubscriptions: mocks.reconcileBatch,
}));
vi.mock('@/lib/billing/native-google', () => ({
  verifyGoogleProductConfiguration: mocks.catalog,
  authenticateGooglePush: mocks.authenticate,
}));
vi.mock('@/lib/billing/native-apple', () => ({
  appleServices: () => ({
    verifier: {
      verifyAndDecodeNotification: mocks.appleNotification,
      verifyAndDecodeTransaction: mocks.appleTransaction,
    },
    config: {},
  }),
  validateAppleTransaction: (value: unknown) => value,
}));
import { GET as configGET, OPTIONS } from '@/app/api/billing/native/route';
import { POST as verifyPOST } from '@/app/api/billing/native/verify/route';
import { POST as applePOST } from '@/app/api/billing/native/webhooks/apple/route';
import { POST as googlePOST } from '@/app/api/billing/native/webhooks/google/route';
import { GET as reconcileGET } from '@/app/api/billing/native/reconcile/route';
import { POST as reservePOST } from '@/app/api/billing/native/intent/route';
import { POST as releasePOST } from '@/app/api/billing/native/intent/release/route';

const wid = '11111111-1111-4111-8111-111111111111';
const account = '22222222-2222-4222-8222-222222222222';
const origin = 'capacitor://localhost';
const request = (body: unknown, source = origin) =>
  new Request('https://solace.example/api/billing/native/verify', {
    method: 'POST',
    headers: {
      origin: source,
      authorization: 'Bearer fixture-token',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
const googleRequest = (body: unknown) =>
  request({
    message: {
      data: Buffer.from(JSON.stringify(body)).toString('base64'),
      messageId: 'event-fixture',
    },
  });
const notification = () => ({
  version: '1.0',
  packageName: 'com.solacepomodoro.myapp',
  subscriptionNotification: { purchaseToken: 'private-token-fixture', notificationType: 2 },
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://solace.example');
  mocks.owner.mockResolvedValue({
    user: { id: 'owner' },
    workspace: { id: wid, kind: 'personal' },
    role: 'owner',
  });
  mocks.rate.mockResolvedValue(undefined);
  mocks.legal.mockResolvedValue(true);
  mocks.availability.mockResolvedValue(true);
  mocks.pendingIntent.mockResolvedValue(null);
  mocks.reserve.mockResolvedValue({
    intentId: account,
    expiresAt: new Date(Date.now() + 900_000).toISOString(),
  });
  mocks.release.mockResolvedValue({ released: true });
  mocks.config.mockImplementation((platform) => ({
    ready: true,
    platform,
    productId: 'pro.monthly',
    basePlanId: platform === 'android' ? 'monthly' : null,
    environment: 'sandbox',
  }));
  mocks.prepare.mockResolvedValue(account);
  mocks.refresh.mockResolvedValue(undefined);
  mocks.entitlements.mockResolvedValue({ tier: 'free' });
  mocks.catalog.mockResolvedValue('P1M');
  mocks.verify.mockResolvedValue({
    verified: true,
    acknowledged: true,
    entitlements: { tier: 'pro' },
    subscription: { provider: 'google', status: 'active' },
  });
  mocks.authenticate.mockResolvedValue(undefined);
  mocks.reconcile.mockResolvedValue(undefined);
  mocks.appleNotification.mockResolvedValue({
    version: '2.0',
    notificationUUID: 'event-fixture',
    notificationType: 'DID_RENEW',
    data: { signedTransactionInfo: 'store-signed-transaction' },
  });
  mocks.appleTransaction.mockResolvedValue({
    originalTransactionId: '1001',
    appAccountToken: account,
  });
  mocks.reconcileBatch.mockResolvedValue({ completed: 1, failed: 0, batchLimit: 100 });
});
afterEach(() => vi.unstubAllEnvs());

describe('native purchase API authorization and client contract', () => {
  it('reserves a server-owned intent before launching SDK checkout and releases only an owner intent', async () => {
    const body = { workspaceId: wid, platform: 'android', productId: 'pro.monthly' };
    expect((await reservePOST(request(body))).status).toBe(200);
    expect(mocks.reserve).toHaveBeenCalledWith('owner', wid, 'android', 'pro.monthly');
    const response = await releasePOST(request({ workspaceId: wid, intentId: account }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ released: true });
    expect(mocks.release).toHaveBeenCalledWith('owner', wid, account);
  });
  it('does not reserve an unconfigured product and propagates a fenced competing purchase conflict', async () => {
    expect(
      (await reservePOST(request({ workspaceId: wid, platform: 'android', productId: 'wrong' })))
        .status,
    ).toBe(400);
    expect(mocks.reserve).not.toHaveBeenCalled();
    mocks.reserve.mockRejectedValue(new HttpError(409, 'pending purchase'));
    expect(
      (
        await reservePOST(
          request({ workspaceId: wid, platform: 'android', productId: 'pro.monthly' }),
        )
      ).status,
    ).toBe(409);
  });
  it('provides an opaque account token and authoritative monthly period through native CORS', async () => {
    const response = await configGET(
      new Request(`https://solace.example/api/billing/native?workspaceId=${wid}&platform=android`, {
        headers: { origin, authorization: 'Bearer fixture-token' },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ready: true,
      appAccountToken: account,
      billingPeriod: 'P1M',
      refreshPending: false,
      entitlements: { tier: 'free' },
    });
    expect(response.headers.get('access-control-allow-origin')).toBe(origin);
    expect(response.headers.has('access-control-allow-credentials')).toBe(false);
    expect(mocks.owner).toHaveBeenCalledWith(wid, { roles: ['owner'] });
  });
  it('returns a usable legal-consent reason without preparing a store mapping', async () => {
    mocks.legal.mockResolvedValue(false);
    const response = await configGET(
      new Request(`https://solace.example/api/billing/native?workspaceId=${wid}&platform=ios`),
    );
    expect(await response.json()).toMatchObject({
      ready: false,
      reason: 'legal_acceptance_required',
      appAccountToken: null,
      billingPeriod: null,
      entitlements: { tier: 'free' },
    });
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it('retains entitlements but marks a refresh failure so client cannot buy again', async () => {
    mocks.refresh.mockRejectedValue(new Error('store unavailable'));
    const response = await configGET(
      new Request(`https://solace.example/api/billing/native?workspaceId=${wid}&platform=android`),
    );
    expect(await response.json()).toMatchObject({
      refreshPending: true,
      purchaseAllowed: false,
      entitlements: { tier: 'free' },
    });
  });
  it('fails closed when monthly catalog validation fails', async () => {
    mocks.catalog.mockRejectedValue(new HttpError(503, 'not monthly'));
    const response = await configGET(
      new Request(`https://solace.example/api/billing/native?workspaceId=${wid}&platform=android`),
    );
    expect(response.status).toBe(503);
    expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it('accepts the strict signed-in verification request and returns persisted entitlement', async () => {
    const body = {
      workspaceId: wid,
      platform: 'android',
      productId: 'pro.monthly',
      purchaseToken: 'private-token-fixture',
    };
    const response = await verifyPOST(request(body));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ verified: true, entitlements: { tier: 'pro' } });
    expect(mocks.verify).toHaveBeenCalledWith('owner', wid, body);
  });
  it.each([
    { paid: true },
    { isActive: true },
    { appAccountToken: account },
    { environment: 'production' },
    { amount: 1 },
  ])('rejects client authorization fields: %j', async (extra) => {
    const response = await verifyPOST(
      request({
        workspaceId: wid,
        platform: 'android',
        productId: 'pro.monthly',
        purchaseToken: 'private-token-fixture',
        ...extra,
      }),
    );
    expect(response.status).toBe(400);
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it('rejects a foreign origin before authentication and a different product before provider calls', async () => {
    const body = {
      workspaceId: wid,
      platform: 'android',
      productId: 'pro.monthly',
      purchaseToken: 'private-token-fixture',
    };
    expect((await verifyPOST(request(body, 'https://evil.example'))).status).toBe(403);
    expect(mocks.owner).not.toHaveBeenCalled();
    expect((await verifyPOST(request({ ...body, productId: 'other' }))).status).toBe(400);
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it('requires personal ownership and legal consent before contacting either store', async () => {
    const body = {
      workspaceId: wid,
      platform: 'android',
      productId: 'pro.monthly',
      purchaseToken: 'private-token-fixture',
    };
    mocks.owner.mockRejectedValueOnce(new HttpError(403, 'not owner'));
    expect((await verifyPOST(request(body))).status).toBe(403);
    mocks.legal.mockResolvedValue(false);
    expect((await verifyPOST(request(body))).status).toBe(428);
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it('supports authenticated WebView preflight without browser cookie credentials', () => {
    const response = OPTIONS(
      new Request('https://solace.example/api/billing/native', {
        method: 'OPTIONS',
        headers: {
          origin,
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'authorization,content-type',
        },
      }),
    );
    expect(response.status).toBe(204);
    expect(response.headers.has('access-control-allow-credentials')).toBe(false);
  });
});

describe('store notification entry points', () => {
  it('requires a valid Apple V2 signature and a separately verified transaction', async () => {
    mocks.appleNotification.mockRejectedValueOnce(new Error('invalid chain'));
    expect(
      (await applePOST(request({ signedPayload: 'forged-signed-notification-payload' }))).status,
    ).toBe(400);
    expect(mocks.reconcile).not.toHaveBeenCalled();
    const response = await applePOST(
      request({ signedPayload: 'valid-signed-notification-payload' }),
    );
    expect(response.status).toBe(200);
    expect(mocks.appleTransaction).toHaveBeenCalledWith('store-signed-transaction');
    expect(mocks.reconcile).toHaveBeenCalledWith('apple', '1001', account);
  });
  it('preserves signed Apple refund and refund-reversal evidence by exact transaction', async () => {
    mocks.appleNotification.mockResolvedValueOnce({
      version: '2.0',
      notificationUUID: 'refund-event',
      notificationType: 'REFUND',
      data: { signedTransactionInfo: 'signed-refund' },
    });
    mocks.appleTransaction.mockResolvedValueOnce({
      originalTransactionId: '1001',
      transactionId: '1002',
      appAccountToken: account,
      revocationDate: Date.now(),
    });
    expect(
      (await applePOST(request({ signedPayload: 'signed-refund-notification-payload' }))).status,
    ).toBe(200);
    expect(mocks.reconcile).toHaveBeenLastCalledWith('apple', '1001', account, '1002');
    mocks.appleNotification.mockResolvedValueOnce({
      version: '2.0',
      notificationUUID: 'reverse-event',
      notificationType: 'REFUND_REVERSED',
      data: { signedTransactionInfo: 'signed-reversal' },
    });
    mocks.appleTransaction.mockResolvedValueOnce({
      originalTransactionId: '1001',
      transactionId: '1002',
      appAccountToken: account,
    });
    expect(
      (await applePOST(request({ signedPayload: 'signed-reversed-notification-payload' }))).status,
    ).toBe(200);
    expect(mocks.reconcile).toHaveBeenLastCalledWith('apple', '1001', account, undefined, '1002');
  });
  it('verifies Google OIDC before parsing a notification or accessing billing', async () => {
    mocks.authenticate.mockRejectedValue(new HttpError(401, 'invalid Google identity'));
    expect((await googlePOST(googleRequest(notification()))).status).toBe(401);
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });
  it('re-queries Google for lifecycle events and passes exact full-refund order identity', async () => {
    expect((await googlePOST(googleRequest(notification()))).status).toBe(200);
    expect(mocks.reconcile).toHaveBeenLastCalledWith(
      'google',
      'private-token-fixture',
      undefined,
      undefined,
    );
    const voided = {
      version: '1.0',
      packageName: 'com.solacepomodoro.myapp',
      voidedPurchaseNotification: {
        purchaseToken: 'private-token-fixture',
        productType: 1,
        refundType: 1,
        orderId: 'GPA.refunded-order',
      },
    };
    expect((await googlePOST(googleRequest(voided))).status).toBe(200);
    expect(mocks.reconcile).toHaveBeenLastCalledWith(
      'google',
      'private-token-fixture',
      undefined,
      'GPA.refunded-order',
    );
  });
  it('rejects another package, unsupported version, mixed events and incomplete refund', async () => {
    for (const body of [
      { ...notification(), packageName: 'com.solace.pomodoro' },
      { ...notification(), packageName: 'another.app' },
      { ...notification(), version: 'unsupported' },
      { ...notification(), testNotification: { version: '1.0' } },
      {
        version: '1.0',
        packageName: 'com.solacepomodoro.myapp',
        voidedPurchaseNotification: {
          purchaseToken: 'private-token-fixture',
          productType: 1,
          refundType: 1,
        },
      },
    ])
      expect((await googlePOST(googleRequest(body))).status).toBe(400);
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });
  it('returns a retryable error when durable reconciliation fails', async () => {
    mocks.reconcile.mockRejectedValue(new HttpError(503, 'store unavailable'));
    expect((await googlePOST(googleRequest(notification()))).status).toBe(503);
  });
});

describe('missed-notification scheduler', () => {
  it('requires a configured strong scheduler secret and exact authorization', async () => {
    vi.stubEnv('CRON_SECRET', undefined);
    expect((await reconcileGET(new Request('https://solace.example'))).status).toBe(503);
    vi.stubEnv('CRON_SECRET', 'fixture-secret-long-enough-for-scheduler');
    expect((await reconcileGET(new Request('https://solace.example'))).status).toBe(401);
    expect(mocks.reconcileBatch).not.toHaveBeenCalled();
    const response = await reconcileGET(
      new Request('https://solace.example', {
        headers: { authorization: 'Bearer fixture-secret-long-enough-for-scheduler' },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ completed: 1, failed: 0 });
  });
});
