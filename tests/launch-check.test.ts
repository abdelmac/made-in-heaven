import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
import { launchChecks, onlineChecks } from '../scripts/check-launch.mjs';
import { containsStripeCredential } from '../scripts/check-secrets.mjs';

const sandbox = () => ({
  STRIPE_BILLING_MODE: 'test',
  STRIPE_SECRET_KEY: 'rk_test_unit_fixture',
  STRIPE_WEBHOOK_SECRET: 'whsec_fixture',
  STRIPE_PRO_MONTH_PRICE_ID: 'price_month',
  STRIPE_PRO_YEAR_PRICE_ID: 'price_year',
  STRIPE_PRO_PORTAL_CONFIGURATION_ID: 'bpc_portal',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  NEXT_PUBLIC_SUPABASE_URL: 'https://unit.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: `sb_publishable_${'a'.repeat(32)}`,
  SUPABASE_SERVICE_ROLE_KEY: `sb_secret_${'a'.repeat(32)}`,
});

describe('read-only launch checklist', () => {
  it('accepts complete sandbox configuration without opening live sales', () => {
    expect(launchChecks(sandbox()).every((check) => check.ok)).toBe(true);
  });
  it.each([
    { STRIPE_BILLING_MODE: 'production' },
    { STRIPE_SECRET_KEY: 'rk_live_unit_fixture' },
    { STRIPE_PRO_YEAR_PRICE_ID: '' },
    { STRIPE_PRO_YEAR_PRICE_ID: 'price_month' },
    { STRIPE_TEAM_MONTH_PRICE_ID: 'price_team' },
    { STRIPE_WEBHOOK_SECRET: '' },
    { STRIPE_PRO_PORTAL_CONFIGURATION_ID: '' },
    { NEXT_PUBLIC_APP_URL: 'http://untrusted.test' },
    { SUPABASE_SERVICE_ROLE_KEY: '' },
  ])('reports invalid or incomplete setup without exposing values (%j)', (override) => {
    const env = { ...sandbox(), ...override };
    const checks = launchChecks(env);
    expect(checks.some((check) => !check.ok)).toBe(true);
    expect(JSON.stringify(checks)).not.toContain(env.STRIPE_SECRET_KEY);
  });
  it('reports all required live attestations and seller information as missing', () => {
    const checks = launchChecks({
      ...sandbox(),
      STRIPE_BILLING_MODE: 'live',
      STRIPE_ACCOUNT_ID: 'acct_unit',
      STRIPE_SECRET_KEY: 'rk_live_unit_fixture',
      NEXT_PUBLIC_APP_URL: 'https://solace-hikmagitz.vercel.app',
    });
    expect(checks.filter((check) => !check.ok)).toHaveLength(5);
  });
  it('does not start provider inspection without a valid mode/key pair', async () => {
    expect(await onlineChecks({})).toEqual([
      { name: 'Contrôles distants : configuration Stripe valide requise', ok: false },
    ]);
  });
});

describe('credential exposure guard', () => {
  it.each(['sk_test_', 'rk_test_', 'sk_live_', 'rk_live_', 'whsec_'])(
    'recognizes an accidental %s credential without printing it',
    (prefix) => expect(containsStripeCredential(`${prefix}${'x'.repeat(50)}`)).toBe(true),
  );
  it('allows blank settings, resource IDs and short documentation placeholders', () => {
    expect(containsStripeCredential('STRIPE_SECRET_KEY=\nprice_123\nbpc_123\nsk_live_...')).toBe(
      false,
    );
  });
  it('keeps the committed example free of Stripe secrets', () => {
    const content = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
    expect(containsStripeCredential(content)).toBe(false);
  });
});
