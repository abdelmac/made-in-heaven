import { describe, expect, it } from 'vitest';
import {
  approvedAppOrigin,
  assertTestSecret,
  configuredPrices,
  DEFAULT_BILLING_POLICY,
} from '../src/lib/billing/config';
import {
  hasBlockingSubscription,
  isWithinLimit,
  resolveEntitlements,
  type TrustedSubscription,
} from '../src/lib/billing/entitlements';

const now = Date.parse('2026-03-10T12:00:00Z');
const subscription: TrustedSubscription = {
  tier: 'pro',
  paid_tier: 'pro',
  status: 'active',
  current_period_end: '2026-04-01T00:00:00Z',
  paid_through: '2026-04-01T00:00:00Z',
};

describe('server entitlement policy', () => {
  it('never grants access for an active label without verified paid coverage', () => {
    expect(resolveEntitlements({ ...subscription, paid_through: null }, 'personal', now).tier).toBe(
      'free',
    );
    expect(
      resolveEntitlements(
        { ...subscription, status: 'incomplete', paid_through: null },
        'personal',
        now,
      ).tier,
    ).toBe('free');
  });
  it('preserves paid-period access after payment failure and cancellation, with an exact expiry boundary', () => {
    for (const status of ['past_due', 'canceled', 'unpaid'])
      expect(resolveEntitlements({ ...subscription, status }, 'personal', now).tier).toBe('pro');
    expect(
      resolveEntitlements(subscription, 'personal', Date.parse(subscription.paid_through!)).tier,
    ).toBe('free');
  });
  it('has no default grace and only grants configured grace for failed renewal', () => {
    const lapsed = { ...subscription, status: 'past_due', paid_through: '2026-03-09T12:00:00Z' };
    expect(resolveEntitlements(lapsed, 'personal', now).tier).toBe('free');
    const policy = { ...DEFAULT_BILLING_POLICY, paymentGraceDays: 3 };
    expect(resolveEntitlements(lapsed, 'personal', now, policy).tier).toBe('pro');
    expect(
      resolveEntitlements({ ...lapsed, status: 'canceled' }, 'personal', now, policy).tier,
    ).toBe('free');
    expect(
      resolveEntitlements({ ...lapsed, paid_through: null }, 'personal', now, policy).tier,
    ).toBe('free');
  });
  it('disables trials by default and scopes optional trials to their end date', () => {
    const trial = {
      ...subscription,
      paid_through: null,
      status: 'trialing',
      trial_end: '2026-03-11T00:00:00Z',
    };
    expect(resolveEntitlements(trial, 'personal', now).tier).toBe('free');
    expect(
      resolveEntitlements(trial, 'personal', now, { ...DEFAULT_BILLING_POLICY, allowTrials: true })
        .tier,
    ).toBe('pro');
  });
  it('never upgrades a personal workspace through a Team subscription', () => {
    const team = { ...subscription, tier: 'team' as const, paid_tier: 'team' as const };
    expect(resolveEntitlements(team, 'personal', now).tier).toBe('free');
    expect(resolveEntitlements(team, 'organization', now).features.teamWorkspaces).toBe(true);
    expect(resolveEntitlements(subscription, 'organization', now).tier).toBe('free');
  });
  it('rejects invalid timestamps and negative counts, and supports unlimited configured limits', () => {
    expect(
      resolveEntitlements({ ...subscription, paid_through: 'nonsense' }, 'personal', now).tier,
    ).toBe('free');
    const free = resolveEntitlements(null, 'personal', now);
    expect(isWithinLimit(free, 'subjects', 10)).toBe(true);
    expect(isWithinLimit(free, 'subjects', 11)).toBe(false);
    expect(isWithinLimit(free, 'subjects', -1)).toBe(false);
    expect(
      isWithinLimit(resolveEntitlements(subscription, 'personal', now), 'subjects', 1000),
    ).toBe(true);
  });
  it('downgrade calculations do not mutate productivity or subscription records', () => {
    const workspace = {
      tasks: [{ id: 'task-1', title: 'Preserved work' }],
      subscription: { ...subscription },
    };
    const before = structuredClone(workspace);
    resolveEntitlements(workspace.subscription, 'personal', Date.parse('2027-01-01T00:00:00Z'));
    expect(workspace).toEqual(before);
  });
  it('blocks duplicate subscriptions while payment is incomplete, past due, unpaid, or paused', () => {
    for (const status of ['active', 'incomplete', 'past_due', 'unpaid', 'paused', 'trialing'])
      expect(hasBlockingSubscription(status)).toBe(true);
    expect(hasBlockingSubscription('canceled')).toBe(false);
    expect(hasBlockingSubscription('incomplete_expired')).toBe(false);
  });
});

describe('billing configuration trust boundary', () => {
  it('accepts only test keys', () => {
    expect(() => assertTestSecret('sk_test_example')).not.toThrow();
    expect(() => assertTestSecret('sk_live_example')).toThrow(/test-mode/);
    expect(() => assertTestSecret('pk_test_example')).toThrow();
  });
  it('uses an explicit price allowlist without fabricated defaults', () => {
    expect(configuredPrices({})).toEqual([]);
    expect(configuredPrices({ STRIPE_PRO_MONTH_PRICE_ID: 'price_month' })).toEqual([
      { tier: 'pro', interval: 'month', priceId: 'price_month' },
    ]);
    expect(() =>
      configuredPrices({
        STRIPE_PRO_MONTH_PRICE_ID: 'price_same',
        STRIPE_TEAM_YEAR_PRICE_ID: 'price_same',
      }),
    ).toThrow(/own/);
    expect(() => configuredPrices({ STRIPE_PRO_MONTH_PRICE_ID: 'https://evil.example' })).toThrow();
  });
  it('restricts return URLs to configured secure origins', () => {
    expect(approvedAppOrigin({ NEXT_PUBLIC_APP_URL: 'http://localhost:3000' })).toBe(
      'http://localhost:3000',
    );
    expect(approvedAppOrigin({ NEXT_PUBLIC_APP_URL: 'https://folia.example' })).toBe(
      'https://folia.example',
    );
    for (const value of [
      'http://folia.example',
      'https://folia.example/redirect',
      'https://user:pass@folia.example',
      'https://folia.example/?next=https://evil.example',
    ]) {
      expect(() => approvedAppOrigin({ NEXT_PUBLIC_APP_URL: value })).toThrow();
    }
  });
});
