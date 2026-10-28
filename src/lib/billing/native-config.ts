import 'server-only';
import { createHash, createPrivateKey, X509Certificate } from 'node:crypto';
import { HttpError } from '@/lib/server/http';
import type { NativeEnvironment, NativePlatform } from './native-types';
import { APPLE_ROOT_G3_BASE64, APPLE_ROOT_SHA256 } from './native-apple-roots';
import { launchInformationReady } from '@/lib/launch-config';
import { approvedAppOrigin } from './config';

export const NATIVE_APP_ID = 'com.solace.pomodoro';
export const NATIVE_VERIFICATION_MAX_AGE_MS = 24 * 60 * 60 * 1_000;

export function nativeEnvironment(): NativeEnvironment {
  const value = process.env.NATIVE_BILLING_ENVIRONMENT;
  if (value !== 'sandbox' && value !== 'production')
    throw new HttpError(503, 'Native store billing is not configured.');
  return value;
}

/** Pausing new production purchases does not disable restores or notifications. */
export function nativePurchaseLaunchReady(): boolean {
  if (nativeEnvironment() === 'sandbox') return true;
  try {
    return (
      process.env.NATIVE_LIVE_PURCHASES_ENABLED === 'true' &&
      process.env.SOLACE_COMMERCIAL_HOSTING_CONFIRMED === 'true' &&
      process.env.SOLACE_AUTH_EMAIL_VERIFIED === 'true' &&
      process.env.SOLACE_LAUNCH_REVIEWED === 'true' &&
      new URL(approvedAppOrigin()).protocol === 'https:' &&
      launchInformationReady()
    );
  } catch {
    return false;
  }
}

const required = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new HttpError(503, 'Native store billing is not configured.');
  return value;
};

export function appleConfig() {
  const environment = nativeEnvironment();
  if (process.env.APPLE_IAP_ENABLED !== 'true')
    throw new HttpError(503, 'Apple purchases are not available yet.');
  const appAppleId = Number(process.env.APPLE_IAP_APP_ID);
  if (!Number.isSafeInteger(appAppleId) || appAppleId <= 0)
    throw new HttpError(503, 'Apple app identity is not configured.');
  // DER roots must be obtained from Apple's PKI, never from an incoming JWS.
  const roots = (process.env.APPLE_IAP_ROOT_CERTIFICATES_BASE64?.trim() || APPLE_ROOT_G3_BASE64)
    .split(',')
    .map((value) => Buffer.from(value.trim(), 'base64'));
  try {
    if (
      !roots.length ||
      roots.some(
        (root) =>
          !new X509Certificate(root).ca ||
          !APPLE_ROOT_SHA256.has(createHash('sha256').update(root).digest('hex')),
      )
    )
      throw new Error();
  } catch {
    throw new HttpError(503, 'Apple certificate roots are not configured.');
  }
  const privateKey = required('APPLE_IAP_PRIVATE_KEY').replace(/\\n/g, '\n');
  try {
    const key = createPrivateKey(privateKey);
    if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1')
      throw new Error();
  } catch {
    throw new HttpError(503, 'Apple signing credentials are invalid.');
  }
  return {
    environment,
    appAppleId,
    bundleId: NATIVE_APP_ID,
    productId: required('APPLE_IAP_PRODUCT_ID'),
    issuerId: required('APPLE_IAP_ISSUER_ID'),
    keyId: required('APPLE_IAP_KEY_ID'),
    privateKey,
    roots,
  };
}

export function googleConfig() {
  const environment = nativeEnvironment();
  if (process.env.GOOGLE_IAP_ENABLED !== 'true')
    throw new HttpError(503, 'Google Play purchases are not available yet.');
  let credentials: { client_email: string; private_key: string };
  try {
    credentials = JSON.parse(required('GOOGLE_IAP_SERVICE_ACCOUNT_JSON'));
    if (!credentials.client_email?.endsWith('.gserviceaccount.com') || !credentials.private_key)
      throw new Error();
    if (createPrivateKey(credentials.private_key).asymmetricKeyType !== 'rsa') throw new Error();
  } catch {
    throw new HttpError(503, 'Google Play verification credentials are not configured.');
  }
  const pushAudience = required('GOOGLE_IAP_PUSH_AUDIENCE');
  const pushServiceAccount = required('GOOGLE_IAP_PUSH_SERVICE_ACCOUNT');
  try {
    if (
      new URL(pushAudience).protocol !== 'https:' ||
      !pushServiceAccount.endsWith('.gserviceaccount.com')
    )
      throw new Error();
  } catch {
    throw new HttpError(503, 'Google Pub/Sub verification identity is invalid.');
  }
  return {
    environment,
    packageName: NATIVE_APP_ID,
    productId: required('GOOGLE_IAP_PRODUCT_ID'),
    basePlanId: required('GOOGLE_IAP_BASE_PLAN_ID'),
    credentials,
    pushAudience,
    pushServiceAccount,
  };
}

export function nativePublicConfiguration(platform: NativePlatform) {
  try {
    const config = platform === 'ios' ? appleConfig() : googleConfig();
    return {
      ready: true,
      platform,
      environment: config.environment,
      productId: config.productId,
      basePlanId: 'basePlanId' in config ? config.basePlanId : null,
    };
  } catch {
    return {
      ready: false,
      platform,
      environment:
        process.env.NATIVE_BILLING_ENVIRONMENT === 'production' ? 'production' : 'sandbox',
      productId: null,
      basePlanId: null,
    };
  }
}
