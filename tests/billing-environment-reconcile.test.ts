import { afterEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';
import { reconcileCustomer, type SubscriptionRecord } from '../src/lib/billing/reconcile';

afterEach(() => vi.unstubAllEnvs());
const choices = [{ tier: 'pro', interval: 'month', priceId: 'price_pro' }] as const;

function fixture(mode: 'test' | 'live') {
  vi.stubEnv('STRIPE_BILLING_MODE', mode);
  const live = mode === 'live';
  const record: SubscriptionRecord = {
    billing_mode: mode,
    workspace_id: 'workspace',
    stripe_customer_id: 'cus_trusted',
    stripe_subscription_id: null,
    tier: 'free',
    paid_tier: 'free',
    paid_through: null,
    checkout_session_id: null,
    checkout_attempt_id: null,
    checkout_price_id: null,
  };
  const subscription = {
    id: 'sub_pro',
    customer: 'cus_trusted',
    status: 'active',
    livemode: live,
    created: 1,
    items: {
      data: [
        {
          price: { id: 'price_pro', livemode: live },
          quantity: 1,
          current_period_end: 1_800_000_000,
        },
      ],
    },
    trial_end: null,
    cancel_at_period_end: false,
    cancel_at: null,
  };
  const invoice = { id: 'in_paid', status: 'paid', livemode: live };
  const line = {
    livemode: live,
    amount: 399,
    parent: {
      type: 'subscription_item_details',
      subscription_item_details: { subscription: 'sub_pro' },
    },
    pricing: { price_details: { price: 'price_pro' } },
    period: { end: 1_800_000_000, start: 1_799_000_000 },
  };
  const mock = {
    subscriptions: {
      list: vi.fn(async () => ({ data: [subscription], has_more: false })),
      retrieve: vi.fn(async () => subscription),
    },
    invoices: {
      list: vi.fn(async () => ({ data: [invoice] })),
      listLineItems: vi.fn(async function* () {
        yield line;
      }),
    },
  };
  const reconcile = () =>
    reconcileCustomer(mock as unknown as Stripe, record, 'personal', [...choices]);
  return { record, subscription, invoice, line, mock, reconcile };
}

describe.each(['test', 'live'] as const)('%s reconciliation isolation', (mode) => {
  it('grants paid coverage only from current matching Stripe resources', async () => {
    const { reconcile } = fixture(mode);
    expect(await reconcile()).toMatchObject({
      status: 'active',
      paid_tier: 'pro',
      paid_through: new Date(1_800_000_000_000).toISOString(),
    });
  });
  it('rejects persisted coverage from the other mode before contacting Stripe', async () => {
    const { record, mock, reconcile } = fixture(mode);
    record.billing_mode = mode === 'test' ? 'live' : 'test';
    record.paid_through = '2099-01-01T00:00:00Z';
    await expect(reconcile()).rejects.toThrow('another billing environment');
    expect(mock.subscriptions.list).not.toHaveBeenCalled();
  });
  it('rejects a subscription in the wrong mode', async () => {
    const { subscription, mock, reconcile } = fixture(mode);
    subscription.livemode = !subscription.livemode;
    await expect(reconcile()).rejects.toThrow('resource mode');
    expect(mock.invoices.list).not.toHaveBeenCalled();
  });
  it('rejects an expanded Price from the wrong mode', async () => {
    const { subscription, mock, reconcile } = fixture(mode);
    subscription.items.data[0].price.livemode = !subscription.livemode;
    await expect(reconcile()).rejects.toThrow('Unexpected subscription');
    expect(mock.invoices.list).not.toHaveBeenCalled();
  });
  it('does not grant coverage from an invoice in the other mode', async () => {
    const { invoice, mock, reconcile } = fixture(mode);
    invoice.livemode = !invoice.livemode;
    expect(await reconcile()).toMatchObject({ paid_tier: 'free', paid_through: null });
    expect(mock.invoices.listLineItems).not.toHaveBeenCalled();
  });
  it('does not grant coverage from a line in the other mode', async () => {
    const { line, reconcile } = fixture(mode);
    line.livemode = !line.livemode;
    expect(await reconcile()).toMatchObject({ paid_tier: 'free', paid_through: null });
  });
});
