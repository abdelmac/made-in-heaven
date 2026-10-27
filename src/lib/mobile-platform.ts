import { Capacitor } from '@capacitor/core';

export const MOBILE_APP_ID = 'com.solace.pomodoro';
export const MOBILE_AUTH_CALLBACK = `${MOBILE_APP_ID}://auth/callback`;
export const DEFAULT_APP_ORIGIN = 'https://www.solace-pomodoro.com';

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export function isMobileBuild(): boolean {
  return process.env.NEXT_PUBLIC_SOLACE_MOBILE === 'true' || isNativeApp();
}

export function appApiOrigin(): string {
  const value = process.env.NEXT_PUBLIC_MOBILE_API_ORIGIN || DEFAULT_APP_ORIGIN;
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('Le serveur mobile doit utiliser une origine HTTPS sans chemin.');
  }
  return url.origin;
}

export function authRedirectUrl(recovery = false): string {
  if (isNativeApp()) return MOBILE_AUTH_CALLBACK;
  const callback = new URL('/auth/callback', window.location.origin);
  if (recovery) callback.searchParams.set('next', '/?reset-password=1');
  return callback.href;
}
