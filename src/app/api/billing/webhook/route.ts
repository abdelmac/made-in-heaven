import { NextResponse } from 'next/server';
import { getStripe } from '@/lib/billing/stripe';
import { billingDatabase, persistSubscription, withBillingLock } from '@/lib/billing/server';
import { reconcileCustomer, type SubscriptionRecord } from '@/lib/billing/reconcile';
import { processBillingEvent } from '@/lib/billing/webhook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const signature = request.headers.get('stripe-signature');
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret)
    return NextResponse.json(
      { error: 'Webhook signature or configuration missing.' },
      { status: 400 },
    );
  if (Number(request.headers.get('content-length') ?? '0') > 1_000_000)
    return NextResponse.json({ error: 'Event too large.' }, { status: 413 });
  let event;
  try {
    const stripe = getStripe();
    if (!stripe) return NextResponse.json({ error: 'Billing is not configured.' }, { status: 503 });
    const body = await request.text();
    if (Buffer.byteLength(body) > 1_000_000)
      return NextResponse.json({ error: 'Event too large.' }, { status: 413 });
    event = stripe.webhooks.constructEvent(body, signature, secret);
    if (event.livemode)
      return NextResponse.json({ error: 'Live billing events are disabled.' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 400 });
  }

  try {
    const db = billingDatabase();
    const result = await processBillingEvent(event, {
      async receive(received) {
        const { error } = await db
          .from('billing_events')
          .upsert(
            { event_id: received.id, event_type: received.type, status: 'pending' },
            { onConflict: 'event_id', ignoreDuplicates: true },
          );
        if (error) throw error;
        const { data, error: readError } = await db
          .from('billing_events')
          .select('status')
          .eq('event_id', received.id)
          .single();
        if (readError || !data) throw readError ?? new Error('Event receipt missing.');
        return data.status === 'processed' ? 'processed' : 'pending';
      },
      async findWorkspace(customerId) {
        const { data, error } = await db
          .from('workspace_subscriptions')
          .select('workspace_id')
          .eq('stripe_customer_id', customerId)
          .maybeSingle();
        if (error) throw error;
        return data?.workspace_id ?? null;
      },
      async acknowledge(eventId) {
        const { error } = await db
          .from('billing_events')
          .update({ status: 'processed', processed_at: new Date().toISOString(), error: null })
          .eq('event_id', eventId);
        if (error) throw error;
      },
      async reconcile(workspaceId, eventId) {
        await withBillingLock(workspaceId, async (token) => {
          const { data: existing, error } = await db
            .from('workspace_subscriptions')
            .select('*')
            .eq('workspace_id', workspaceId)
            .single();
          const { data: workspace, error: workspaceError } = await db
            .from('workspaces')
            .select('kind')
            .eq('id', workspaceId)
            .single();
          if (error || workspaceError || !existing || !workspace)
            throw error ?? workspaceError ?? new Error('Workspace not found.');
          const patch = await reconcileCustomer(
            getStripe()!,
            existing as SubscriptionRecord,
            workspace.kind,
          );
          await persistSubscription(workspaceId, token, patch, eventId);
        });
      },
    });
    return NextResponse.json({ received: true, ...result });
  } catch {
    // Do not expose personal Stripe data or secrets. Never change a processed
    // receipt back to failed when another delivery has already committed it.
    const db = billingDatabase();
    await db
      .from('billing_events')
      .update({ status: 'failed', error: 'Reconciliation failed; retry required.' })
      .eq('event_id', event.id)
      .neq('status', 'processed');
    return NextResponse.json({ error: 'Billing reconciliation will be retried.' }, { status: 503 });
  }
}
