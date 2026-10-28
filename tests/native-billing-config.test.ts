import { generateKeyPairSync } from 'node:crypto';
import { rootCertificates } from 'node:tls';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import {
  appleConfig,
  googleConfig,
  nativeEnvironment,
  nativePurchaseLaunchReady,
  nativePublicConfiguration,
} from '@/lib/billing/native-config';
import { APPLE_ROOT_G3_BASE64 } from '@/lib/billing/native-apple-roots';

const appleKey = generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
}).privateKey;
const googleKey = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
}).privateKey;
beforeEach(() => {
  for (const name of [
    'NATIVE_BILLING_ENVIRONMENT',
    'APPLE_IAP_ENABLED',
    'APPLE_IAP_PRODUCT_ID',
    'APPLE_IAP_APP_ID',
    'APPLE_IAP_ISSUER_ID',
    'APPLE_IAP_KEY_ID',
    'APPLE_IAP_PRIVATE_KEY',
    'APPLE_IAP_ROOT_CERTIFICATES_BASE64',
    'GOOGLE_IAP_ENABLED',
    'GOOGLE_IAP_PRODUCT_ID',
    'GOOGLE_IAP_BASE_PLAN_ID',
    'GOOGLE_IAP_SERVICE_ACCOUNT_JSON',
    'GOOGLE_IAP_PUSH_AUDIENCE',
    'GOOGLE_IAP_PUSH_SERVICE_ACCOUNT',
    'NATIVE_LIVE_PURCHASES_ENABLED',
    'SOLACE_COMMERCIAL_HOSTING_CONFIRMED',
    'SOLACE_AUTH_EMAIL_VERIFIED',
    'SOLACE_LAUNCH_REVIEWED',
    'SOLACE_SELLER_NAME',
    'SOLACE_SELLER_ADDRESS',
    'SOLACE_SELLER_REGISTRATION',
    'SOLACE_SUPPORT_EMAIL',
    'SOLACE_LEGAL_NOTICE_URL',
    'SOLACE_PRIVACY_POLICY_URL',
    'SOLACE_TERMS_URL',
    'NEXT_PUBLIC_APP_URL',
  ])
    vi.stubEnv(name, undefined);
});
afterEach(() => vi.unstubAllEnvs());
function appleEnvironment() {
  vi.stubEnv('NATIVE_BILLING_ENVIRONMENT', 'sandbox');
  vi.stubEnv('APPLE_IAP_ENABLED', 'true');
  vi.stubEnv('APPLE_IAP_PRODUCT_ID', 'pro.monthly');
  vi.stubEnv('APPLE_IAP_APP_ID', '123');
  vi.stubEnv('APPLE_IAP_ISSUER_ID', 'issuer-fixture');
  vi.stubEnv('APPLE_IAP_KEY_ID', 'key-fixture');
  vi.stubEnv('APPLE_IAP_PRIVATE_KEY', appleKey);
}
function googleEnvironment() {
  vi.stubEnv('NATIVE_BILLING_ENVIRONMENT', 'sandbox');
  vi.stubEnv('GOOGLE_IAP_ENABLED', 'true');
  vi.stubEnv('GOOGLE_IAP_PRODUCT_ID', 'pro.monthly');
  vi.stubEnv('GOOGLE_IAP_BASE_PLAN_ID', 'monthly');
  vi.stubEnv(
    'GOOGLE_IAP_SERVICE_ACCOUNT_JSON',
    JSON.stringify({ client_email: 'api@fixture.iam.gserviceaccount.com', private_key: googleKey }),
  );
  vi.stubEnv(
    'GOOGLE_IAP_PUSH_AUDIENCE',
    'https://solace.example/api/billing/native/webhooks/google',
  );
  vi.stubEnv('GOOGLE_IAP_PUSH_SERVICE_ACCOUNT', 'push@fixture.iam.gserviceaccount.com');
}
describe('native billing configuration fails closed', () => {
  it('keeps sandbox independent and production sales gated by hosting, legal and launch review', () => {
    vi.stubEnv('NATIVE_BILLING_ENVIRONMENT', 'sandbox');
    expect(nativePurchaseLaunchReady()).toBe(true);
    vi.stubEnv('NATIVE_BILLING_ENVIRONMENT', 'production');
    expect(nativePurchaseLaunchReady()).toBe(false);
    const env = {
      NATIVE_LIVE_PURCHASES_ENABLED: 'true',
      SOLACE_COMMERCIAL_HOSTING_CONFIRMED: 'true',
      SOLACE_AUTH_EMAIL_VERIFIED: 'true',
      SOLACE_LAUNCH_REVIEWED: 'true',
      NEXT_PUBLIC_APP_URL: 'https://boreal.fr',
      SOLACE_SELLER_NAME: 'Atelier Boréal',
      SOLACE_SELLER_ADDRESS: '42 rue des Aurores, 75000 Paris, France',
      SOLACE_SELLER_REGISTRATION: 'Registre 123456789',
      SOLACE_SUPPORT_EMAIL: 'assistance@boreal.fr',
      SOLACE_LEGAL_NOTICE_URL: 'https://boreal.fr/mentions-legales',
      SOLACE_PRIVACY_POLICY_URL: 'https://boreal.fr/confidentialite',
      SOLACE_TERMS_URL: 'https://boreal.fr/conditions',
    };
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    expect(nativePurchaseLaunchReady()).toBe(true);
    for (const key of [
      'NATIVE_LIVE_PURCHASES_ENABLED',
      'SOLACE_COMMERCIAL_HOSTING_CONFIRMED',
      'SOLACE_AUTH_EMAIL_VERIFIED',
      'SOLACE_LAUNCH_REVIEWED',
      'SOLACE_SELLER_ADDRESS',
    ]) {
      vi.stubEnv(key, undefined);
      expect(nativePurchaseLaunchReady()).toBe(false);
      vi.stubEnv(key, env[key as keyof typeof env]);
    }
  });
  it('does not enable either store without an explicit environment and all credentials', () => {
    expect(() => nativeEnvironment()).toThrow();
    expect(nativePublicConfiguration('ios').ready).toBe(false);
    expect(nativePublicConfiguration('android').ready).toBe(false);
    vi.stubEnv('NATIVE_BILLING_ENVIRONMENT', 'test');
    expect(() => nativeEnvironment()).toThrow();
  });
  it('uses only a pinned official Apple root with online verification configured elsewhere', () => {
    appleEnvironment();
    expect(appleConfig().roots[0]).toEqual(Buffer.from(APPLE_ROOT_G3_BASE64, 'base64'));
    vi.stubEnv(
      'APPLE_IAP_ROOT_CERTIFICATES_BASE64',
      Buffer.from(rootCertificates[0]).toString('base64'),
    );
    expect(() => appleConfig()).toThrow();
  });
  it('rejects malformed or wrong private-key algorithms before advertising purchase readiness', () => {
    appleEnvironment();
    vi.stubEnv('APPLE_IAP_PRIVATE_KEY', googleKey);
    expect(nativePublicConfiguration('ios').ready).toBe(false);
    googleEnvironment();
    vi.stubEnv(
      'GOOGLE_IAP_SERVICE_ACCOUNT_JSON',
      JSON.stringify({
        client_email: 'api@fixture.iam.gserviceaccount.com',
        private_key: appleKey,
      }),
    );
    expect(nativePublicConfiguration('android').ready).toBe(false);
  });
  it('does not disclose signing credentials or roots in public purchase configuration', () => {
    appleEnvironment();
    googleEnvironment();
    for (const platform of ['ios', 'android'] as const) {
      const config = nativePublicConfiguration(platform);
      expect(config.ready).toBe(true);
      expect(JSON.stringify(config)).not.toContain('PRIVATE KEY');
      expect(config).not.toHaveProperty('credentials');
      expect(config).not.toHaveProperty('privateKey');
      expect(config).not.toHaveProperty('roots');
    }
  });
  it('requires an HTTPS push audience and a service-account sender', () => {
    googleEnvironment();
    vi.stubEnv('GOOGLE_IAP_PUSH_AUDIENCE', 'http://solace.example');
    expect(() => googleConfig()).toThrow();
    vi.stubEnv('GOOGLE_IAP_PUSH_AUDIENCE', 'https://solace.example');
    vi.stubEnv('GOOGLE_IAP_PUSH_SERVICE_ACCOUNT', 'attacker@example.test');
    expect(() => googleConfig()).toThrow();
  });
});
