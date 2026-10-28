import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({
  verifier: vi.fn(),
  client: vi.fn(),
  transaction: vi.fn(),
  renewal: vi.fn(),
  notification: vi.fn(),
  statuses: vi.fn(),
}));
vi.mock('@apple/app-store-server-library', () => ({
  Environment: { SANDBOX: 'Sandbox', PRODUCTION: 'Production' },
  SignedDataVerifier: class {
    constructor(...args: unknown[]) {
      mocks.verifier(...args);
    }
    verifyAndDecodeTransaction = mocks.transaction;
    verifyAndDecodeRenewalInfo = mocks.renewal;
    verifyAndDecodeNotification = mocks.notification;
  },
  AppStoreServerAPIClient: class {
    constructor(...args: unknown[]) {
      mocks.client(...args);
    }
    getAllSubscriptionStatuses = mocks.statuses;
  },
}));
vi.mock('@/lib/billing/native-config', () => ({
  appleConfig: () => ({
    environment: 'sandbox',
    appAppleId: 123,
    bundleId: 'com.solace.pomodoro',
    productId: 'pro.monthly',
    issuerId: 'issuer',
    keyId: 'key',
    privateKey: 'key-material-fixture',
    roots: [Buffer.from('pinned-root-fixture')],
  }),
}));
import { decodeApplePurchase, verifyAppleSubscription } from '@/lib/billing/native-apple';
const account = '11111111-1111-4111-8111-111111111111';
const now = Date.now();
const transaction = () => ({
  environment: 'Sandbox',
  bundleId: 'com.solace.pomodoro',
  productId: 'pro.monthly',
  originalTransactionId: '1001',
  transactionId: '1002',
  appAccountToken: account,
  type: 'Auto-Renewable Subscription',
  inAppOwnershipType: 'PURCHASED',
  signedDate: now,
  expiresDate: now + 86_400_000,
});
const response = () => ({
  environment: 'Sandbox',
  appAppleId: 123,
  bundleId: 'com.solace.pomodoro',
  data: [
    {
      lastTransactions: [
        {
          originalTransactionId: '1001',
          status: 1,
          signedTransactionInfo: 'current-server-jws',
          signedRenewalInfo: 'current-server-renewal-jws',
        },
      ],
    },
  ],
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.statuses.mockResolvedValue(response());
  mocks.transaction.mockResolvedValue(transaction());
  mocks.renewal.mockResolvedValue({
    environment: 'Sandbox',
    originalTransactionId: '1001',
    productId: 'pro.monthly',
    autoRenewStatus: 1,
  });
});
describe('Apple current subscription verification', () => {
  it('queries current status and verifies server JWS and renewal under online pinned-root validation', async () => {
    const state = await verifyAppleSubscription('1001', account);
    expect(state.status).toBe('active');
    expect(mocks.statuses).toHaveBeenCalledWith('1001');
    expect(mocks.verifier).toHaveBeenCalledWith(
      [Buffer.from('pinned-root-fixture')],
      true,
      'Sandbox',
      'com.solace.pomodoro',
      123,
    );
    expect(mocks.transaction).toHaveBeenCalledWith('current-server-jws');
    expect(mocks.renewal).toHaveBeenCalledWith('current-server-renewal-jws');
  });
  it('does not treat a client JWS as sufficient current purchase proof', async () => {
    await decodeApplePurchase('old-client-jws');
    expect(mocks.statuses).not.toHaveBeenCalled();
    mocks.statuses.mockRejectedValueOnce(new Error('Apple unavailable'));
    await expect(verifyAppleSubscription('1001', account)).rejects.toMatchObject({ status: 503 });
  });
  it.each([{ environment: 'Production' }, { bundleId: 'other.app' }, { appAppleId: 999 }])(
    'rejects another store app or environment: %j',
    async (patch) => {
      mocks.statuses.mockResolvedValueOnce({ ...response(), ...patch });
      await expect(verifyAppleSubscription('1001', account)).rejects.toMatchObject({ status: 400 });
      expect(mocks.transaction).not.toHaveBeenCalled();
    },
  );
  it('rejects invalid signed provider data and another account token', async () => {
    mocks.transaction.mockRejectedValueOnce(new Error('signature chain failed'));
    await expect(verifyAppleSubscription('1001', account)).rejects.toMatchObject({ status: 400 });
    mocks.transaction.mockResolvedValueOnce({
      ...transaction(),
      appAccountToken: '22222222-2222-4222-8222-222222222222',
    });
    await expect(verifyAppleSubscription('1001', account)).rejects.toMatchObject({ status: 409 });
  });
  it('returns current revoked state even if the presented purchase was once active', async () => {
    const data = response();
    data.data[0].lastTransactions[0].status = 5;
    mocks.statuses.mockResolvedValueOnce(data);
    const state = await verifyAppleSubscription('1001', account);
    expect(state.status).toBe('revoked');
    expect(Date.parse(state.currentPeriodEnd)).toBeLessThanOrEqual(Date.now());
  });
});
