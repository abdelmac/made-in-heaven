import type { SupportedStorage } from '@supabase/supabase-js';

let initialized: Promise<typeof import('@aparajita/capacitor-secure-storage')> | undefined;

async function secureStorage() {
  initialized ??= import('@aparajita/capacitor-secure-storage').then(async (plugin) => {
    await plugin.SecureStorage.setKeyPrefix('solace.auth.');
    await plugin.SecureStorage.setSynchronize(false);
    await plugin.SecureStorage.setDefaultKeychainAccess(
      plugin.KeychainAccess.whenUnlockedThisDeviceOnly,
    );
    return plugin;
  });
  // Capacitor synthesizes methods for unknown proxy properties, including
  // `then`. Box the plugin so Promise resolution never treats it as a thenable.
  return { storage: (await initialized).SecureStorage };
}

/** Auth secrets use iOS Keychain / Android Keystore-backed storage, never preferences or cookies. */
export const nativeSessionStorage: SupportedStorage = {
  async getItem(key) {
    return (await secureStorage()).storage.getItem(key);
  },
  async setItem(key, value) {
    await (await secureStorage()).storage.setItem(key, value);
  },
  async removeItem(key) {
    await (await secureStorage()).storage.removeItem(key);
  },
};
