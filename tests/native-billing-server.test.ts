import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  lock: vi.fn(),
  google: vi.fn(),
  acknowledge: vi.fn(),
  apple: vi.fn(),
  decodeApple: vi.fn(),
  entitlements: vi.fn(),
  launch: vi.fn(),
}));
vi.mock('@/lib/billing/server', () => ({
  billingDatabase: () => ({ rpc: mocks.rpc, from: mocks.from }),
  getWorkspaceEntitlements: mocks.entitlements,
  withBillingLock: mocks.lock,
}));
vi.mock('@/lib/billing/native-config', () => ({
  nativeEnvironment: () => 'sandbox',
  nativePurchaseLaunchReady: mocks.launch,
}));
vi.mock('@/lib/billing/native-apple', () => ({
  decodeApplePurchase: mocks.decodeApple,
  verifyAppleSubscription: mocks.apple,
}));
vi.mock('@/lib/billing/native-google', () => ({
  acknowledgeGoogleSubscription: mocks.acknowledge,
  verifyGoogleSubscription: mocks.google,
}));
import {
  assertNoNativeSubscription,
  nativePurchaseKey,
  prepareNativeBilling,
  reconcileNativeNotification,
  verifyNativePurchase,
  reserveNativePurchase,
  releaseNativePurchase,
} from '@/lib/billing/native-server';

const account = '11111111-1111-4111-8111-111111111111';
const state = () => ({
  provider: 'google',
  environment: 'sandbox',
  appAccountToken: account,
  purchaseReference: 'private-purchase-token',
  productId: 'pro.monthly',
  basePlanId: 'monthly',
  transactionId: 'GPA.fixture',
  status: 'active',
  currentPeriodEnd: new Date(Date.now() + 86_400_000).toISOString(),
  acknowledged: false,
});
const input = {
  platform: 'android' as const,
  productId: 'pro.monthly',
  purchaseToken: 'private-purchase-token',
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.launch.mockReturnValue(true);
  mocks.lock.mockImplementation(async (_workspace, operation) => operation('fenced-lock'));
  mocks.rpc.mockImplementation(
    async (name: string, args?: { p_state?: Record<string, unknown> }) => ({
      error: null,
      data:
        name === 'folia_account_legal_eligible'
          ? true
          : name === 'folia_native_billing_version'
            ? 1
            : name === 'prepare_native_billing'
              ? account
              : name === 'commit_native_billing_state'
                ? {
                    status: args?.p_state?.status,
                    currentPeriodEnd: args?.p_state?.current_period_end,
                    acknowledged: args?.p_state?.acknowledged,
                  }
                : null,
    }),
  );
  mocks.google.mockImplementation(async () => state());
  mocks.from.mockImplementation((table: string) => {
    const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.maybeSingle.mockResolvedValue({
      error: null,
      data:
        table === 'native_subscriptions'
          ? { account_token: account, workspace_id: 'workspace' }
          : table === 'native_purchase_bindings'
            ? { account_token: account, retired: false }
            : { user_id: 'user' },
    });
    return query;
  });
  mocks.entitlements.mockResolvedValue({ tier: 'pro' });
  mocks.acknowledge.mockResolvedValue(undefined);
});
describe('native verified purchase processing', () => {
  it('creates a fenced durable reservation before a new native store flow', async () => {
    const original = mocks.rpc.getMockImplementation()!;
    mocks.rpc.mockImplementation((name, args) =>
      name === 'reserve_native_purchase_intent'
        ? Promise.resolve({
            error: null,
            data: { intentId: account, expiresAt: new Date(Date.now() + 900_000).toISOString() },
          })
        : original(name, args),
    );
    expect(
      await reserveNativePurchase('user', 'workspace', 'android', 'pro.monthly'),
    ).toMatchObject({ intentId: account });
    expect(mocks.rpc).toHaveBeenCalledWith(
      'reserve_native_purchase_intent',
      expect.objectContaining({
        p_user_id: 'user',
        p_workspace_id: 'workspace',
        p_lock_token: 'fenced-lock',
        p_provider: 'google',
        p_environment: 'sandbox',
        p_product_id: 'pro.monthly',
      }),
    );
    expect(mocks.google).not.toHaveBeenCalled();
  });
  it('pauses new production reservations without disabling paid receipt verification or cancellation', async () => {
    mocks.launch.mockReturnValue(false);
    await expect(
      reserveNativePurchase('user', 'workspace', 'android', 'pro.monthly'),
    ).rejects.toMatchObject({ status: 503 });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(await verifyNativePurchase('user', 'workspace', input)).toMatchObject({
      verified: true,
    });
    expect(await releaseNativePurchase('user', 'workspace', account)).toEqual({ released: true });
  });
  it('persists server verified state before Google acknowledgement and only then returns Pro', async () => {
    const result = await verifyNativePurchase('user', 'workspace', input);
    expect(result).toMatchObject({
      verified: true,
      acknowledged: true,
      entitlements: { tier: 'pro' },
    });
    const commits = mocks.rpc.mock.calls.filter(([name]) => name === 'commit_native_billing_state');
    expect(commits).toHaveLength(2);
    expect(commits[0][1].p_state.acknowledged).toBe(false);
    expect(commits[1][1].p_state.acknowledged).toBe(true);
    expect(commits[0][1]).toMatchObject({
      p_user_id: 'user',
      p_workspace_id: 'workspace',
      p_lock_token: 'fenced-lock',
    });
    expect(commits[0][1].p_state.purchase_key).toBe(nativePurchaseKey('private-purchase-token'));
    const firstCommitIndex = mocks.rpc.mock.calls.findIndex(
      ([name]) => name === 'commit_native_billing_state',
    );
    expect(mocks.rpc.mock.invocationCallOrder[firstCommitIndex]).toBeLessThan(
      mocks.acknowledge.mock.invocationCallOrder[0],
    );
    expect(mocks.google).toHaveBeenCalledWith('private-purchase-token', account);
  });
  it('does not acknowledge or grant on failed ownership persistence', async () => {
    const original = mocks.rpc.getMockImplementation()!;
    mocks.rpc.mockImplementation((name, args) =>
      name === 'commit_native_billing_state'
        ? Promise.resolve({ error: { code: '23514' } })
        : original(name, args),
    );
    await expect(verifyNativePurchase('user', 'workspace', input)).rejects.toMatchObject({
      status: 409,
    });
    expect(mocks.acknowledge).not.toHaveBeenCalled();
    expect(mocks.entitlements).not.toHaveBeenCalled();
  });
  it('leaves a durably saved pending acknowledgement for retry on network failure', async () => {
    mocks.acknowledge.mockRejectedValue(new Error('network unavailable'));
    await expect(verifyNativePurchase('user', 'workspace', input)).rejects.toThrow();
    expect(
      mocks.rpc.mock.calls.filter(([name]) => name === 'commit_native_billing_state'),
    ).toHaveLength(1);
    expect(mocks.entitlements).not.toHaveBeenCalled();
  });
  it.each(['pending', 'expired', 'revoked', 'on_hold', 'paused'])(
    'never acknowledges an unpaid %s state',
    async (status) => {
      mocks.google.mockResolvedValue({ ...state(), status });
      await verifyNativePurchase('user', 'workspace', input);
      expect(mocks.acknowledge).not.toHaveBeenCalled();
    },
  );
  it('does not acknowledge again on replay of an acknowledged receipt', async () => {
    mocks.google.mockResolvedValue({ ...state(), acknowledged: true });
    await verifyNativePurchase('user', 'workspace', input);
    expect(mocks.acknowledge).not.toHaveBeenCalled();
  });
  it('fails closed before provider calls if schema capability is absent or wrong', async () => {
    const original = mocks.rpc.getMockImplementation()!;
    mocks.rpc.mockImplementation((name, args) =>
      name === 'folia_native_billing_version'
        ? Promise.resolve({ data: 0, error: null })
        : original(name, args),
    );
    await expect(verifyNativePurchase('user', 'workspace', input)).rejects.toMatchObject({
      status: 503,
    });
    expect(mocks.google).not.toHaveBeenCalled();
    expect(mocks.lock).not.toHaveBeenCalled();
  });
  it('requires trusted current legal eligibility before preparing store identifiers', async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    await expect(prepareNativeBilling('user', 'workspace')).rejects.toMatchObject({ status: 428 });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.google).not.toHaveBeenCalled();
  });
  it('rejects client Apple account mismatch and re-queries current state for valid JWS', async () => {
    mocks.decodeApple.mockResolvedValueOnce({
      appAccountToken: 'other',
      originalTransactionId: '1001',
    });
    await expect(
      verifyNativePurchase('user', 'workspace', {
        platform: 'ios',
        productId: 'pro.monthly',
        jwsRepresentation: 'signed-jws',
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(mocks.apple).not.toHaveBeenCalled();
    mocks.decodeApple.mockResolvedValueOnce({
      appAccountToken: account,
      originalTransactionId: '1001',
    });
    mocks.apple.mockResolvedValueOnce({
      ...state(),
      provider: 'apple',
      purchaseReference: '1001',
      basePlanId: null,
      acknowledged: true,
      status: 'revoked',
    });
    mocks.entitlements.mockResolvedValueOnce({ tier: 'free' });
    const result = await verifyNativePurchase('user', 'workspace', {
      platform: 'ios',
      productId: 'pro.monthly',
      jwsRepresentation: 'old-valid-jws',
    });
    expect(mocks.apple).toHaveBeenCalledWith('1001', account);
    expect(result).toMatchObject({
      subscription: { status: 'revoked' },
      entitlements: { tier: 'free' },
    });
  });
  it('full Google refunds revoke only the matching order and do not erase a later renewal', async () => {
    await reconcileNativeNotification(
      'google',
      'private-purchase-token',
      undefined,
      'GPA.older-order',
    );
    let commits = mocks.rpc.mock.calls.filter(([name]) => name === 'commit_native_billing_state');
    expect(commits[0][1].p_state.status).toBe('active');
    expect(commits[0][1].p_state.revoked_transaction_id).toBeUndefined();
    mocks.rpc.mockClear();
    mocks.acknowledge.mockClear();
    await reconcileNativeNotification('google', 'private-purchase-token', undefined, 'GPA.fixture');
    commits = mocks.rpc.mock.calls.filter(([name]) => name === 'commit_native_billing_state');
    expect(commits[0][1].p_state).toMatchObject({
      status: 'revoked',
      revoked_transaction_id: 'GPA.fixture',
    });
    expect(mocks.acknowledge).not.toHaveBeenCalled();
  });
  it('does not query stores or restore grants for a deleted mapped account', async () => {
    const original = mocks.from.getMockImplementation()!;
    mocks.from.mockImplementation((table) => {
      const query = original(table);
      if (table === 'native_billing_accounts')
        query.maybeSingle.mockResolvedValue({ data: { user_id: null }, error: null });
      return query;
    });
    await reconcileNativeNotification('google', 'private-purchase-token');
    expect(mocks.google).not.toHaveBeenCalled();
    expect(mocks.lock).not.toHaveBeenCalled();
  });
  it('applies signed Apple refund evidence despite a lagging ACTIVE status and only clears via matching reversal', async () => {
    mocks.apple.mockResolvedValue({
      ...state(),
      provider: 'apple',
      transactionId: 'apple-order',
      acknowledged: true,
    });
    await reconcileNativeNotification('apple', 'private-purchase-token', account, 'apple-order');
    let commits = mocks.rpc.mock.calls.filter(([name]) => name === 'commit_native_billing_state');
    expect(commits[0][1].p_state).toMatchObject({
      status: 'revoked',
      revoked_transaction_id: 'apple-order',
    });
    mocks.rpc.mockClear();
    await reconcileNativeNotification(
      'apple',
      'private-purchase-token',
      account,
      undefined,
      'apple-order',
    );
    commits = mocks.rpc.mock.calls.filter(([name]) => name === 'commit_native_billing_state');
    expect(commits[0][1].p_state).toMatchObject({
      status: 'active',
      clear_revoked_transaction_id: 'apple-order',
    });
    mocks.apple.mockResolvedValue({
      ...state(),
      provider: 'apple',
      transactionId: 'apple-order',
      status: 'revoked',
      acknowledged: true,
    });
    await expect(
      reconcileNativeNotification(
        'apple',
        'private-purchase-token',
        account,
        undefined,
        'apple-order',
      ),
    ).rejects.toMatchObject({ status: 503 });
  });
});

describe('cross-provider checkout guard', () => {
  it('blocks duplicate Stripe checkout for active native subscriptions', async () => {
    mocks.rpc.mockImplementation(async (name) => ({
      data: name === 'folia_native_billing_version' ? 1 : true,
      error: null,
    }));
    await expect(assertNoNativeSubscription('workspace')).rejects.toMatchObject({ status: 409 });
  });
  it('permits an empty native state but fails closed on unexpected provider/schema error', async () => {
    await assertNoNativeSubscription('workspace');
    mocks.rpc.mockResolvedValueOnce({ error: { code: 'network' }, data: null });
    await expect(assertNoNativeSubscription('workspace')).rejects.toMatchObject({ status: 503 });
  });
  it('keeps pre-native web checkout available only for a specifically missing capability RPC', async () => {
    mocks.rpc.mockResolvedValueOnce({ error: { code: 'PGRST202' }, data: null });
    await assertNoNativeSubscription('workspace');
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
});
