import type { CapacitorConfig } from '@capacitor/cli';
import { ANDROID_APP_ID, IOS_APP_ID } from './src/lib/native-identity';

const platform = process.env.SOLACE_CAPACITOR_PLATFORM;
if (platform !== 'android' && platform !== 'ios') {
  throw new Error(
    'Select a native platform with node scripts/capacitor-platform.mjs <command> <android|ios|all>.',
  );
}

const config: CapacitorConfig = {
  appId: platform === 'android' ? ANDROID_APP_ID : IOS_APP_ID,
  appName: 'Solace',
  webDir: 'mobile/dist',
  loggingBehavior: 'debug',
  server: {
    hostname: 'localhost',
    androidScheme: 'https',
    iosScheme: 'capacitor',
  },
  android: { allowMixedContent: false },
  plugins: {
    NativePurchases: { autoFinishTransactions: false, debugLogging: false },
    LocalNotifications: {
      smallIcon: 'ic_stat_solace',
      iconColor: '#83ba92',
      sound: 'solace_timer.wav',
    },
    SplashScreen: { launchAutoHide: true, backgroundColor: '#17181e' },
  },
};

export default config;
