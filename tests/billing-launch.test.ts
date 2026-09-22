import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
import {
  assertResourceMode,
  assertStripeSecret,
  assertSubscriptionEnvironment,
  billingMode,
  stripeAccountId,
} from '../src/lib/billing/config';
import { checkoutLaunchReady } from '../src/lib/billing/launch';

// Synthetic configuration for offline validation; no identity is published or contacted.
const liveEnvironment = () => ({
  STRIPE_BILLING_MODE: 'live',
  STRIPE_ACCOUNT_ID: 'acct_launchValidation',
  NEXT_PUBLIC_APP_URL: 'https://boreal.fr',
  STRIPE_LIVE_CHECKOUT_ENABLED: 'true',
  SOLACE_COMMERCIAL_HOSTING_CONFIRMED: 'true',
  SOLACE_AUTH_EMAIL_VERIFIED: 'true',
  SOLACE_LAUNCH_REVIEWED: 'true',
  SOLACE_SELLER_NAME: 'Atelier Boréal',
  SOLACE_SELLER_ADDRESS: '42 rue des Aurores, 75000 Paris, France',
  SOLACE_SELLER_REGISTRATION: 'Registre 123456789',
  SOLACE_SUPPORT_EMAIL: 'assistance@boreal.fr',
  SOLACE_LEGAL_NOTICE_URL: 'https://boreal.fr/mentions-legales',
  SOLACE_PRIVACY_POLICY_URL: 'https://boreal.fr/confidentialite',
  SOLACE_TERMS_URL: 'https://boreal.fr/conditions',
});

afterEach(() => vi.unstubAllEnvs());

describe('billing environment isolation', () => {
  it('defaults to test and rejects an unknown mode', () => {
    expect(billingMode({})).toBe('test');
    expect(billingMode({ STRIPE_BILLING_MODE: 'live' })).toBe('live');
    for (const mode of ['', 'LIVE', 'production', 'live ']) {
      expect(() => billingMode({ STRIPE_BILLING_MODE: mode })).toThrow();
    }
  });
  it('allows a missing account in test but requires an explicit valid account in live', () => {
    expect(stripeAccountId({})).toBeNull();
    expect(stripeAccountId(liveEnvironment())).toBe('acct_launchValidation');
    for (const account of [undefined, '', 'acct_', 'cus_wrong', 'acct_has_space ', 'acct_a/b']) {
      expect(() =>
        stripeAccountId({ STRIPE_BILLING_MODE: 'live', STRIPE_ACCOUNT_ID: account }),
      ).toThrow();
    }
  });
  it.each(['test', 'live'] as const)(
    'accepts matching %s secrets and rejects opposite or public keys',
    (mode) => {
      const env = { STRIPE_BILLING_MODE: mode, STRIPE_ACCOUNT_ID: 'acct_launchValidation' };
      expect(() => assertStripeSecret(`sk_${mode}_offline_fixture`, env)).not.toThrow();
      expect(() => assertStripeSecret(`rk_${mode}_offline_fixture`, env)).not.toThrow();
      const opposite = mode === 'live' ? 'test' : 'live';
      for (const key of [
        `sk_${opposite}_offline_fixture`,
        `rk_${opposite}_offline_fixture`,
        `pk_${mode}_public`,
        '',
        `sk_${mode}_`,
        ` sk_${mode}_fixture`,
      ]) {
        expect(() => assertStripeSecret(key, env)).toThrow();
      }
      expect(() => assertResourceMode({ livemode: mode === 'live' }, mode)).not.toThrow();
      expect(() => assertResourceMode({ livemode: mode !== 'live' }, mode)).toThrow();
      expect(() => assertResourceMode({}, mode)).toThrow();
    },
  );
  it('keeps untagged legacy subscription rows confined to test', () => {
    vi.stubEnv('STRIPE_BILLING_MODE', 'test');
    expect(() => assertSubscriptionEnvironment({})).not.toThrow();
    expect(() => assertSubscriptionEnvironment({ billing_mode: 'live' })).toThrow();
    vi.stubEnv('STRIPE_BILLING_MODE', 'live');
    expect(() => assertSubscriptionEnvironment(null)).not.toThrow();
    expect(() => assertSubscriptionEnvironment({ billing_mode: 'live' })).not.toThrow();
    expect(() => assertSubscriptionEnvironment({})).toThrow();
    expect(() => assertSubscriptionEnvironment({ billing_mode: 'test' })).toThrow();
  });
});

describe('new subscription launch gate', () => {
  it('preserves test checkout while requiring the complete live launch configuration', () => {
    expect(checkoutLaunchReady({ STRIPE_BILLING_MODE: 'test' })).toBe(true);
    expect(checkoutLaunchReady(liveEnvironment())).toBe(true);
  });
  it.each([
    'STRIPE_LIVE_CHECKOUT_ENABLED',
    'SOLACE_COMMERCIAL_HOSTING_CONFIRMED',
    'SOLACE_AUTH_EMAIL_VERIFIED',
    'SOLACE_LAUNCH_REVIEWED',
  ])('requires the explicit true value for %s', (field) => {
    for (const value of [undefined, '', 'false', 'TRUE', '1', ' true ']) {
      expect(checkoutLaunchReady({ ...liveEnvironment(), [field]: value })).toBe(false);
    }
  });
  it.each([
    'SOLACE_SELLER_NAME',
    'SOLACE_SELLER_ADDRESS',
    'SOLACE_SELLER_REGISTRATION',
    'SOLACE_SUPPORT_EMAIL',
    'SOLACE_LEGAL_NOTICE_URL',
    'SOLACE_PRIVACY_POLICY_URL',
    'SOLACE_TERMS_URL',
  ])('keeps launch closed with missing or placeholder %s', (field) => {
    for (const value of [undefined, '', '   ', 'TODO', 'À compléter']) {
      expect(checkoutLaunchReady({ ...liveEnvironment(), [field]: value })).toBe(false);
    }
  });
  it.each([
    ['SOLACE_SUPPORT_EMAIL', 'assistance@example.com'],
    ['SOLACE_SUPPORT_EMAIL', 'not-an-email'],
    ['SOLACE_LEGAL_NOTICE_URL', 'http://boreal.fr/legal'],
    ['SOLACE_PRIVACY_POLICY_URL', 'https://boreal.fr/privacy?token=private'],
    ['SOLACE_TERMS_URL', 'https://example.com/terms'],
  ])('keeps launch closed with an invalid public value for %s', (field, value) => {
    expect(checkoutLaunchReady({ ...liveEnvironment(), [field]: value })).toBe(false);
  });
  it('refuses an insecure live origin and invalid account or deployment mode', () => {
    expect(
      checkoutLaunchReady({ ...liveEnvironment(), NEXT_PUBLIC_APP_URL: 'http://localhost:3000' }),
    ).toBe(false);
    for (const overrides of [
      { STRIPE_BILLING_MODE: 'production' },
      { STRIPE_ACCOUNT_ID: '' },
      { NEXT_PUBLIC_APP_URL: 'http://boreal.fr' },
      { NEXT_PUBLIC_APP_URL: 'https://boreal.fr/path' },
    ]) {
      expect(() => checkoutLaunchReady({ ...liveEnvironment(), ...overrides })).toThrow();
    }
  });
});
