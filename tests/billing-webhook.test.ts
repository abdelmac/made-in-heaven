import { describe, expect, it, vi } from 'vitest';
import Stripe from 'stripe';
import { processBillingEvent, type BillingEventStore } from '../src/lib/billing/webhook';
import {
  paidLinePeriodEnd,
  reconcileCustomer,
  type SubscriptionRecord,
} from '../src/lib/billing/reconcile';

const stripe = new Stripe('sk_test_not_a_real_key');
const secret = 'whsec_unit_test_only';
const event = (id: string, type = 'customer.subscription.updated', created = 1) =>
  ({
    id,
    type,
    created,
    livemode: false,
    data: {
      object: { customer: 'cus_trusted', metadata: { folia_workspace_id: 'untrusted_workspace' } },
    },
  }) as unknown as Stripe.Event;

function memoryStore() {
  const received = new Map<string, 'pending' | 'processed'>();
  const store: BillingEventStore = {
    receive: vi.fn(async (receipt) => {
      const state = received.get(receipt.id) ?? 'pending';
      received.set(receipt.id, state);
      return state;
    }),
    findWorkspace: vi.fn(async (customer) =>
      customer === 'cus_trusted' ? 'trusted_workspace' : null,
    ),
    acknowledge: vi.fn(async (id) => {
      received.set(id, 'processed');
    }),
    reconcile: vi.fn(async (_workspace, id) => {
      received.set(id, 'processed');
    }),
  };
  return { store, received };
}

describe('verified durable webhooks', () => {
  it('rejects invalid signatures and a changed raw body', () => {
    const payload = JSON.stringify(event('evt_signed'));
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
    expect(stripe.webhooks.constructEvent(payload, signature, secret).id).toBe('evt_signed');
    expect(() => stripe.webhooks.constructEvent(payload + ' ', signature, secret)).toThrow();
    expect(() => stripe.webhooks.constructEvent(payload, signature, 'whsec_wrong')).toThrow();
  });
  it('does not apply a duplicate delivery twice', async () => {
    const { store } = memoryStore();
    await processBillingEvent(event('evt_duplicate'), store);
    expect(await processBillingEvent(event('evt_duplicate'), store)).toEqual({
      duplicate: true,
      ignored: false,
    });
    expect(store.reconcile).toHaveBeenCalledTimes(1);
  });
  it('does not acknowledge failed processing and permits a successful retry', async () => {
    const { store, received } = memoryStore();
    vi.mocked(store.reconcile).mockRejectedValueOnce(new Error('Database unavailable'));
    await expect(processBillingEvent(event('evt_retry'), store)).rejects.toThrow(/Database/);
    expect(received.get('evt_retry')).toBe('pending');
    await processBillingEvent(event('evt_retry'), store);
    expect(received.get('evt_retry')).toBe('processed');
  });
  it('does not process or acknowledge before durable receipt is accepted', async () => {
    const { store } = memoryStore();
    vi.mocked(store.receive).mockRejectedValue(new Error('Receipt unavailable'));
    await expect(processBillingEvent(event('evt_noreceipt'), store)).rejects.toThrow();
    expect(store.reconcile).not.toHaveBeenCalled();
    expect(store.acknowledge).not.toHaveBeenCalled();
  });
  it('uses the trusted customer association instead of event workspace metadata', async () => {
    const { store } = memoryStore();
    await processBillingEvent(event('evt_scope'), store);
    expect(store.reconcile).toHaveBeenCalledWith('trusted_workspace', 'evt_scope');
  });
  it('rejects live events before recording or changing anything', async () => {
    const { store } = memoryStore();
    await expect(
      processBillingEvent({ ...event('evt_live'), livemode: true }, store),
    ).rejects.toThrow(/Live/);
    expect(store.receive).not.toHaveBeenCalled();
  });
  it('reconciles fresh state for both new and out-of-order old events', async () => {
    const { store } = memoryStore();
    let currentStripeState = 'active';
    let applied = '';
    store.reconcile = vi.fn(async () => {
      applied = currentStripeState;
    });
    await processBillingEvent(event('evt_new', 'invoice.paid', 200), store);
    expect(applied).toBe('active');
    currentStripeState = 'canceled';
    await processBillingEvent(event('evt_old', 'customer.subscription.created', 100), store);
    expect(applied).toBe('canceled');
  });
});

const existing: SubscriptionRecord = {
  workspace_id: 'workspace',
  stripe_customer_id: 'cus_trusted',
  stripe_subscription_id: 'sub_plan',
  tier: 'pro',
  paid_tier: 'pro',
  paid_through: '2026-04-01T00:00:00Z',
  checkout_attempt_id: null,
  checkout_session_id: null,
  checkout_price_id: null,
};
const choices = [{ tier: 'pro' as const, interval: 'month' as const, priceId: 'price_pro' }];
const line = (overrides = {}) =>
  ({
    livemode: false,
    amount: 100,
    parent: {
      type: 'subscription_item_details',
      subscription_item_details: { subscription: 'sub_plan' },
    },
    pricing: { price_details: { price: 'price_pro' } },
    period: { end: 1_800_000_000, start: 1_799_000_000 },
    ...overrides,
  }) as unknown as Stripe.InvoiceLineItem;

describe('current Stripe reconciliation', () => {
  it('only treats paid subscription lines for allowlisted prices as paid coverage', () => {
    expect(paidLinePeriodEnd(line(), 'sub_plan', new Set(['price_pro']))).toBe(1_800_000_000);
    expect(paidLinePeriodEnd(line({ amount: -100 }), 'sub_plan', new Set(['price_pro']))).toBe(0);
    expect(paidLinePeriodEnd(line(), 'sub_other', new Set(['price_pro']))).toBe(0);
    expect(paidLinePeriodEnd(line(), 'sub_plan', new Set(['price_untrusted']))).toBe(0);
    expect(paidLinePeriodEnd(line({ livemode: true }), 'sub_plan', new Set(['price_pro']))).toBe(0);
  });
  it('retrieves latest subscription, retains paid access on failure, and never mutates source state', async () => {
    const current = {
      id: 'sub_plan',
      customer: 'cus_trusted',
      status: 'past_due',
      livemode: false,
      created: 1,
      items: {
        data: [
          {
            price: { id: 'price_pro', livemode: false },
            quantity: 1,
            current_period_end: 1_800_000_000,
          },
        ],
      },
      trial_end: null,
      cancel_at_period_end: false,
      cancel_at: null,
    };
    const mock = {
      subscriptions: {
        list: vi.fn(async () => ({ data: [{ ...current, status: 'active' }], has_more: false })),
        retrieve: vi.fn(async () => current),
      },
      invoices: { list: vi.fn(async () => ({ data: [] })) },
    } as unknown as Stripe;
    const before = structuredClone(existing);
    const result = await reconcileCustomer(mock, existing, 'personal', choices);
    expect(result.status).toBe('past_due');
    expect(Date.parse(result.paid_through as string)).toBe(Date.parse(existing.paid_through!));
    expect(existing).toEqual(before);
    expect(mock.subscriptions.retrieve).toHaveBeenCalledWith('sub_plan');
  });
  it('refuses multiple active subscriptions without assigning extra entitlements', async () => {
    const mock = {
      subscriptions: {
        list: vi.fn(async () => ({
          data: [
            { status: 'active', livemode: false },
            { status: 'incomplete', livemode: false },
          ],
          has_more: false,
        })),
      },
    } as unknown as Stripe;
    await expect(reconcileCustomer(mock, existing, 'personal', choices)).rejects.toThrow(
      /Multiple/,
    );
  });
});
