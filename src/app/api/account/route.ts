import { nativeApiOptions, withNativeApiCors } from '@/lib/server/native-route';
import type Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser, durableRateLimit } from '@/lib/server/auth';
import { getAdminSupabase } from '@/lib/supabase/server';
import {
  assertSameOrigin,
  databaseError,
  handleApiError,
  HttpError,
  readJson,
} from '@/lib/server/http';
import { billingDatabase, persistSubscription, withBillingLock } from '@/lib/billing/server';
import { getStripe, verifyStripeAccount } from '@/lib/billing/stripe';
import { assertResourceMode, assertSubscriptionEnvironment } from '@/lib/billing/config';
import { hasBlockingSubscription } from '@/lib/billing/entitlements';
import { objectId } from '@/lib/billing/reconcile';
import { requestBearerToken } from '@/lib/server/mobile-api';

async function handleGET() {
  try {
    const { supabase, user } = await requireUser();
    const { data, error } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .maybeSingle();
    if (error) throw databaseError(error);
    return NextResponse.json(
      {
        user: {
          id: user.id,
          email: user.email,
          displayName: data?.display_name || '',
          emailVerified: Boolean(user.email_confirmed_at),
        },
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return handleApiError(error);
  }
}

async function handlePUT(request: Request) {
  try {
    assertSameOrigin(request);
    const { user } = await requireUser();
    await durableRateLimit(user.id, 'account-settings', 10, 60);
    const body = z
      .object({ displayName: z.string().trim().max(100) })
      .strict()
      .parse(await readJson(request, 2000));
    const { error } = await getAdminSupabase()!
      .from('profiles')
      .upsert({ id: user.id, display_name: body.displayName });
    if (error) throw databaseError(error);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

async function handleDELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const { supabase, user } = await requireUser();
    await durableRateLimit(user.id, 'account-deletion', 3, 3600);
    z.object({ confirmation: z.literal('DELETE') })
      .strict()
      .parse(await readJson(request, 2000));
    // Recency belongs to this request's verified session. Another device signing
    // in updates user.last_sign_in_at without reauthenticating an older session.
    let accessToken = requestBearerToken(request.headers);
    if (!accessToken) {
      const { data, error } = await supabase.auth.getSession();
      if (error)
        throw new HttpError(401, 'Confirm your password again before deleting your account.');
      accessToken = data.session?.access_token ?? null;
    }
    if (!accessToken)
      throw new HttpError(401, 'Confirm your password again before deleting your account.');
    const { data: verified, error: claimsError } = await supabase.auth.getClaims(accessToken);
    const now = Date.now();
    if (
      claimsError ||
      verified?.claims.sub !== user.id ||
      typeof verified.claims.session_id !== 'string' ||
      !verified.claims.session_id ||
      !verified.claims.amr?.some((method) => {
        if (
          !method ||
          typeof method !== 'object' ||
          method.method !== 'password' ||
          typeof method.timestamp !== 'number'
        )
          return false;
        const authenticatedAt = method.timestamp * 1000;
        return (
          Number.isFinite(authenticatedAt) &&
          authenticatedAt <= now &&
          now - authenticatedAt <= 10 * 60_000
        );
      })
    )
      throw new HttpError(401, 'Confirm your password again before deleting your account.');
    const db = getAdminSupabase()!;
    // Deploying application code before the transactional privacy scrub must
    // leave deletion unavailable, including all external billing/session changes.
    let deletionReady = false;
    try {
      const { data, error } = await db.rpc('folia_account_deletion_version');
      deletionReady = !error && data === 1;
    } catch {
      // Missing migration or an unavailable database both fail closed.
    }
    if (!deletionReady)
      throw new HttpError(
        503,
        'Account deletion is temporarily unavailable. Please contact support.',
      );
    const { data: ownership, error } = await db
      .from('workspace_memberships')
      .select('workspace_id')
      .eq('user_id', user.id)
      .eq('role', 'owner');
    if (error) throw databaseError(error);
    const ids = ownership.map((item) => item.workspace_id);
    if (ids.length) {
      const { data: organizations, error: orgError } = await db
        .from('workspaces')
        .select('id')
        .in('id', ids)
        .eq('kind', 'organization');
      if (orgError) throw databaseError(orgError);
      if (organizations.length)
        throw new HttpError(
          409,
          'Transfer ownership of your organizations before deleting your account.',
        );
    }
    const removeAccount = async () => {
      // Native bearer clients have no stored Supabase session, so client
      // signOut() alone cannot revoke their refresh tokens on other devices.
      const { error: revokeError } = await db.auth.admin.signOut(accessToken, 'global');
      if (revokeError)
        throw new HttpError(
          503,
          'Sessions could not be revoked. Sign in again and retry account deletion.',
        );
      // Explicit hard deletion also cascades auth.sessions. Already issued JWTs
      // expire normally; protected application routes validate the user online.
      const { error: deleteError } = await db.auth.admin.deleteUser(user.id, false);
      if (deleteError)
        throw new HttpError(
          409,
          'Your account could not be deleted. Your sessions were signed out. Sign in again and retry; organization ownership or billing may need review.',
        );
    };
    // There is at most one personal workspace. Organization ownership was
    // rejected above; the database trigger independently checks it again.
    const personalId = ids[0];
    if (!personalId) await removeAccount();
    else
      await withBillingLock(personalId, async (token) => {
        const billingDb = billingDatabase();
        const { data: billing, error: billingError } = await billingDb
          .from('workspace_subscriptions')
          .select('*')
          .eq('workspace_id', personalId)
          .maybeSingle();
        if (billingError) throw databaseError(billingError);
        assertSubscriptionEnvironment(billing);
        // Persist a fence before external calls. New checkout stays blocked even
        // if this worker's lease expires while Auth is finishing account removal.
        await persistSubscription(personalId, token, { deletion_pending: true });
        try {
          if (billing?.stripe_customer_id) {
            const stripe = getStripe();
            if (!stripe)
              throw new HttpError(
                503,
                'Reconnect billing before deleting this account so pending checkout can be safely closed.',
              );
            await verifyStripeAccount();
            const customerId = billing.stripe_customer_id;
            const assertCustomerResource = (resource: {
              livemode: boolean;
              customer: unknown;
              metadata?: Stripe.Metadata | null;
            }) => {
              assertResourceMode(resource);
              if (
                objectId(resource.customer) !== customerId ||
                (resource.metadata?.folia_workspace_id &&
                  resource.metadata.folia_workspace_id !== personalId)
              )
                throw new HttpError(409, 'Billing ownership needs review before account deletion.');
            };
            const readSubscriptions = async () => {
              const subscriptions = await stripe.subscriptions.list({
                customer: customerId,
                status: 'all',
                limit: 100,
              });
              for (const subscription of subscriptions.data) assertCustomerResource(subscription);
              if (subscriptions.has_more)
                throw new HttpError(
                  409,
                  'Billing needs review before this account can be deleted. Please contact support.',
                );
              return subscriptions.data;
            };
            const subscriptionIds = new Set<string>();
            if (billing.stripe_subscription_id) subscriptionIds.add(billing.stripe_subscription_id);
            const closedSessions = new Set<string>();
            const closeSession = async (session: Stripe.Checkout.Session) => {
              assertCustomerResource(session);
              if (closedSessions.has(session.id)) return;
              if (session.status === 'open') {
                // Revalidate the lease immediately before every provider mutation.
                await persistSubscription(personalId, token, { deletion_pending: true });
                let expired: Stripe.Checkout.Session;
                try {
                  expired = await stripe.checkout.sessions.expire(session.id);
                } catch (error) {
                  // Completion or expiry can win the race with expire(). Only a
                  // fresh provider read of a closed session permits continuing.
                  const latest = await stripe.checkout.sessions.retrieve(session.id);
                  assertCustomerResource(latest);
                  if (!['expired', 'complete'].includes(latest.status ?? '')) throw error;
                  expired = latest;
                }
                assertCustomerResource(expired);
                session = expired;
              }
              if (!['expired', 'complete'].includes(session.status ?? ''))
                throw new HttpError(409, 'Checkout could not be verified. Retry account deletion.');
              if (session.status === 'complete') {
                const subscriptionId = objectId(session.subscription);
                if (subscriptionId) subscriptionIds.add(subscriptionId);
                else if (session.mode === 'subscription')
                  throw new HttpError(
                    409,
                    'Checkout is still completing. Retry account deletion shortly.',
                  );
              }
              closedSessions.add(session.id);
            };
            if (billing.checkout_session_id)
              await closeSession(
                await stripe.checkout.sessions.retrieve(billing.checkout_session_id),
              );
            for await (const session of stripe.checkout.sessions.list({
              customer: customerId,
              status: 'open',
              limit: 100,
            })) {
              await closeSession(session);
            }
            // Read after checkout closure to include a subscription created while
            // expiration was racing payment. Stored/checkout IDs are retrieved
            // as well, so a delayed list/webhook cannot hide an active contract.
            const subscriptions = new Map(
              (await readSubscriptions()).map((subscription) => [subscription.id, subscription]),
            );
            for (const id of subscriptionIds) {
              const subscription = await stripe.subscriptions.retrieve(id);
              assertCustomerResource(subscription);
              subscriptions.set(id, subscription);
            }
            for (const subscription of subscriptions.values()) {
              if (!hasBlockingSubscription(subscription.status)) continue;
              await persistSubscription(personalId, token, { deletion_pending: true });
              const canceled = await stripe.subscriptions.cancel(subscription.id, {
                invoice_now: false,
                prorate: false,
              });
              assertCustomerResource(canceled);
              if (canceled.status !== 'canceled')
                throw new HttpError(
                  409,
                  'Subscription cancellation is not confirmed. Retry account deletion.',
                );
            }
            if (
              (await readSubscriptions()).some((subscription) =>
                hasBlockingSubscription(subscription.status),
              )
            )
              throw new HttpError(
                409,
                'Billing is still changing. Retry account deletion shortly.',
              );
            await persistSubscription(personalId, token, {
              status: 'canceled',
              checkout_session_id: null,
              checkout_attempt_id: null,
              checkout_price_id: null,
            });
          } else {
            if (
              billing?.stripe_subscription_id ||
              billing?.checkout_session_id ||
              billing?.checkout_attempt_id
            )
              throw new HttpError(
                503,
                'Billing ownership could not be verified. Please contact support before deleting this account.',
              );
            await persistSubscription(personalId, token, {
              checkout_session_id: null,
              checkout_attempt_id: null,
              checkout_price_id: null,
            });
          }
          await removeAccount();
        } catch (error) {
          // If the lease expired, retain the pending fence. A fresh deletion retry
          // can acquire it and verify Stripe again; checkout must remain blocked.
          try {
            await persistSubscription(personalId, token, { deletion_pending: false });
          } catch {
            /* Retry deletion to resolve the retained safety fence. */
          }
          throw error;
        }
      });
    await supabase.auth.signOut({ scope: 'local' });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

export const GET = withNativeApiCors(handleGET);
export const PUT = withNativeApiCors(handlePUT);
export const DELETE = withNativeApiCors(handleDELETE);
export const OPTIONS = nativeApiOptions;
