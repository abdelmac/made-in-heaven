import type Stripe from 'stripe';
import { objectId } from './reconcile';

export const BILLING_EVENT_TYPES = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'invoice.paid',
  'invoice.payment_failed',
  'invoice.payment_action_required',
  'invoice.voided',
  'invoice.marked_uncollectible',
]);

export interface BillingEventStore {
  receive(event: { id: string; type: string }): Promise<'pending' | 'processed'>;
  findWorkspace(customerId: string): Promise<string | null>;
  acknowledge(eventId: string): Promise<void>;
  reconcile(workspaceId: string, eventId: string): Promise<void>;
}

// receive must be durable; reconcile atomically commits state + processed receipt.
// A processing failure propagates (non-2xx), allowing Stripe's retry mechanism.
export async function processBillingEvent(
  event: Stripe.Event,
  store: BillingEventStore,
): Promise<{ duplicate: boolean; ignored: boolean }> {
  if (event.livemode) throw new Error('Live billing events are disabled.');
  const receipt = await store.receive(event);
  if (receipt === 'processed') return { duplicate: true, ignored: false };
  if (!BILLING_EVENT_TYPES.has(event.type)) {
    await store.acknowledge(event.id);
    return { duplicate: false, ignored: true };
  }
  const object = event.data.object as unknown as Record<string, unknown>;
  const customerId = objectId(object.customer);
  const workspaceId = customerId ? await store.findWorkspace(customerId) : null;
  if (!workspaceId) {
    await store.acknowledge(event.id);
    return { duplicate: false, ignored: true };
  }
  await store.reconcile(workspaceId, event.id);
  return { duplicate: false, ignored: false };
}
