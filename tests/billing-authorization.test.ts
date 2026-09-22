import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpError } from '../src/lib/server/http';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({
  requireWorkspace: vi.fn(),
  durableRateLimit: vi.fn(),
  billingDatabase: vi.fn(),
  getStripe: vi.fn(),
  billingConfigured: vi.fn(),
  getPortalConfiguration: vi.fn(),
  withBillingLock: vi.fn(),
  assertBillingEnvironment: vi.fn(),
  verifyStripeAccount: vi.fn(),
}));
vi.mock('@/lib/server/auth', () => ({
  requireWorkspace: mocks.requireWorkspace,
  durableRateLimit: mocks.durableRateLimit,
}));
vi.mock('@/lib/billing/server', () => ({
  billingDatabase: mocks.billingDatabase,
  persistSubscription: vi.fn(),
  withBillingLock: mocks.withBillingLock,
  assertBillingEnvironment: mocks.assertBillingEnvironment,
}));
vi.mock('@/lib/billing/portal', () => ({ getPortalConfiguration: mocks.getPortalConfiguration }));
vi.mock('@/lib/billing/stripe', () => ({
  getStripe: mocks.getStripe,
  billingConfigured: mocks.billingConfigured,
  assertConfiguredPrice: vi.fn(),
  verifyStripeAccount: mocks.verifyStripeAccount,
}));

import { POST as checkout } from '../src/app/api/billing/checkout/route';
import { POST as portal } from '../src/app/api/billing/portal/route';

const workspaceId = '123e4567-e89b-42d3-a456-426614174000';
const request = (path: string, body: unknown, origin = 'http://localhost:3000') =>
  new Request(`http://localhost:3000/api/billing/${path}`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000');
  vi.stubEnv('STRIPE_BILLING_MODE', 'test');
  vi.stubEnv('STRIPE_ACCOUNT_ID', undefined);
  vi.stubEnv('STRIPE_LIVE_CHECKOUT_ENABLED', 'false');
  mocks.durableRateLimit.mockResolvedValue(undefined);
  mocks.billingConfigured.mockReturnValue(false);
});
afterEach(() => vi.unstubAllEnvs());

describe('billing owner and request authorization', () => {
  it.each([
    ['checkout', checkout, { workspaceId, tier: 'pro', interval: 'month' }],
    ['portal', portal, { workspaceId }],
  ] as const)(
    'rejects unauthorized %s before touching Stripe or trusted billing records',
    async (path, route, body) => {
      mocks.requireWorkspace.mockRejectedValue(
        new HttpError(403, 'Your workspace role does not allow this action.'),
      );
      const response = await route(request(path, body));
      expect(response.status).toBe(403);
      expect(mocks.requireWorkspace).toHaveBeenCalledWith(workspaceId, { roles: ['owner'] });
      expect(mocks.getStripe).not.toHaveBeenCalled();
      expect(mocks.billingDatabase).not.toHaveBeenCalled();
    },
  );
  it('blocks cross-origin forged requests before checking membership', async () => {
    const response = await checkout(
      request('checkout', { workspaceId, tier: 'pro', interval: 'month' }, 'https://evil.example'),
    );
    expect(response.status).toBe(403);
    expect(mocks.requireWorkspace).not.toHaveBeenCalled();
  });
  it('rejects client amounts, prices, customers, paid flags, and return URLs', async () => {
    for (const extra of [
      { unitAmount: 1 },
      { priceId: 'price_untrusted' },
      { customerId: 'cus_other' },
      { paid: true },
      { returnUrl: 'https://evil.example' },
    ]) {
      const response = await checkout(
        request('checkout', { workspaceId, tier: 'pro', interval: 'month', ...extra }),
      );
      expect(response.status).toBe(400);
    }
    expect(mocks.requireWorkspace).not.toHaveBeenCalled();
  });
  it('refuses Team on personal scope even for its owner', async () => {
    mocks.requireWorkspace.mockResolvedValue({
      user: { id: 'owner' },
      workspace: { id: workspaceId, kind: 'personal', name: 'Personal' },
      role: 'owner',
    });
    const response = await checkout(
      request('checkout', { workspaceId, tier: 'team', interval: 'month' }),
    );
    expect(response.status).toBe(400);
    expect(mocks.getStripe).not.toHaveBeenCalled();
  });
  it('reports unavailable billing without simulating a checkout success', async () => {
    mocks.requireWorkspace.mockResolvedValue({
      user: { id: 'owner' },
      workspace: { id: workspaceId, kind: 'personal', name: 'Personal' },
      role: 'owner',
    });
    const response = await checkout(
      request('checkout', { workspaceId, tier: 'pro', interval: 'month' }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: 'La facturation n’est pas configurée. Le paiement est indisponible.',
    });
    expect(mocks.getStripe).not.toHaveBeenCalled();
  });
  it('requires a safe management portal before creating a customer or checkout session', async () => {
    vi.stubEnv('STRIPE_PRO_MONTH_PRICE_ID', 'price_proMonth');
    mocks.requireWorkspace.mockResolvedValue({
      user: { id: 'owner' },
      workspace: { id: workspaceId, kind: 'personal', name: 'Personal' },
      role: 'owner',
    });
    mocks.billingConfigured.mockReturnValue(true);
    mocks.getStripe.mockReturnValue({ prices: { retrieve: vi.fn().mockResolvedValue({}) } });
    mocks.getPortalConfiguration.mockRejectedValue(new HttpError(503, 'Portal needs review.'));
    const response = await checkout(
      request('checkout', { workspaceId, tier: 'pro', interval: 'month' }),
    );
    expect(response.status).toBe(503);
    expect(mocks.getPortalConfiguration).toHaveBeenCalledWith('pro');
    expect(mocks.withBillingLock).not.toHaveBeenCalled();
    expect(mocks.billingDatabase).not.toHaveBeenCalled();
  });
  it.each([undefined, 'false', 'TRUE', '1'])(
    'refuses closed live checkout (%s) before Stripe or billing records',
    async (enabled) => {
      vi.stubEnv('STRIPE_BILLING_MODE', 'live');
      vi.stubEnv('STRIPE_ACCOUNT_ID', 'acct_authorization');
      vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://solace.fr');
      vi.stubEnv('STRIPE_LIVE_CHECKOUT_ENABLED', enabled);
      mocks.requireWorkspace.mockResolvedValue({
        user: { id: 'owner' },
        workspace: { id: workspaceId, kind: 'personal' },
      });
      mocks.billingConfigured.mockReturnValue(true);
      const response = await checkout(
        request('checkout', { workspaceId, tier: 'pro', interval: 'month' }, 'https://solace.fr'),
      );
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        error: 'Les nouveaux abonnements ne sont pas encore ouverts.',
      });
      expect(mocks.getStripe).not.toHaveBeenCalled();
      expect(mocks.getPortalConfiguration).not.toHaveBeenCalled();
      expect(mocks.verifyStripeAccount).not.toHaveBeenCalled();
      expect(mocks.assertBillingEnvironment).not.toHaveBeenCalled();
      expect(mocks.withBillingLock).not.toHaveBeenCalled();
      expect(mocks.billingDatabase).not.toHaveBeenCalled();
    },
  );
  it.each(['test', 'live'] as const)(
    'keeps the existing %s customer portal available when new checkout is closed',
    async (mode) => {
      vi.stubEnv('STRIPE_BILLING_MODE', mode);
      vi.stubEnv('STRIPE_ACCOUNT_ID', 'acct_authorization');
      vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://solace.fr');
      mocks.requireWorkspace.mockResolvedValue({
        user: { id: 'owner' },
        workspace: { id: workspaceId, kind: 'personal' },
      });
      mocks.billingConfigured.mockReturnValue(true);
      mocks.getPortalConfiguration.mockResolvedValue('bpc_management');
      const query = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { stripe_customer_id: 'cus_existing', billing_mode: mode },
          error: null,
        }),
      };
      mocks.billingDatabase.mockReturnValue({ from: vi.fn().mockReturnValue(query) });
      const retrieve = vi.fn().mockResolvedValue({ id: 'cus_existing', livemode: mode === 'live' });
      const create = vi
        .fn()
        .mockResolvedValue({ url: 'https://billing.stripe.com/p/session_management' });
      mocks.getStripe.mockReturnValue({
        customers: { retrieve },
        billingPortal: { sessions: { create } },
      });
      const response = await portal(request('portal', { workspaceId }, 'https://solace.fr'));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        url: 'https://billing.stripe.com/p/session_management',
      });
      expect(mocks.assertBillingEnvironment).toHaveBeenCalledOnce();
      expect(mocks.verifyStripeAccount).toHaveBeenCalledOnce();
      expect(create).toHaveBeenCalledWith({
        customer: 'cus_existing',
        configuration: 'bpc_management',
        return_url: 'https://solace.fr/?view=billing',
      });
    },
  );
  it.each([undefined, 'test'])(
    'refuses a legacy or test customer (%s) in a live portal without contacting that customer',
    async (storedMode) => {
      vi.stubEnv('STRIPE_BILLING_MODE', 'live');
      vi.stubEnv('STRIPE_ACCOUNT_ID', 'acct_authorization');
      vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://solace.fr');
      mocks.requireWorkspace.mockResolvedValue({
        user: { id: 'owner' },
        workspace: { id: workspaceId, kind: 'personal' },
      });
      mocks.billingConfigured.mockReturnValue(true);
      mocks.getPortalConfiguration.mockResolvedValue('bpc_management');
      const query = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { stripe_customer_id: 'cus_other', billing_mode: storedMode },
          error: null,
        }),
      };
      mocks.billingDatabase.mockReturnValue({ from: vi.fn().mockReturnValue(query) });
      const retrieve = vi.fn();
      const create = vi.fn();
      mocks.getStripe.mockReturnValue({
        customers: { retrieve },
        billingPortal: { sessions: { create } },
      });
      const response = await portal(request('portal', { workspaceId }, 'https://solace.fr'));
      expect(response.status).toBe(500);
      expect(retrieve).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    },
  );
});
