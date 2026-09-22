import type Stripe from 'stripe';
import {
  assertResourceMode,
  assertSubscriptionEnvironment,
  configuredPrices,
  matchesBillingMode,
  tierForWorkspace,
  type PriceChoice,
  type WorkspaceKind,
} from './config';
import { hasBlockingSubscription } from './entitlements';

export interface SubscriptionRecord {
  billing_mode?: 'test' | 'live';
  workspace_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  tier: string;
  paid_tier: string;
  paid_through: string | null;
  checkout_session_id: string | null;
  checkout_attempt_id: string | null;
  checkout_price_id: string | null;
}

export function objectId(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'id' in value && typeof value.id === 'string')
    return value.id;
  return null;
}

function iso(seconds: number | null | undefined): string | null {
  return seconds && Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : null;
}

export function recognizedSubscription(
  subscription: Stripe.Subscription,
  choices: PriceChoice[],
  kind: WorkspaceKind,
): PriceChoice {
  const item = subscription.items.data[0];
  const choice =
    item &&
    choices.find(
      (candidate) =>
        candidate.priceId === item.price.id && candidate.tier === tierForWorkspace(kind),
    );
  if (
    !matchesBillingMode(subscription) ||
    !item ||
    !matchesBillingMode(item.price) ||
    subscription.items.data.length !== 1 ||
    item?.quantity !== 1 ||
    !choice
  ) {
    throw new Error('Unexpected subscription configuration; billing access was not changed.');
  }
  return choice;
}

export function paidLinePeriodEnd(
  line: Stripe.InvoiceLineItem,
  subscriptionId: string,
  allowedPriceIds: Set<string>,
): number {
  const parent = line.parent;
  const lineSubscription =
    parent?.type === 'subscription_item_details'
      ? objectId(parent.subscription_item_details?.subscription)
      : objectId(parent?.invoice_item_details?.subscription);
  const priceId = objectId(line.pricing?.price_details?.price);
  if (
    !matchesBillingMode(line) ||
    lineSubscription !== subscriptionId ||
    !priceId ||
    !allowedPriceIds.has(priceId) ||
    line.amount < 0
  )
    return 0;
  return line.period.end;
}

// Ignore the webhook's historical snapshot. Under a fenced workspace lock, read
// the current customer/subscription/payment resources directly from Stripe.
export async function reconcileCustomer(
  stripe: Stripe,
  existing: SubscriptionRecord,
  kind: WorkspaceKind,
  choices = configuredPrices(),
): Promise<Record<string, unknown>> {
  assertSubscriptionEnvironment(existing);
  if (!existing.stripe_customer_id)
    throw new Error('The workspace has no trusted Stripe customer.');
  const subscriptions = await stripe.subscriptions.list({
    customer: existing.stripe_customer_id,
    status: 'all',
    limit: 100,
  });
  for (const subscription of subscriptions.data) assertResourceMode(subscription);
  if (subscriptions.has_more)
    throw new Error('Unexpected number of workspace subscriptions; manual review required.');
  const blocking = subscriptions.data.filter((subscription) =>
    hasBlockingSubscription(subscription.status),
  );
  if (blocking.length > 1)
    throw new Error('Multiple subscriptions need billing administrator review.');
  const selected = blocking[0] ?? subscriptions.data.toSorted((a, b) => b.created - a.created)[0];
  if (!selected) return { status: 'none', tier: 'free', stripe_subscription_id: null };

  // Retrieve after listing, so cancellation/renewal during list is not missed.
  const subscription = await stripe.subscriptions.retrieve(selected.id);
  const choice = recognizedSubscription(subscription, choices, kind);
  if (objectId(subscription.customer) !== existing.stripe_customer_id)
    throw new Error('Subscription customer mismatch.');
  const previousPaidThrough = existing.paid_through ? Date.parse(existing.paid_through) / 1000 : 0;
  let paidThrough = Number.isFinite(previousPaidThrough) ? previousPaidThrough : 0;
  const allowed = new Set(
    choices
      .filter((candidate) => candidate.tier === tierForWorkspace(kind))
      .map((candidate) => candidate.priceId),
  );
  const paidInvoices = await stripe.invoices.list({
    customer: existing.stripe_customer_id,
    subscription: subscription.id,
    status: 'paid',
    limit: 10,
  });
  for (const invoice of paidInvoices.data) {
    if (!matchesBillingMode(invoice) || invoice.status !== 'paid') continue;
    // First 10 recent paid invoices cover current periods; prior paid coverage is
    // retained durably. Fetch all lines so prorations cannot hide the actual plan.
    for await (const line of stripe.invoices.listLineItems(invoice.id, { limit: 100 })) {
      paidThrough = Math.max(paidThrough, paidLinePeriodEnd(line, subscription.id, allowed));
    }
  }
  return {
    stripe_subscription_id: subscription.id,
    tier: choice.tier,
    paid_tier: paidThrough > 0 ? choice.tier : 'free',
    status: subscription.status,
    price_id: choice.priceId,
    current_period_end: iso(subscription.items.data[0].current_period_end),
    paid_through: iso(paidThrough),
    trial_end: iso(subscription.trial_end),
    cancel_at_period_end: subscription.cancel_at_period_end,
    cancel_at: iso(subscription.cancel_at),
  };
}
