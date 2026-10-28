import type { Page } from '@playwright/test';
import type { Product, Transaction } from '@capgo/native-purchases';

type NativeFixtureControl = {
  listenerCount(plugin: string, event: string): number;
  emit(plugin: string, event: string, payload: unknown): number;
};

export async function installNativeBridge(
  page: Page,
  options: {
    purchases?: {
      products: Product[];
      transaction: Transaction;
      outcome?: 'success' | 'cancelled' | 'pending';
    };
  } = {},
) {
  // Exercise the real bundled JS against a deterministic native boundary. This
  // fixture cannot verify Android Keystore, OS link dispatch or native Java.
  await page.addInitScript((purchaseFixture) => {
    const read = (key: string): Record<string, string> =>
      JSON.parse(sessionStorage.getItem(key) || '{}');
    const write = (key: string, value: Record<string, string>) =>
      sessionStorage.setItem(key, JSON.stringify(value));
    const listeners = new Map<
      string,
      { plugin: string; event: string; callback: (payload: unknown) => void }
    >();
    let nextListener = 0;
    const fakeWindow = window as unknown as Record<string, unknown>;
    fakeWindow.androidBridge = {};
    fakeWindow.__nativeFixture = {
      listenerCount: (plugin: string, event: string) =>
        [...listeners.values()].filter((item) => item.plugin === plugin && item.event === event)
          .length,
      emit: (plugin: string, event: string, payload: unknown) => {
        const matching = [...listeners.values()].filter(
          (item) => item.plugin === plugin && item.event === event,
        );
        matching.forEach((item) => item.callback(payload));
        return matching.length;
      },
    };
    const purchaseCalls: { method: string; options: Record<string, unknown> }[] = [];
    let bought = false;
    let finished = false;
    fakeWindow.__nativePurchaseFixture = {
      calls: purchaseCalls,
      setPurchased: () => {
        bought = true;
      },
      finishVerified: () => {
        finished = true;
      },
    };
    const plugins: Record<string, string[]> = {
      Preferences: ['get', 'set', 'remove', 'keys'],
      SecureStorage: [
        'internalGetItem',
        'internalSetItem',
        'internalRemoveItem',
        'setSynchronizeKeychain',
        'internalGetPrefixedKeys',
      ],
      App: ['addListener', 'removeListener', 'getState', 'getLaunchUrl', 'minimizeApp'],
      LocalNotifications: [
        'addListener',
        'removeListener',
        'checkPermissions',
        'getPending',
        'cancel',
        'schedule',
        'createChannel',
        'checkExactNotificationSetting',
      ],
      Browser: ['open'],
    };
    if (purchaseFixture)
      plugins.NativePurchases = [
        'configure',
        'isBillingSupported',
        'getProducts',
        'getPurchases',
        'getUnfinishedTransactions',
        'purchaseProduct',
        'restorePurchases',
        'finishTransaction',
        'manageSubscriptions',
        'addListener',
        'removeListener',
      ];
    fakeWindow.Capacitor = {
      PluginHeaders: Object.entries(plugins).map(([name, methods]) => ({
        name,
        methods: methods.map((method) => ({
          name: method,
          rtype: method === 'addListener' ? 'callback' : 'promise',
        })),
      })),
      nativePromise: async (
        plugin: string,
        method: string,
        options: Record<string, unknown> = {},
      ) => {
        const prefsKey = '__native_mock.preferences';
        const secureKey = '__native_mock.secure';
        if (plugin === 'NativePurchases' && purchaseFixture) {
          purchaseCalls.push({ method, options });
          if (method === 'configure') {
            if (options.autoFinishTransactions !== false)
              throw new Error('Automatic finishing must be disabled');
            return {};
          }
          if (method === 'isBillingSupported') return { isBillingSupported: true };
          if (method === 'getProducts') return { products: purchaseFixture.products };
          if (method === 'getPurchases')
            return { purchases: bought ? [purchaseFixture.transaction] : [] };
          if (method === 'getUnfinishedTransactions')
            return { transactions: bought && !finished ? [purchaseFixture.transaction] : [] };
          if (method === 'purchaseProduct') {
            if (purchaseFixture.outcome === 'cancelled') throw new Error('User cancelled');
            if (purchaseFixture.outcome === 'pending') throw new Error('Purchase is pending');
            bought = true;
            return purchaseFixture.transaction;
          }
          if (method === 'finishTransaction') finished = true;
          return {};
        }
        if (method === 'removeListener') {
          listeners.delete(String(options.callbackId));
          return {};
        }
        if (plugin === 'Preferences') {
          const prefs = read(prefsKey);
          const key = String(options.key);
          if (method === 'get') return { value: prefs[key] ?? null };
          if (method === 'keys') return { keys: Object.keys(prefs) };
          if (method === 'set') {
            prefs[key] = String(options.value);
            write(prefsKey, prefs);
          }
          if (method === 'remove') {
            delete prefs[key];
            write(prefsKey, prefs);
          }
          return {};
        }
        if (plugin === 'SecureStorage') {
          const secure = read(secureKey);
          const key = String(options.prefixedKey);
          if (method === 'internalGetItem') return { data: secure[key] ?? null };
          if (method === 'internalSetItem') {
            secure[key] = String(options.data);
            write(secureKey, secure);
          }
          if (method === 'internalRemoveItem') {
            delete secure[key];
            write(secureKey, secure);
            return { success: true };
          }
          if (method === 'internalGetPrefixedKeys') return { keys: Object.keys(secure) };
          return {};
        }
        if (plugin === 'App' && method === 'getState') return { isActive: true };
        if (plugin === 'App' && method === 'getLaunchUrl') {
          const url = sessionStorage.getItem('__native_mock.launchUrl');
          return url ? { url } : {};
        }
        if (plugin === 'LocalNotifications' && method === 'getPending')
          return { notifications: [] };
        if (plugin === 'LocalNotifications' && method === 'checkPermissions')
          return { display: 'denied' };
        if (plugin === 'LocalNotifications' && method === 'checkExactNotificationSetting')
          return { exact_alarm: 'denied' };
        return {};
      },
      nativeCallback: (
        plugin: string,
        method: string,
        options: Record<string, unknown>,
        callback: (payload: unknown) => void,
      ) => {
        if (method !== 'addListener') throw new Error('Unexpected fixture callback');
        const id = `mock-listener-${++nextListener}`;
        listeners.set(id, { plugin, event: String(options.eventName), callback });
        return Promise.resolve(id);
      },
    };
  }, options.purchases ?? null);
}

export async function emitNativeAppUrl(page: Page, url: string, repetitions = 1) {
  await page.waitForFunction(() => {
    const fixture = (window as unknown as { __nativeFixture?: NativeFixtureControl })
      .__nativeFixture;
    return fixture?.listenerCount('App', 'appUrlOpen') === 1;
  });
  await page.evaluate(
    ({ url, repetitions }) => {
      const fixture = (window as unknown as { __nativeFixture: NativeFixtureControl })
        .__nativeFixture;
      for (let index = 0; index < repetitions; index++) fixture.emit('App', 'appUrlOpen', { url });
    },
    { url, repetitions },
  );
}
