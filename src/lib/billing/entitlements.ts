import {
  DEFAULT_BILLING_POLICY,
  PLAN_FEATURES,
  type BillingPolicy,
  type BillingTier,
  type Feature,
  type PlanLimits,
  type WorkspaceKind,
  tierForWorkspace,
} from './config';

export interface TrustedSubscription {
  tier: BillingTier;
  paid_tier?: BillingTier;
  status: string;
  current_period_end: string | null;
  paid_through: string | null;
  trial_end?: string | null;
  cancel_at_period_end?: boolean;
  cancel_at?: string | null;
}

export interface Entitlements {
  tier: BillingTier;
  features: Record<Feature, boolean>;
  limits: PlanLimits;
}

function timestamp(value: string | null | undefined): number {
  const parsed = value ? Date.parse(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

// This pure function is useful for previews/tests. Connected authorization uses
// workspace_entitlements in PostgreSQL, never imported/local subscription state.
export function resolveEntitlements(
  subscription: TrustedSubscription | null,
  kind: WorkspaceKind,
  now = Date.now(),
  policy: BillingPolicy = DEFAULT_BILLING_POLICY,
): Entitlements {
  let tier: BillingTier = 'free';
  if (subscription) {
    const allowed = tierForWorkspace(kind);
    const paidTier = subscription.paid_tier ?? subscription.tier;
    const paidThrough = timestamp(subscription.paid_through);
    if (paidTier === allowed && paidThrough > now) tier = paidTier;
    else if (
      paidTier === allowed &&
      subscription.status === 'past_due' &&
      paidThrough > 0 &&
      paidThrough + Math.max(0, policy.paymentGraceDays) * 86_400_000 > now
    )
      tier = paidTier;
    else if (
      subscription.tier === allowed &&
      subscription.status === 'trialing' &&
      policy.allowTrials &&
      timestamp(subscription.trial_end) > now
    )
      tier = subscription.tier;
  }
  return { tier, features: { ...PLAN_FEATURES[tier] }, limits: { ...policy.plans[tier] } };
}

export function isWithinLimit(
  entitlements: Entitlements,
  kind: keyof PlanLimits,
  nextCount: number,
): boolean {
  const maximum = entitlements.limits[kind];
  return (
    Number.isInteger(nextCount) && nextCount >= 0 && (maximum === null || nextCount <= maximum)
  );
}

export function hasBlockingSubscription(status: string): boolean {
  return !['canceled', 'incomplete_expired'].includes(status);
}
