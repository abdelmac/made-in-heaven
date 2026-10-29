import { Capacitor } from '@capacitor/core';
import { nativeAuthCallbackForPlatform } from './native-identity';

export const DEFAULT_APP_ORIGIN = 'https://www.solace-pomodoro.com';

export function nativeAuthCallback(): string | null {
  return nativeAuthCallbackForPlatform(Capacitor.getPlatform());
}

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
  if (isNativeApp()) {
    const callback = nativeAuthCallback();
    if (!callback) throw new Error('La connexion n’est pas disponible sur cette plateforme.');
    return callback;
  }
  const callback = new URL('/auth/callback', window.location.origin);
  if (recovery) callback.searchParams.set('next', '/?reset-password=1');
  return callback.href;
}
