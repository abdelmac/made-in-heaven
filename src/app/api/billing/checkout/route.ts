import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWorkspace, durableRateLimit } from '@/lib/server/auth';
import { assertSameOrigin, handleApiError, HttpError, readJson } from '@/lib/server/http';
import { approvedAppOrigin, configuredPrices, tierForWorkspace } from '@/lib/billing/config';
import { assertConfiguredPrice, billingConfigured, getStripe } from '@/lib/billing/stripe';
import { billingDatabase, persistSubscription, withBillingLock } from '@/lib/billing/server';
import { hasBlockingSubscription } from '@/lib/billing/entitlements';
import { objectId, type SubscriptionRecord } from '@/lib/billing/reconcile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const bodySchema = z
  .object({
    workspaceId: z.uuid(),
    tier: z.enum(['pro', 'team']),
    interval: z.enum(['month', 'year']),
  })
  .strict();

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = bodySchema.parse(await readJson(request, 4_096));
    const { user, workspace } = await requireWorkspace(body.workspaceId, { roles: ['owner'] });
    await durableRateLimit(user.id, 'billing:checkout', 10);
    if (body.tier !== tierForWorkspace(workspace.kind))
      throw new HttpError(400, 'Choose Pro for a personal workspace or Team for an organization.');
    if (!billingConfigured())
      throw new HttpError(503, 'Billing is not configured. Checkout is unavailable.');
    const choice = configuredPrices().find(
      (candidate) => candidate.tier === body.tier && candidate.interval === body.interval,
    );
    if (!choice) throw new HttpError(400, 'This plan and interval are not configured.');
    const stripe = getStripe()!;
    const price = await stripe.prices.retrieve(choice.priceId);
    assertConfiguredPrice(price, choice);
    const origin = approvedAppOrigin();
    const url = await withBillingLock(workspace.id, async (token) => {
      const db = billingDatabase();
      const { data, error } = await db
        .from('workspace_subscriptions')
        .select('*')
        .eq('workspace_id', workspace.id)
        .maybeSingle();
      if (error) throw error;
      let existing = data as SubscriptionRecord | null;
      if (data?.deletion_pending)
        throw new HttpError(
          409,
          'Account deletion is being verified. Billing changes are temporarily unavailable.',
        );
      let customerId = existing?.stripe_customer_id;
      if (!customerId) {
        const customer = await stripe.customers.create(
          {
            email: user.email,
            name: workspace.name,
            metadata: { folia_workspace_id: workspace.id },
          },
          { idempotencyKey: `folia:customer:${workspace.id}` },
        );
        customerId = customer.id;
        // Persist trusted association before any subscription can be created.
        await persistSubscription(workspace.id, token, { stripe_customer_id: customerId });
      }
      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: 'all',
        limit: 100,
      });
      if (
        subscriptions.has_more ||
        subscriptions.data.some((subscription) => hasBlockingSubscription(subscription.status))
      ) {
        throw new HttpError(
          409,
          'This workspace already has a subscription or pending payment. Manage it in the billing portal.',
        );
      }

      if (existing?.checkout_session_id) {
        const previous = await stripe.checkout.sessions.retrieve(existing.checkout_session_id);
        if (
          previous.status === 'open' &&
          previous.url &&
          existing.checkout_price_id === choice.priceId
        )
          return previous.url;
        if (previous.status === 'open') await stripe.checkout.sessions.expire(previous.id);
        if (previous.status === 'complete') {
          const subscriptionId = objectId(previous.subscription);
          const completedSubscription = subscriptionId
            ? await stripe.subscriptions.retrieve(subscriptionId)
            : null;
          if (!completedSubscription || hasBlockingSubscription(completedSubscription.status)) {
            throw new HttpError(409, 'Your checkout is being reconciled. Refresh billing shortly.');
          }
        }
        await persistSubscription(workspace.id, token, {
          checkout_session_id: null,
          checkout_attempt_id: null,
          checkout_price_id: null,
        });
        existing = existing
          ? {
              ...existing,
              checkout_attempt_id: null,
              checkout_session_id: null,
              checkout_price_id: null,
            }
          : null;
      }

      // A persisted attempt survives a crash between Stripe creation and saving
      // the session URL. Retries reuse the same Stripe idempotency key.
      if (existing?.checkout_attempt_id && existing.checkout_price_id !== choice.priceId) {
        throw new HttpError(
          409,
          'A different checkout is still being prepared. Retry its original plan first.',
        );
      }
      const attemptId = existing?.checkout_attempt_id ?? randomUUID();
      await persistSubscription(workspace.id, token, {
        checkout_attempt_id: attemptId,
        checkout_price_id: choice.priceId,
      });
      const session = await stripe.checkout.sessions.create(
        {
          mode: 'subscription',
          customer: customerId,
          client_reference_id: workspace.id,
          payment_method_types: ['card'],
          line_items: [{ price: choice.priceId, quantity: 1 }],
          subscription_data: { metadata: { folia_workspace_id: workspace.id } },
          metadata: { folia_workspace_id: workspace.id },
          success_url: `${origin}/?view=billing&checkout=success`,
          cancel_url: `${origin}/?view=billing&checkout=cancelled`,
        },
        { idempotencyKey: `folia:checkout:${workspace.id}:${attemptId}` },
      );
      if (!session.url) throw new HttpError(503, 'Stripe did not provide a checkout destination.');
      await persistSubscription(workspace.id, token, { checkout_session_id: session.id });
      return session.url;
    });
    return NextResponse.json({ url }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return handleApiError(error);
  }
}
