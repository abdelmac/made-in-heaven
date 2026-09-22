export type BillingTier = 'free' | 'pro' | 'team';
export type PaidTier = Exclude<BillingTier, 'free'>;
export type BillingInterval = 'month' | 'year';
export type WorkspaceKind = 'personal' | 'organization';
export type BillingMode = 'test' | 'live';

export function billingMode(env: Record<string, string | undefined> = process.env): BillingMode {
  const value = env.STRIPE_BILLING_MODE ?? 'test';
  if (value !== 'test' && value !== 'live') throw new Error('Invalid Stripe billing mode.');
  return value;
}

export function stripeAccountId(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const value = env.STRIPE_ACCOUNT_ID;
  if (!value && billingMode(env) === 'test') return null;
  if (!value || !/^acct_[A-Za-z0-9]+$/.test(value))
    throw new Error('The Stripe account must be explicitly configured for live billing.');
  return value;
}

export function assertStripeSecret(
  key: string,
  env: Record<string, string | undefined> = process.env,
): void {
  const mode = billingMode(env);
  if (!new RegExp(`^[sr]k_${mode}_[A-Za-z0-9_]+$`).test(key))
    throw new Error(
      `Solace billing requires a ${mode}-mode secret key for the configured environment.`,
    );
  stripeAccountId(env);
}

export function matchesBillingMode(
  resource: { livemode?: boolean },
  mode = billingMode(),
): boolean {
  return resource.livemode === (mode === 'live');
}

export function assertResourceMode(resource: { livemode?: boolean }, mode = billingMode()): void {
  if (!matchesBillingMode(resource, mode))
    throw new Error('Stripe resource mode does not match this deployment.');
}

export function assertSubscriptionEnvironment(record: { billing_mode?: string } | null): void {
  if (record && (record.billing_mode ?? 'test') !== billingMode())
    throw new Error('Stored subscription belongs to another billing environment.');
}

export function formatStripeAmount(amount: number, currency: string): string {
  const formatter = new Intl.NumberFormat('fr-FR', {
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
    backgrounds: false,
    flashcards: false,
    music: false,
  },
  pro: {
    advancedAnalytics: true,
    customThemes: true,
    savedLayouts: true,
    advancedTemplates: true,
    teamWorkspaces: false,
    backgrounds: true,
    flashcards: true,
    music: true,
  },
  team: {
    advancedAnalytics: true,
    customThemes: true,
    savedLayouts: true,
    advancedTemplates: true,
    teamWorkspaces: true,
    backgrounds: true,
    flashcards: true,
    music: true,
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
    throw new Error('Solace billing accepts Stripe test-mode secret keys only.');
  }
}
