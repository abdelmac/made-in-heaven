import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { HttpError } from '@/lib/server/http';
import { billingDatabase, getWorkspaceEntitlements, withBillingLock } from './server';
import { nativeEnvironment, nativePurchaseLaunchReady } from './native-config';
import { decodeApplePurchase, verifyAppleSubscription } from './native-apple';
import { acknowledgeGoogleSubscription, verifyGoogleSubscription } from './native-google';
import type {
  NativeProvider,
  NativePlatform,
  NativeVerificationInput,
  VerifiedNativeSubscription,
} from './native-types';

export const nativePurchaseKey = (reference: string) =>
  createHash('sha256').update(reference).digest('hex');

export async function nativeLegalEligible(userId: string): Promise<boolean> {
  const { data, error } = await billingDatabase().rpc('folia_account_legal_eligible', {
    p_user: userId,
  });
  return !error && data === true;
}

export async function assertNativeBillingEnvironment() {
  const db = billingDatabase();
  const { data, error } = await db.rpc('folia_native_billing_version');
  if (error || data !== 1) throw new HttpError(503, 'Native billing database setup is incomplete.');
  const check = await db.rpc('assert_native_billing_environment', {
    p_environment: nativeEnvironment(),
  });
  if (check.error) throw new HttpError(503, 'Native billing belongs to another environment.');
}

export async function prepareNativeBilling(userId: string, workspaceId: string) {
  if (!(await nativeLegalEligible(userId)))
    throw new HttpError(
      428,
      'Accept the current account terms and confirm online-account age eligibility first.',
    );
  await assertNativeBillingEnvironment();
  const { data, error } = await billingDatabase().rpc('prepare_native_billing', {
    p_user_id: userId,
    p_workspace_id: workspaceId,
    p_environment: nativeEnvironment(),
  });
  if (error || typeof data !== 'string')
    throw new HttpError(409, 'Native billing is unavailable for this account or workspace.');
  return data;
}

async function persistNativeState(
  userId: string,
  workspaceId: string,
  lock: string,
  state: VerifiedNativeSubscription,
) {
  const { data, error } = await billingDatabase().rpc('commit_native_billing_state', {
    p_user_id: userId,
    p_workspace_id: workspaceId,
    p_lock_token: lock,
    p_state: {
      provider: state.provider,
      environment: state.environment,
      account_token: state.appAccountToken,
      purchase_key: nativePurchaseKey(state.purchaseReference),
      purchase_reference: state.purchaseReference,
      product_id: state.productId,
      base_plan_id: state.basePlanId,
      transaction_id: state.transactionId,
      status: state.status,
      current_period_end: state.currentPeriodEnd,
      acknowledged: state.acknowledged,
      ...(state.revokedTransactionId ? { revoked_transaction_id: state.revokedTransactionId } : {}),
      ...(state.clearRevokedTransactionId
        ? { clear_revoked_transaction_id: state.clearRevokedTransactionId }
        : {}),
      ...(state.linkedPurchaseReference
        ? { linked_purchase_key: nativePurchaseKey(state.linkedPurchaseReference) }
        : {}),
    },
  });
  if (error)
    throw new HttpError(
      error.code === '23514' ? 409 : 503,
      'The verified purchase could not be saved. Retry with the same Solace account.',
    );
  const saved = z
    .object({
      status: z.enum([
        'active',
        'grace',
        'canceled',
        'expired',
        'revoked',
        'pending',
        'on_hold',
        'paused',
      ]),
      currentPeriodEnd: z.string(),
      acknowledged: z.boolean(),
    })
    .safeParse(data);
  if (!saved.success || !Number.isFinite(Date.parse(saved.data.currentPeriodEnd)))
    throw new HttpError(503, 'Saved native purchase state could not be confirmed.');
  return { ...state, ...saved.data };
}

async function verifyAndCommit(
  userId: string,
  workspaceId: string,
  provider: NativeProvider,
  reference: string,
  accountToken: string,
  lock: string,
  voidedOrderId?: string,
  reversedTransactionId?: string,
) {
  let state =
    provider === 'apple'
      ? await verifyAppleSubscription(reference, accountToken)
      : await verifyGoogleSubscription(reference, accountToken);
  if (voidedOrderId && state.transactionId === voidedOrderId)
    state = {
      ...state,
      status: 'revoked',
      currentPeriodEnd: new Date().toISOString(),
      revokedTransactionId: voidedOrderId,
    };
  if (reversedTransactionId && state.transactionId === reversedTransactionId) {
    if (
      !['active', 'grace', 'canceled'].includes(state.status) ||
      Date.parse(state.currentPeriodEnd) <= Date.now()
    )
      throw new HttpError(503, 'Apple refund reversal is awaiting current store confirmation.');
    state = { ...state, clearRevokedTransactionId: reversedTransactionId };
  }
  state = await persistNativeState(userId, workspaceId, lock, state);
  if (
    provider === 'google' &&
    !state.acknowledged &&
    ['active', 'grace', 'canceled'].includes(state.status) &&
    Date.parse(state.currentPeriodEnd) > Date.now()
  ) {
    // A failed acknowledgement leaves a durable pending-ack record. The same
    // request, RTDN and scheduled reconciliation all retry without double grants.
    await acknowledgeGoogleSubscription(reference);
    state = { ...state, acknowledged: true };
    state = await persistNativeState(userId, workspaceId, lock, state);
  }
  return state;
}

export async function verifyNativePurchase(
  userId: string,
  workspaceId: string,
  input: NativeVerificationInput,
) {
  const accountToken = await prepareNativeBilling(userId, workspaceId);
  const apple =
    input.platform === 'ios' ? await decodeApplePurchase(input.jwsRepresentation) : null;
  if (apple && apple.appAccountToken?.toLowerCase() !== accountToken.toLowerCase())
    throw new HttpError(409, 'This purchase belongs to another Solace account.');
  const state = await withBillingLock(workspaceId, (lock) =>
    verifyAndCommit(
      userId,
      workspaceId,
      input.platform === 'ios' ? 'apple' : 'google',
      apple
        ? apple.originalTransactionId!
        : (input as Extract<NativeVerificationInput, { platform: 'android' }>).purchaseToken,
      accountToken,
      lock,
    ),
  );
  return {
    verified: true as const,
    acknowledged: state.acknowledged,
    subscription: {
      provider: state.provider,
      status: state.status,
      currentPeriodEnd: state.currentPeriodEnd,
    },
    entitlements: await getWorkspaceEntitlements(workspaceId),
  };
}

export async function assertNoNativeSubscription(workspaceId: string) {
  // A rollout before the native migration must not disable established web
  // checkout: there cannot yet be native grants in that database.
  const db = billingDatabase();
  const capability = await db.rpc('folia_native_billing_version');
  if (capability.error?.code === 'PGRST202') return;
  if (capability.error || capability.data !== 1)
    throw new HttpError(503, 'Native billing state could not be checked.');
  const { data, error } = await db.rpc('has_native_subscription', { p_workspace_id: workspaceId });
  if (error) throw new HttpError(503, 'Native subscription status could not be checked.');
  if (data)
    throw new HttpError(
      409,
      'This workspace already has a store subscription. Manage it in Apple App Store or Google Play.',
    );
}

export async function nativePurchaseAvailable(workspaceId: string): Promise<boolean> {
  if (!nativePurchaseLaunchReady()) return false;
  const db = billingDatabase();
  const [native, stripe] = await Promise.all([
    db.rpc('has_native_subscription', { p_workspace_id: workspaceId }),
    db
      .from('workspace_subscriptions')
      .select(
        'stripe_subscription_id,status,checkout_session_id,checkout_attempt_id,deletion_pending',
      )
      .eq('workspace_id', workspaceId)
      .maybeSingle(),
  ]);
  if (native.error || stripe.error) return false;
  return (
    !native.data &&
    !stripe.data?.deletion_pending &&
    !stripe.data?.checkout_session_id &&
    !stripe.data?.checkout_attempt_id &&
    (!stripe.data?.stripe_subscription_id ||
      ['canceled', 'incomplete_expired'].includes(stripe.data.status))
  );
}

export async function pendingNativePurchaseIntent(workspaceId: string) {
  const { data, error } = await billingDatabase()
    .from('native_purchase_intents')
    .select('intent_id,expires_at,provider')
    .eq('workspace_id', workspaceId)
    .eq('environment', nativeEnvironment())
    .maybeSingle();
  if (error) throw new HttpError(503, 'Pending native purchase could not be checked.');
  return data
    ? {
        intentId: data.intent_id,
        expiresAt: data.expires_at,
        platform: data.provider === 'apple' ? 'ios' : 'android',
      }
    : null;
}

export async function reserveNativePurchase(
  userId: string,
  workspaceId: string,
  platform: NativePlatform,
  productId: string,
) {
  if (!nativePurchaseLaunchReady())
    throw new HttpError(503, 'New store purchases are awaiting launch review.');
  await prepareNativeBilling(userId, workspaceId);
  return withBillingLock(workspaceId, async (lock) => {
    const { data, error } = await billingDatabase().rpc('reserve_native_purchase_intent', {
      p_user_id: userId,
      p_workspace_id: workspaceId,
      p_lock_token: lock,
      p_provider: platform === 'ios' ? 'apple' : 'google',
      p_environment: nativeEnvironment(),
      p_product_id: productId,
    });
    if (error)
      throw new HttpError(
        error.code === '23514' || error.code === '23505' ? 409 : 503,
        'Another purchase or subscription must be resolved first. Restore purchases or contact support.',
      );
    const result = z.object({ intentId: z.uuid(), expiresAt: z.string() }).safeParse(data);
    if (
      !result.success ||
      !Number.isFinite(Date.parse(result.data.expiresAt)) ||
      Date.parse(result.data.expiresAt) <= Date.now()
    )
      throw new HttpError(503, 'Store purchase reservation could not be confirmed.');
    return result.data;
  });
}

/** Only an explicit owner SDK-cancellation action calls this. Unknown or pending
 * outcomes retain their durable fence even after the launch deadline. */
export async function releaseNativePurchase(userId: string, workspaceId: string, intentId: string) {
  await assertNativeBillingEnvironment();
  await withBillingLock(workspaceId, async (lock) => {
    const { error } = await billingDatabase().rpc('release_native_purchase_intent', {
      p_user_id: userId,
      p_workspace_id: workspaceId,
      p_lock_token: lock,
      p_environment: nativeEnvironment(),
      p_intent_id: intentId,
    });
    if (error) throw new HttpError(503, 'Store purchase cancellation could not be saved.');
  });
  return { released: true as const };
}

export async function refreshNativeWorkspace(userId: string, workspaceId: string) {
  await assertNativeBillingEnvironment();
  const accountToken = await prepareNativeBilling(userId, workspaceId);
  const { data, error } = await billingDatabase()
    .from('native_subscriptions')
    .select('provider,purchase_reference,verified_at')
    .eq('workspace_id', workspaceId)
    .eq('environment', nativeEnvironment())
    .in('status', ['active', 'grace', 'canceled', 'pending', 'on_hold', 'paused'])
    .lt('verified_at', new Date(Date.now() - 60_000).toISOString())
    .limit(20);
  if (error) throw new HttpError(503, 'Native subscriptions could not be refreshed.');
  if (!data?.length) return;
  await withBillingLock(workspaceId, async (lock) => {
    for (const record of data)
      await verifyAndCommit(
        userId,
        workspaceId,
        record.provider,
        record.purchase_reference,
        accountToken,
        lock,
      );
  });
}

/** Notifications never assign a receipt to whoever posts it. Store account
 * identifiers must resolve to a live, previously issued account mapping. */
export async function reconcileNativeNotification(
  provider: NativeProvider,
  reference: string,
  token?: string,
  voidedOrderId?: string,
  reversedTransactionId?: string,
) {
  await assertNativeBillingEnvironment();
  const db = billingDatabase();
  let accountToken = token;
  let workspaceId: string | undefined;
  const existing = await db
    .from('native_subscriptions')
    .select('account_token,workspace_id')
    .eq('provider', provider)
    .eq('environment', nativeEnvironment())
    .eq('purchase_key', nativePurchaseKey(reference))
    .maybeSingle();
  if (existing.error) throw new HttpError(503, 'Native purchase ownership could not be checked.');
  if (existing.data) {
    if (accountToken && accountToken.toLowerCase() !== existing.data.account_token)
      throw new HttpError(409, 'Store notification ownership mismatch.');
    accountToken = existing.data.account_token;
    workspaceId = existing.data.workspace_id;
  }
  const binding = await db
    .from('native_purchase_bindings')
    .select('account_token,retired')
    .eq('provider', provider)
    .eq('environment', nativeEnvironment())
    .eq('purchase_key', nativePurchaseKey(reference))
    .maybeSingle();
  if (binding.error) throw new HttpError(503, 'Native receipt ownership could not be checked.');
  if (binding.data?.retired) return;
  if (binding.data) {
    if (accountToken && accountToken.toLowerCase() !== binding.data.account_token)
      throw new HttpError(409, 'Store notification ownership mismatch.');
    accountToken = binding.data.account_token;
  }
  if (!accountToken && provider === 'google')
    accountToken = (await verifyGoogleSubscription(reference)).appAccountToken;
  if (!accountToken) throw new HttpError(400, 'The store notification has no account binding.');
  const account = await db
    .from('native_billing_accounts')
    .select('user_id')
    .eq('account_token', accountToken)
    .maybeSingle();
  if (account.error) throw new HttpError(503, 'Native billing account could not be checked.');
  if (!account.data?.user_id) return; // Unknown/deleted accounts cannot gain or transfer Pro.
  if (!workspaceId) {
    const workspace = await db
      .from('workspaces')
      .select('id')
      .eq('created_by', account.data.user_id)
      .eq('kind', 'personal')
      .maybeSingle();
    if (workspace.error)
      throw new HttpError(503, 'The personal workspace could not be identified.');
    workspaceId = workspace.data?.id;
  }
  if (!workspaceId) return;
  await prepareNativeBilling(account.data.user_id, workspaceId);
  await withBillingLock(workspaceId, (lock) =>
    verifyAndCommit(
      account.data!.user_id,
      workspaceId!,
      provider,
      reference,
      accountToken!,
      lock,
      voidedOrderId,
      reversedTransactionId,
    ),
  );
}

export async function reconcileNativeSubscriptions() {
  await assertNativeBillingEnvironment();
  const { data, error } = await billingDatabase()
    .from('native_subscriptions')
    .select('provider,purchase_reference,account_token')
    .eq('environment', nativeEnvironment())
    .in('status', ['active', 'grace', 'canceled', 'pending', 'on_hold', 'paused'])
    .order('verified_at', { ascending: true })
    .limit(100);
  if (error) throw new HttpError(503, 'Native reconciliation could not load subscriptions.');
  let completed = 0;
  let failed = 0;
  for (const row of data ?? []) {
    try {
      await reconcileNativeNotification(row.provider, row.purchase_reference, row.account_token);
      completed++;
    } catch {
      failed++;
    } // Never log receipt tokens, JWS or provider error payloads.
  }
  return { completed, failed, batchLimit: 100 };
}
