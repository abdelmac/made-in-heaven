import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  durableRateLimit: vi.fn(),
  getAdminSupabase: vi.fn(),
  billingDatabase: vi.fn(),
  getStripe: vi.fn(),
  persistSubscription: vi.fn(),
  withBillingLock: vi.fn(),
  verifyStripeAccount: vi.fn(),
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
vi.mock('@/lib/billing/stripe', () => ({
  getStripe: mocks.getStripe,
  verifyStripeAccount: mocks.verifyStripeAccount,
}));

import { DELETE as deleteAccount } from '../src/app/api/account/route';
import { HttpError } from '../src/lib/server/http';
import { localizeError } from '../src/lib/i18n/errors';

const workspaceId = '123e4567-e89b-42d3-a456-426614174000';
const events: string[] = [];
const remove = vi.fn(),
  revoke = vi.fn(),
  getSession = vi.fn(),
  getClaims = vi.fn(),
  signOut = vi.fn(),
  deletionVersion = vi.fn();
const listSubscriptions = vi.fn(),
  retrieveSubscription = vi.fn(),
  cancel = vi.fn(),
  expire = vi.fn(),
  retrieveSession = vi.fn();
type Subscription = {
  id: string;
  status: string;
  livemode: boolean;
  customer: string;
  metadata?: Record<string, string>;
};
let subscriptions: Subscription[];
let session: {
  id: string;
  status: string;
  livemode: boolean;
  customer: string;
  mode: string;
  subscription: string | null;
};
let billing: Record<string, unknown> | null;
let owned: { workspace_id: string }[];
let organizations: { id: string }[];
const freshClaims = () => ({
  sub: 'user',
  session_id: 'current-session',
  amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) }],
});
const subscription = (status: string, id = 'sub_personal'): Subscription => ({
  id,
  status,
  livemode: false,
  customer: 'cus_owned',
  metadata: { folia_workspace_id: workspaceId },
});
const request = (
  headers: Record<string, string> = {},
  body: unknown = { confirmation: 'DELETE' },
) =>
  new Request('http://localhost:3000/api/account', {
    method: 'DELETE',
    headers: { origin: 'http://localhost:3000', 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.resetAllMocks();
  events.length = 0;
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000');
  vi.stubEnv('STRIPE_BILLING_MODE', 'test');
  subscriptions = [];
  owned = [{ workspace_id: workspaceId }];
  organizations = [];
  billing = {
    billing_mode: 'test',
    stripe_customer_id: 'cus_owned',
    checkout_session_id: 'cs_pending',
  };
  session = {
    id: 'cs_pending',
    status: 'open',
    livemode: false,
    customer: 'cus_owned',
    mode: 'subscription',
    subscription: null,
  };
  getSession.mockResolvedValue({ data: { session: { access_token: 'browser-jwt' } }, error: null });
  getClaims.mockImplementation(async () => ({ data: { claims: freshClaims() }, error: null }));
  signOut.mockResolvedValue({ error: null });
  deletionVersion.mockResolvedValue({ data: 1, error: null });
  // Account-level time stays recent even in stale request-session regression tests.
  mocks.requireUser.mockResolvedValue({
    user: { id: 'user', last_sign_in_at: new Date().toISOString() },
    supabase: { auth: { getSession, getClaims, signOut } },
  });
  remove.mockImplementation(async () => {
    events.push('delete');
    return { error: null };
  });
  revoke.mockImplementation(async () => {
    events.push('revoke');
    return { error: null };
  });
  const db = {
    auth: { admin: { deleteUser: remove, signOut: revoke } },
    rpc: deletionVersion,
    from(table: string) {
      const query = {
        select: () => query,
        eq: () => query,
        in: () => query,
        maybeSingle: async () => ({ data: billing, error: null }),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({
            data: table === 'workspace_memberships' ? owned : organizations,
            error: null,
          }).then(resolve),
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
  listSubscriptions.mockImplementation(async () => {
    events.push('list-subscriptions');
    return { data: subscriptions.map((item) => ({ ...item })), has_more: false };
  });
  retrieveSubscription.mockImplementation(async (id: string) => {
    const found = subscriptions.find((item) => item.id === id);
    if (!found) throw new Error('Unknown subscription');
    return { ...found };
  });
  cancel.mockImplementation(async (id: string) => {
    events.push(`cancel:${id}`);
    const found = subscriptions.find((item) => item.id === id)!;
    found.status = 'canceled';
    return { ...found };
  });
  retrieveSession.mockImplementation(async () => ({ ...session }));
  expire.mockImplementation(async () => {
    events.push('expire');
    session.status = 'expired';
    return { ...session };
  });
  mocks.getStripe.mockReturnValue({
    subscriptions: { list: listSubscriptions, retrieve: retrieveSubscription, cancel },
    checkout: {
      sessions: {
        list: async function* () {
          if (session.status === 'open') yield { ...session };
        },
        retrieve: retrieveSession,
        expire,
      },
    },
  });
});

describe('immediate personal account deletion', () => {
  it('fences and closes checkout, verifies billing, revokes sessions, then hard deletes', async () => {
    expect((await deleteAccount(request())).status).toBe(200);
    expect(events).toEqual([
      'fence',
      'fence',
      'expire',
      'list-subscriptions',
      'list-subscriptions',
      'clear-checkout',
      'revoke',
      'delete',
    ]);
    expect(expire).toHaveBeenCalledWith('cs_pending');
    expect(mocks.withBillingLock).toHaveBeenCalledWith(workspaceId, expect.any(Function));
    expect(deletionVersion).toHaveBeenCalledWith('folia_account_deletion_version');
    expect(revoke).toHaveBeenCalledWith('browser-jwt', 'global');
    expect(remove).toHaveBeenCalledWith('user', false);
  });
  it.each(['active', 'trialing', 'past_due', 'incomplete', 'unpaid', 'paused'])(
    'immediately cancels %s without waiting for its paid period',
    async (status) => {
      subscriptions = [subscription(status)];
      billing!.stripe_subscription_id = 'sub_personal';
      expect((await deleteAccount(request())).status).toBe(200);
      expect(cancel).toHaveBeenCalledWith('sub_personal', { invoice_now: false, prorate: false });
      expect(events.indexOf('expire')).toBeLessThan(events.indexOf('cancel:sub_personal'));
      expect(events.indexOf('cancel:sub_personal')).toBeLessThan(events.indexOf('delete'));
      expect(mocks.persistSubscription).toHaveBeenCalledWith(workspaceId, 'lease', {
        status: 'canceled',
        checkout_session_id: null,
        checkout_attempt_id: null,
        checkout_price_id: null,
      });
    },
  );
  it.each(['canceled', 'incomplete_expired'])(
    'leaves ended %s subscriptions alone',
    async (status) => {
      subscriptions = [subscription(status)];
      expect((await deleteAccount(request())).status).toBe(200);
      expect(cancel).not.toHaveBeenCalled();
    },
  );
  it('retrieves trusted subscriptions even if listing has not caught up', async () => {
    subscriptions = [subscription('active')];
    billing!.stripe_subscription_id = 'sub_personal';
    listSubscriptions.mockResolvedValue({ data: [], has_more: false });
    expect((await deleteAccount(request())).status).toBe(200);
    expect(retrieveSubscription).toHaveBeenCalledWith('sub_personal');
    expect(cancel).toHaveBeenCalled();
  });
  it('cancels a subscription created when checkout completion wins the expiration race', async () => {
    expire.mockImplementationOnce(async () => {
      session.status = 'complete';
      session.subscription = 'sub_racing';
      subscriptions = [subscription('trialing', 'sub_racing')];
      throw new Error('Checkout no longer open');
    });
    expect((await deleteAccount(request())).status).toBe(200);
    expect(retrieveSession).toHaveBeenCalledTimes(2);
    expect(retrieveSubscription).toHaveBeenCalledWith('sub_racing');
    expect(cancel).toHaveBeenCalledWith('sub_racing', { invoice_now: false, prorate: false });
  });
  it('does not delete while another subscription appears after cancellation', async () => {
    subscriptions = [subscription('active')];
    listSubscriptions
      .mockResolvedValueOnce({ data: [subscription('active')], has_more: false })
      .mockResolvedValueOnce({ data: [subscription('active', 'sub_racing')], has_more: false });
    expect((await deleteAccount(request())).status).toBe(409);
    expect(cancel).toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
  });
  it('stops deletion when checkout expiration fails and checkout remains open', async () => {
    expire.mockRejectedValueOnce(new Error('Provider unavailable'));
    expect((await deleteAccount(request())).status).toBe(500);
    expect(cancel).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(events).toContain('unfence');
  });
  it('does not delete or revoke when cancellation fails', async () => {
    subscriptions = [subscription('active')];
    cancel.mockRejectedValueOnce(new Error('Provider unavailable'));
    expect((await deleteAccount(request())).status).toBe(500);
    expect(remove).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
  });
  it('stops provider mutation on lease loss and retains an uncleared fence', async () => {
    mocks.persistSubscription
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue(new HttpError(503, 'Lease expired'));
    expect((await deleteAccount(request())).status).toBe(503);
    expect(expire).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(mocks.persistSubscription).toHaveBeenLastCalledWith(workspaceId, 'lease', {
      deletion_pending: false,
    });
  });
  it('verifies the expected Stripe account before mutations', async () => {
    mocks.verifyStripeAccount.mockRejectedValueOnce(new Error('Wrong Stripe account'));
    expect((await deleteAccount(request())).status).toBe(500);
    expect(expire).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
  it('rejects stored billing from another mode before fencing', async () => {
    billing!.billing_mode = 'live';
    expect((await deleteAccount(request())).status).toBe(500);
    expect(mocks.persistSubscription).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
  it.each([
    { livemode: true },
    { customer: 'cus_other' },
    { metadata: { folia_workspace_id: 'other-workspace' } },
  ])('refuses unsafe provider resources (%j)', async (patch) => {
    subscriptions = [{ ...subscription('active'), ...patch }];
    expect((await deleteAccount(request())).status).toBeGreaterThanOrEqual(400);
    expect(cancel).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
  it('refuses truncated subscription results', async () => {
    listSubscriptions.mockResolvedValueOnce({ data: [], has_more: true });
    expect((await deleteAccount(request())).status).toBe(409);
    expect(remove).not.toHaveBeenCalled();
  });
  it('does not discard billing identifiers without a trusted customer', async () => {
    billing!.stripe_customer_id = null;
    expect((await deleteAccount(request())).status).toBe(503);
    expect(remove).not.toHaveBeenCalled();
  });
  it('allows a free workspace with no Stripe resources', async () => {
    billing = null;
    expect((await deleteAccount(request())).status).toBe(200);
    expect(mocks.getStripe).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalled();
  });
  it('requires organization ownership transfer before any billing cancellation', async () => {
    organizations = [{ id: workspaceId }];
    expect((await deleteAccount(request())).status).toBe(409);
    expect(mocks.withBillingLock).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
  it('fails closed if global session revocation fails', async () => {
    revoke.mockResolvedValueOnce({ error: new Error('Auth unavailable') });
    expect((await deleteAccount(request())).status).toBe(503);
    expect(remove).not.toHaveBeenCalled();
  });
  it('reports sign-in retry when hard deletion fails after revocation', async () => {
    remove.mockResolvedValueOnce({ error: new Error('Deletion trigger rejected') });
    const response = await deleteAccount(request());
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain('Reconnectez-vous');
    expect(revoke).toHaveBeenCalled();
    expect(events).toContain('unfence');
  });
});

describe('account deletion migration readiness', () => {
  it.each([
    { data: null, error: { code: 'PGRST202', message: 'Missing RPC' } },
    { data: null, error: null },
    { data: 0, error: null },
    { data: 2, error: null },
    { data: '1', error: null },
    { data: 1, error: { code: '08006', message: 'Database unavailable' } },
  ])(
    'stops before billing or identity changes for an unavailable capability (%j)',
    async (result) => {
      deletionVersion.mockResolvedValueOnce(result);
      const response = await deleteAccount(request());
      expect(response.status).toBe(503);
      expect((await response.json()).error).toBe(
        localizeError('Account deletion is temporarily unavailable. Please contact support.'),
      );
      expect(mocks.withBillingLock).not.toHaveBeenCalled();
      expect(mocks.persistSubscription).not.toHaveBeenCalled();
      expect(mocks.getStripe).not.toHaveBeenCalled();
      expect(cancel).not.toHaveBeenCalled();
      expect(expire).not.toHaveBeenCalled();
      expect(revoke).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
    },
  );

  it('fails closed with the static unavailable error if the capability request throws', async () => {
    deletionVersion.mockRejectedValueOnce(new Error('Private database diagnostic'));
    const response = await deleteAccount(request());
    expect(response.status).toBe(503);
    expect((await response.json()).error).toBe(
      localizeError('Account deletion is temporarily unavailable. Please contact support.'),
    );
    expect(mocks.getStripe).not.toHaveBeenCalled();
    expect(mocks.withBillingLock).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
});

describe('deletion reauthentication and request guards', () => {
  it.each([
    { amr: undefined },
    { amr: ['password'] },
    { amr: [{ method: 'token_refresh', timestamp: Math.floor(Date.now() / 1000) }] },
    { amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) - 601 }] },
    { amr: [{ method: 'password', timestamp: Number.NaN }] },
    { amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) + 600 }] },
    { sub: 'another-user' },
    { session_id: '' },
  ])('requires recent password auth on this verified request session (%j)', async (patch) => {
    getClaims.mockResolvedValueOnce({
      data: { claims: { ...freshClaims(), ...patch } },
      error: null,
    });
    expect((await deleteAccount(request())).status).toBe(401);
    expect(mocks.withBillingLock).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
  it('rejects unverifiable claims', async () => {
    getClaims.mockResolvedValueOnce({ data: null, error: new Error('Invalid token') });
    expect((await deleteAccount(request())).status).toBe(401);
    expect(remove).not.toHaveBeenCalled();
  });
  it('requires a current session despite a recent per-account sign-in timestamp', async () => {
    getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    expect((await deleteAccount(request())).status).toBe(401);
    expect(getClaims).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
  it('verifies the native bearer and revokes every native session without cookie fallback', async () => {
    const response = await deleteAccount(
      request({ origin: 'capacitor://localhost', authorization: 'Bearer native-jwt' }),
    );
    expect(response.status).toBe(200);
    expect(getSession).not.toHaveBeenCalled();
    expect(getClaims).toHaveBeenCalledWith('native-jwt');
    expect(revoke).toHaveBeenCalledWith('native-jwt', 'global');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('capacitor://localhost');
  });
  it.each<Record<string, string>>([
    { origin: 'https://attacker.example' },
    { origin: 'capacitor://localhost' },
    { 'sec-fetch-site': 'cross-site' },
  ])('rejects uncredentialed native or cross-site requests (%j)', async (headers) => {
    expect((await deleteAccount(request(headers))).status).toBe(403);
    expect(mocks.requireUser).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
  it('requires typed confirmation', async () => {
    expect((await deleteAccount(request({}, { confirmation: 'delete' }))).status).toBe(400);
    expect(mocks.withBillingLock).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
  it('retains durable rate limiting before destructive work', async () => {
    mocks.durableRateLimit.mockRejectedValueOnce(new HttpError(429, 'Too many requests.'));
    expect((await deleteAccount(request())).status).toBe(429);
    expect(mocks.durableRateLimit).toHaveBeenCalledWith('user', 'account-deletion', 3, 3600);
    expect(mocks.withBillingLock).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
});
