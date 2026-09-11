export type BillingTier = 'free' | 'pro' | 'team';
export type PaidTier = Exclude<BillingTier, 'free'>;
export type BillingInterval = 'month' | 'year';
export type WorkspaceKind = 'personal' | 'organization';

export function formatStripeAmount(amount: number, currency: string): string {
  const formatter = new Intl.NumberFormat('en', {
    style: 'currency',
    currency: currency.toUpperCase(),
  });
  // Stripe uses two minor digits for ISK and UGX for backwards compatibility.
  const digits = ['isk', 'ugx'].includes(currency.toLowerCase())
    ? 2
    : (formatter.resolvedOptions().maximumFractionDigits ?? 2);
  return formatter.format(amount / 10 ** digits);
}

export interface PlanLimits {
  subjects: number | null;
  tasks: number | null;
  projects: number | null;
  members: number | null;
}

export interface BillingPolicy {
  paymentGraceDays: number;
  allowTrials: boolean;
  plans: Record<BillingTier, PlanLimits>;
}

// Offline/demo fallback only. Connected enforcement reads the single billing_policy
// row installed by migration 0002; deployments change that row with a migration.
export const DEFAULT_BILLING_POLICY: BillingPolicy = {
  paymentGraceDays: 0,
  allowTrials: false,
  plans: {
    free: { subjects: 10, tasks: 100, projects: 5, members: 1 },
    pro: { subjects: null, tasks: null, projects: null, members: 1 },
    team: { subjects: null, tasks: null, projects: null, members: 25 },
  },
};

export const PLAN_FEATURES = {
  free: {
    advancedAnalytics: false,
    customThemes: false,
    savedLayouts: false,
    advancedTemplates: false,
    teamWorkspaces: false,
  },
  pro: {
    advancedAnalytics: true,
    customThemes: true,
    savedLayouts: true,
    advancedTemplates: true,
    teamWorkspaces: false,
  },
  team: {
    advancedAnalytics: true,
    customThemes: true,
    savedLayouts: true,
    advancedTemplates: true,
    teamWorkspaces: true,
  },
} as const;

export type Feature = keyof typeof PLAN_FEATURES.free;

export interface PriceChoice {
  tier: PaidTier;
  interval: BillingInterval;
  priceId: string;
}

export function configuredPrices(
  env: Record<string, string | undefined> = process.env,
): PriceChoice[] {
  const choices: PriceChoice[] = [];
  for (const tier of ['pro', 'team'] as const) {
    for (const interval of ['month', 'year'] as const) {
      const priceId =
        env[`STRIPE_${tier.toUpperCase()}_${interval.toUpperCase()}_PRICE_ID`]?.trim();
      if (priceId) {
        if (!/^price_[a-zA-Z0-9]+$/.test(priceId))
          throw new Error('A configured Stripe Price ID is invalid.');
        choices.push({ tier, interval, priceId });
      }
    }
  }
  if (new Set(choices.map((choice) => choice.priceId)).size !== choices.length) {
    throw new Error('Each billing tier and interval must have its own Stripe Price ID.');
  }
  return choices;
}

export function tierForWorkspace(kind: WorkspaceKind): PaidTier {
  return kind === 'organization' ? 'team' : 'pro';
}

export function approvedAppOrigin(env: Record<string, string | undefined> = process.env): string {
  if (!env.NEXT_PUBLIC_APP_URL)
    throw new Error('NEXT_PUBLIC_APP_URL must be configured for billing.');
  const url = new URL(env.NEXT_PUBLIC_APP_URL);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  ) {
    throw new Error('NEXT_PUBLIC_APP_URL must be an HTTPS origin (HTTP localhost is allowed).');
  }
  return url.origin;
}

export function assertTestSecret(key: string): void {
  if (!key.startsWith('sk_test_') && !key.startsWith('rk_test_')) {
    throw new Error('Folia billing accepts Stripe test-mode secret keys only.');
  }
}
