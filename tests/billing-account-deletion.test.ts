import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  durableRateLimit: vi.fn(),
  getAdminSupabase: vi.fn(),
  billingDatabase: vi.fn(),
  getStripe: vi.fn(),
  persistSubscription: vi.fn(),
  withBillingLock: vi.fn(),
}));
vi.mock('@/lib/server/auth', () => ({
  requireUser: mocks.requireUser,
  durableRateLimit: mocks.durableRateLimit,
}));
vi.mock('@/lib/supabase/server', () => ({ getAdminSupabase: mocks.getAdminSupabase }));
vi.mock('@/lib/billing/server', () => ({
  billingDatabase: mocks.billingDatabase,
  persistSubscription: mocks.persistSubscription,
  withBillingLock: mocks.withBillingLock,
}));
vi.mock('@/lib/billing/stripe', () => ({ getStripe: mocks.getStripe }));

import { DELETE as deleteAccount } from '../src/app/api/account/route';

const workspaceId = '123e4567-e89b-42d3-a456-426614174000';
const events: string[] = [];
const remove = vi.fn(async () => {
  events.push('delete');
  return { error: null };
});
const subscriptions = vi.fn(async () => {
  events.push('verify');
  return { data: [] as { status: string }[], has_more: false };
});
const expire = vi.fn(async () => {
  events.push('expire');
  return { id: 'cs_pending' };
});
const request = () =>
  new Request('http://localhost:3000/api/account', {
    method: 'DELETE',
    headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
    body: JSON.stringify({ confirmation: 'DELETE' }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  events.length = 0;
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000');
  mocks.requireUser.mockResolvedValue({
    user: { id: 'user', last_sign_in_at: new Date().toISOString() },
    supabase: { auth: { signOut: vi.fn() } },
  });
  const db = {
    auth: { admin: { deleteUser: remove } },
    from(table: string) {
      const data =
        table === 'workspace_memberships'
          ? [{ workspace_id: workspaceId }]
          : table === 'workspace_subscriptions'
            ? [{ stripe_subscription_id: 'sub_ended', status: 'canceled' }]
            : [];
      const query = {
        select: () => query,
        eq: () => query,
        in: () => query,
        maybeSingle: async () => ({
          data: { stripe_customer_id: 'cus_owned', checkout_session_id: 'cs_pending' },
          error: null,
        }),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data, error: null }).then(resolve),
      };
      return query;
    },
  };
  mocks.getAdminSupabase.mockReturnValue(db);
  mocks.billingDatabase.mockReturnValue(db);
  mocks.withBillingLock.mockImplementation(async (_workspace, operation) => operation('lease'));
  mocks.persistSubscription.mockImplementation(async (_workspace, _token, patch) => {
    events.push(
      patch.deletion_pending === true
        ? 'fence'
        : patch.deletion_pending === false
          ? 'unfence'
          : 'clear-checkout',
    );
  });
  subscriptions.mockImplementation(async () => {
    events.push('verify');
    return { data: [], has_more: false };
  });
  mocks.getStripe.mockReturnValue({
    subscriptions: { list: subscriptions },
    checkout: {
      sessions: {
        list: async function* () {
          yield { id: 'cs_pending' };
        },
        expire,
      },
    },
  });
});

describe('account deletion protects incomplete billing flows', () => {
  it('fences new checkout, expires open sessions, then rechecks subscriptions before deleting', async () => {
    const response = await deleteAccount(request());
    expect(response.status).toBe(200);
    expect(events).toEqual(['fence', 'verify', 'expire', 'verify', 'clear-checkout', 'delete']);
    expect(expire).toHaveBeenCalledWith('cs_pending');
    expect(mocks.withBillingLock).toHaveBeenCalledWith(workspaceId, expect.any(Function));
  });
  it('refuses deletion if a completed checkout has a subscription whose webhook is still pending', async () => {
    subscriptions.mockResolvedValue({ data: [{ status: 'active' }], has_more: false });
    const response = await deleteAccount(request());
    expect(response.status).toBe(409);
    expect(remove).not.toHaveBeenCalled();
    expect(events).toContain('unfence');
  });
  it('refuses deletion if checkout completes during the expiration window', async () => {
    subscriptions
      .mockResolvedValueOnce({ data: [], has_more: false })
      .mockResolvedValueOnce({ data: [{ status: 'incomplete' }], has_more: false });
    const response = await deleteAccount(request());
    expect(response.status).toBe(409);
    expect(expire).toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
  it('requires recent authentication before doing billing or destructive work', async () => {
    mocks.requireUser.mockResolvedValue({
      user: { id: 'user', last_sign_in_at: '2020-01-01T00:00:00Z' },
      supabase: {},
    });
    const response = await deleteAccount(request());
    expect(response.status).toBe(401);
    expect(mocks.withBillingLock).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
});
