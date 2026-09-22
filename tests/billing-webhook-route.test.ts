import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Stripe from 'stripe';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({
  getStripe: vi.fn(),
  verifyStripeAccount: vi.fn(),
  assertBillingEnvironment: vi.fn(),
  billingDatabase: vi.fn(),
  persistSubscription: vi.fn(),
  withBillingLock: vi.fn(),
}));
vi.mock('@/lib/billing/stripe', () => ({
  getStripe: mocks.getStripe,
  verifyStripeAccount: mocks.verifyStripeAccount,
}));
vi.mock('@/lib/billing/server', () => ({
  assertBillingEnvironment: mocks.assertBillingEnvironment,
  billingDatabase: mocks.billingDatabase,
  persistSubscription: mocks.persistSubscription,
  withBillingLock: mocks.withBillingLock,
}));
import { POST } from '../src/app/api/billing/webhook/route';

// Signature generation/verification is local; the SDK never performs an HTTP request.
const signatureClient = new Stripe('sk_test_webhook_route_fixture');
const webhookSecret = 'whsec_webhook_route_fixture';
const event = (mode: 'test' | 'live', overrides = {}) => ({
  id: 'evt_routeFixture',
  type: 'customer.created',
  livemode: mode === 'live',
  data: { object: { id: 'cus_existing', customer: 'cus_existing' } },
  ...overrides,
});
function signedRequest(value: ReturnType<typeof event>, tamper = false) {
  const payload = JSON.stringify(value);
  const signature = signatureClient.webhooks.generateTestHeaderString({
    payload,
    secret: webhookSecret,
  });
  return new Request('https://solace.fr/api/billing/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': signature },
    body: payload + (tamper ? ' ' : ''),
  });
}
function databaseFixture(
  mode: 'test' | 'live',
  options: { receiptMode?: string; customerMode?: string; processed?: boolean } = {},
) {
  const receipts = {
    error: null,
    upsert: vi.fn().mockResolvedValue({ error: null }),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: {
        status: options.processed ? 'processed' : 'pending',
        billing_mode: options.receiptMode ?? mode,
      },
      error: null,
    }),
    update: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
  };
  const customers = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: { workspace_id: 'workspace_fixture', billing_mode: options.customerMode ?? mode },
      error: null,
    }),
  };
  const from = vi.fn((table: string) => {
    if (table === 'billing_events') return receipts;
    if (table === 'workspace_subscriptions') return customers;
    throw new Error(`Unexpected database table: ${table}`);
  });
  mocks.billingDatabase.mockReturnValue({ from });
  return { receipts, customers, from };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('STRIPE_BILLING_MODE', 'test');
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', webhookSecret);
  vi.stubEnv('STRIPE_LIVE_CHECKOUT_ENABLED', 'false');
  mocks.getStripe.mockReturnValue({ webhooks: signatureClient.webhooks });
});
afterEach(() => vi.unstubAllEnvs());

describe('webhook route environment boundaries', () => {
  it.each(['test', 'live'] as const)(
    'rejects an opposite-mode signed webhook in %s before a durable receipt',
    async (mode) => {
      vi.stubEnv('STRIPE_BILLING_MODE', mode);
      const response = await POST(signedRequest(event(mode === 'live' ? 'test' : 'live')));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: 'Webhook environment or account scope mismatch.',
      });
      expect(mocks.assertBillingEnvironment).not.toHaveBeenCalled();
      expect(mocks.verifyStripeAccount).not.toHaveBeenCalled();
      expect(mocks.billingDatabase).not.toHaveBeenCalled();
      expect(mocks.persistSubscription).not.toHaveBeenCalled();
    },
  );
  it('rejects a Connect-scoped event even when its mode matches', async () => {
    const response = await POST(signedRequest(event('test', { account: 'acct_unapproved' })));
    expect(response.status).toBe(400);
    expect(mocks.billingDatabase).not.toHaveBeenCalled();
    expect(mocks.verifyStripeAccount).not.toHaveBeenCalled();
  });
  it('rejects a changed body before storing the signed event', async () => {
    const response = await POST(signedRequest(event('test'), true));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid webhook signature.' });
    expect(mocks.billingDatabase).not.toHaveBeenCalled();
  });
  it.each(['database', 'account'] as const)(
    'does not create a receipt when the deployment %s check fails',
    async (check) => {
      const target =
        check === 'database' ? mocks.assertBillingEnvironment : mocks.verifyStripeAccount;
      target.mockRejectedValue(new Error('Deployment does not match.'));
      const response = await POST(signedRequest(event('test')));
      expect(response.status).toBe(503);
      expect(mocks.billingDatabase).not.toHaveBeenCalled();
    },
  );
  it.each(['test', 'live'] as const)(
    'records and acknowledges a matching %s webhook while new checkout is disabled',
    async (mode) => {
      vi.stubEnv('STRIPE_BILLING_MODE', mode);
      const { receipts } = databaseFixture(mode);
      const response = await POST(signedRequest(event(mode)));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ received: true, duplicate: false, ignored: true });
      expect(mocks.assertBillingEnvironment).toHaveBeenCalledOnce();
      expect(mocks.verifyStripeAccount).toHaveBeenCalledOnce();
      expect(receipts.upsert).toHaveBeenCalledWith(
        {
          event_id: 'evt_routeFixture',
          event_type: 'customer.created',
          status: 'pending',
          billing_mode: mode,
        },
        { onConflict: 'event_id', ignoreDuplicates: true },
      );
      expect(receipts.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'processed' }),
      );
      expect(receipts.eq).toHaveBeenCalledWith('billing_mode', mode);
    },
  );
  it('does not mutate an existing receipt from the opposite environment', async () => {
    vi.stubEnv('STRIPE_BILLING_MODE', 'live');
    const { receipts } = databaseFixture('live', { receiptMode: 'test' });
    const response = await POST(signedRequest(event('live')));
    expect(response.status).toBe(503);
    expect(receipts.update).not.toHaveBeenCalled();
    expect(mocks.withBillingLock).not.toHaveBeenCalled();
    expect(mocks.persistSubscription).not.toHaveBeenCalled();
  });
  it('retries a mismatched customer association without acknowledging or modifying entitlements', async () => {
    vi.stubEnv('STRIPE_BILLING_MODE', 'live');
    const { receipts, customers } = databaseFixture('live', { customerMode: 'test' });
    const response = await POST(signedRequest(event('live', { type: 'invoice.paid' })));
    expect(response.status).toBe(503);
    expect(customers.eq).toHaveBeenCalledWith('stripe_customer_id', 'cus_existing');
    expect(receipts.update).toHaveBeenCalledOnce();
    expect(receipts.update).toHaveBeenCalledWith({
      status: 'failed',
      error: 'Reconciliation failed; retry required.',
    });
    expect(receipts.eq).toHaveBeenCalledWith('billing_mode', 'live');
    expect(receipts.neq).toHaveBeenCalledWith('status', 'processed');
    expect(mocks.withBillingLock).not.toHaveBeenCalled();
    expect(mocks.persistSubscription).not.toHaveBeenCalled();
  });
  it('accepts a processed duplicate without applying it again', async () => {
    const { receipts, customers } = databaseFixture('test', { processed: true });
    const response = await POST(signedRequest(event('test', { type: 'invoice.paid' })));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, duplicate: true, ignored: false });
    expect(receipts.update).not.toHaveBeenCalled();
    expect(customers.maybeSingle).not.toHaveBeenCalled();
    expect(mocks.withBillingLock).not.toHaveBeenCalled();
    expect(mocks.persistSubscription).not.toHaveBeenCalled();
  });
});
