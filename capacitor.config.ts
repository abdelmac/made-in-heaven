import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.solace.pomodoro',
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
