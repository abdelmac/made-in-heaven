import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ANDROID_APP_ID,
  IOS_APP_ID,
  nativeAuthCallbackForPlatform,
} from '../src/lib/native-identity';
const platform = vi.hoisted(() => ({ name: 'android', native: true }));
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => platform.native,
    getPlatform: () => platform.name,
  },
}));
import { authRedirectUrl, nativeAuthCallback } from '../src/lib/mobile-platform';

beforeEach(() => {
  platform.name = 'android';
  platform.native = true;
});
describe('native store and callback identities', () => {
  it('keeps Android Play identity and iOS bundle identity separate', () => {
    expect(ANDROID_APP_ID).toBe('com.solacepomodoro.myapp');
    expect(IOS_APP_ID).toBe('com.solace.pomodoro');
    expect(nativeAuthCallback()).toBe('com.solacepomodoro.myapp://auth/callback');
    expect(authRedirectUrl()).toBe(nativeAuthCallback());
    expect(authRedirectUrl(true)).toBe(nativeAuthCallback());
    platform.name = 'ios';
    expect(nativeAuthCallback()).toBe('com.solace.pomodoro://auth/callback');
    expect(authRedirectUrl()).toBe(nativeAuthCallback());
  });
  it('rejects unsupported platforms instead of borrowing another app callback', () => {
    expect(nativeAuthCallbackForPlatform('web')).toBeNull();
    platform.name = 'unknown';
    expect(authRedirectUrl).toThrow();
  });
});
