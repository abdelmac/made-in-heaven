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
import { getStripe } from '@/lib/billing/stripe';
import { hasBlockingSubscription } from '@/lib/billing/entitlements';

export async function GET() {
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

export async function PUT(request: Request) {
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

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const { supabase, user } = await requireUser();
    await durableRateLimit(user.id, 'account-deletion', 3, 3600);
    z.object({ confirmation: z.literal('DELETE') })
      .strict()
      .parse(await readJson(request, 2000));
    if (!user.last_sign_in_at || Date.now() - Date.parse(user.last_sign_in_at) > 10 * 60_000)
      throw new HttpError(401, 'Sign out and sign in again before deleting your account.');
    const db = getAdminSupabase()!;
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
      const { data: subscriptions, error: subscriptionError } = await db
        .from('workspace_subscriptions')
        .select('status,stripe_subscription_id')
        .in('workspace_id', ids);
      if (subscriptionError) throw databaseError(subscriptionError);
      if (
        subscriptions.some(
          (subscription) =>
            subscription.stripe_subscription_id &&
            !['canceled', 'incomplete_expired'].includes(subscription.status),
        )
      )
        throw new HttpError(
          409,
          'Cancel your subscription and wait for it to end before deleting your account. You can export your data now.',
        );
    }
    const removeAccount = async () => {
      const { error: deleteError } = await db.auth.admin.deleteUser(user.id);
      if (deleteError)
        throw new HttpError(
          409,
          'Your account could not be deleted. Check organization ownership and active subscriptions, then try again.',
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
            const verifyNoSubscription = async () => {
              const subscriptions = await stripe.subscriptions.list({
                customer: billing.stripe_customer_id,
                status: 'all',
                limit: 100,
              });
              if (
                subscriptions.has_more ||
                subscriptions.data.some((subscription) =>
                  hasBlockingSubscription(subscription.status),
                )
              )
                throw new HttpError(
                  409,
                  'Cancel your subscription and wait for it to end before deleting your account.',
                );
            };
            await verifyNoSubscription();
            for await (const session of stripe.checkout.sessions.list({
              customer: billing.stripe_customer_id,
              status: 'open',
              limit: 100,
            })) {
              await stripe.checkout.sessions.expire(session.id);
            }
            // A checkout may have completed between the first read and expiration.
            await verifyNoSubscription();
            await persistSubscription(personalId, token, {
              status: 'canceled',
              checkout_session_id: null,
              checkout_attempt_id: null,
              checkout_price_id: null,
            });
          } else {
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
