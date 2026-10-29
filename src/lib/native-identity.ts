/** Store identities are independent: changing Android must not rename the iOS app. */
export const ANDROID_APP_ID = 'com.solacepomodoro.myapp';
export const IOS_APP_ID = 'com.solace.pomodoro';

export function nativeAppIdForPlatform(platform: string): string | null {
  if (platform === 'android') return ANDROID_APP_ID;
  if (platform === 'ios') return IOS_APP_ID;
  return null;
}

export function nativeAuthCallbackForPlatform(platform: string): string | null {
  const appId = nativeAppIdForPlatform(platform);
  return appId ? `${appId}://auth/callback` : null;
}
