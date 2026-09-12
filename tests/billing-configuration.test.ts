import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';

vi.mock('server-only', () => ({}));
import { assertPortalConfiguration, portalConfigurationId } from '../src/lib/billing/portal';
import { assertConfiguredPrice, billingConfigured } from '../src/lib/billing/stripe';

const configuration = () =>
  ({
    active: true,
    livemode: false,
    features: {
      subscription_cancel: { enabled: true, mode: 'at_period_end' },
      payment_method_update: { enabled: true },
      invoice_history: { enabled: true },
      subscription_update: {
        enabled: true,
        default_allowed_updates: ['price'],
        products: [{ product: 'prod_pro', prices: ['price_proMonth', 'price_proYear'] }],
      },
    },
  }) as Stripe.BillingPortal.Configuration;

beforeEach(() => {
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_configuration_fixture');
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_configuration_fixture');
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://folia.example');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'public_fixture');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'private_fixture');
  vi.stubEnv('STRIPE_PRO_MONTH_PRICE_ID', 'price_proMonth');
  vi.stubEnv('STRIPE_PRO_YEAR_PRICE_ID', 'price_proYear');
  vi.stubEnv('STRIPE_TEAM_MONTH_PRICE_ID', 'price_teamMonth');
  vi.stubEnv('STRIPE_TEAM_YEAR_PRICE_ID', 'price_teamYear');
});
afterEach(() => vi.unstubAllEnvs());

describe('payment activation configuration', () => {
  it('requires durable cloud billing and the webhook secret before advertising availability', () => {
    expect(billingConfigured()).toBe(true);
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    expect(billingConfigured()).toBe(false);
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'private_fixture');
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '');
    expect(billingConfigured()).toBe(false);
  });
  it('rejects live keys even when all other deployment configuration is present', () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_configuration_fixture');
    expect(() => billingConfigured()).toThrow('test-mode');
  });
  it('rejects prices with a different interval, quantity model, or mode', () => {
    const price = {
      active: true,
      livemode: false,
      type: 'recurring',
      recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' },
      billing_scheme: 'per_unit',
      unit_amount: 1234,
      transform_quantity: null,
    } as Stripe.Price;
    const choice = { tier: 'pro', interval: 'month', priceId: 'price_proMonth' } as const;
    expect(() => assertConfiguredPrice(price, choice)).not.toThrow();
    expect(() => assertConfiguredPrice({ ...price, livemode: true }, choice)).toThrow();
    expect(() => assertConfiguredPrice(price, { ...choice, interval: 'year' })).toThrow();
    expect(() => assertConfiguredPrice({ ...price, billing_scheme: 'tiered' }, choice)).toThrow();
  });
});

describe('subscriber management safety', () => {
  it('accepts same-scope monthly/yearly changes with cancellation, invoices and payment recovery', () => {
    expect(() => assertPortalConfiguration(configuration(), 'pro')).not.toThrow();
    const cancelOnly = configuration();
    cancelOnly.features.subscription_update.enabled = false;
    expect(() => assertPortalConfiguration(cancelOnly, 'pro')).not.toThrow();
  });
  it.each(['subscription_cancel', 'payment_method_update', 'invoice_history'] as const)(
    'refuses checkout when the portal disables %s',
    (feature) => {
      const value = configuration();
      value.features[feature].enabled = false;
      expect(() => assertPortalConfiguration(value, 'pro')).toThrow('administrator review');
    },
  );
  it('refuses live portals, immediate cancellation, cross-scope changes and quantity changes', () => {
    const unsafe = [configuration(), configuration(), configuration(), configuration()];
    unsafe[0].livemode = true;
    unsafe[1].features.subscription_cancel.mode = 'immediately';
    unsafe[2].features.subscription_update.products![0].prices.push('price_teamMonth');
    unsafe[3].features.subscription_update.default_allowed_updates.push('quantity');
    for (const value of unsafe) expect(() => assertPortalConfiguration(value, 'pro')).toThrow();
    expect(() => assertPortalConfiguration(configuration(), 'team')).toThrow();
  });
  it('does not advertise a malformed or absent portal ID as usable', () => {
    vi.stubEnv('STRIPE_PRO_PORTAL_CONFIGURATION_ID', '');
    expect(portalConfigurationId('pro')).toBeNull();
    vi.stubEnv('STRIPE_PRO_PORTAL_CONFIGURATION_ID', 'https://untrusted.example');
    expect(portalConfigurationId('pro')).toBeNull();
    vi.stubEnv('STRIPE_PRO_PORTAL_CONFIGURATION_ID', 'bpc_fixture');
    expect(portalConfigurationId('pro')).toBe('bpc_fixture');
  });
});
