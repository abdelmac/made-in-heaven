import type { PreferencesPlugin } from '@capacitor/preferences';
import { isNativeApp } from './mobile-platform';

export const WORKSPACE_PREFERENCES_PREFIX = 'solace.workspace.';
export const WORKSPACE_STORAGE_ERROR =
  'Le stockage de Solace est indisponible sur cet appareil. Gardez l’application ouverte et exportez une sauvegarde si vos données sont affichées.';
const MIGRATION_MARKER = `${WORKSPACE_PREFERENCES_PREFIX}legacy-migrated.v1`;
type PreferencesStore = Pick<PreferencesPlugin, 'get' | 'set' | 'remove' | 'keys'>;
type PendingWrite = { value: string | null };

export function isWorkspaceStorageKey(key: string): boolean {
  return key.startsWith('folia:v1:') || key === 'folia.appearance';
}

function durableKey(key: string): string {
  return `${WORKSPACE_PREFERENCES_PREFIX}${encodeURIComponent(key)}`;
}

function logicalKey(key: string): string | null {
  if (!key.startsWith(WORKSPACE_PREFERENCES_PREFIX)) return null;
  try {
    const decoded = decodeURIComponent(key.slice(WORKSPACE_PREFERENCES_PREFIX.length));
    return isWorkspaceStorageKey(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

/** Keep the synchronous workspace model while committing its own keys natively. */
export function createWorkspaceStorage(options: {
  native: () => boolean;
  preferences: () => Promise<PreferencesStore>;
  webStorage: () => Storage;
  onError?: (message: string) => void;
}) {
  const cache = new Map<string, string>();
  const dirty = new Map<string, PendingWrite>();
  let initialized = false;
  let initialization: Promise<void> | undefined;
  let queue: Promise<void> = Promise.resolve();
  let reportedFailure = false;

  const report = () => {
    if (reportedFailure) return;
    reportedFailure = true;
    try {
      options.onError?.(WORKSPACE_STORAGE_ERROR);
    } catch {
      // Reporting must never discard the pending write queue.
    }
  };
  const ensureReady = () => {
    if (!initialized) throw new Error('Le stockage de votre espace n’est pas encore prêt.');
  };
  const ensureWorkspaceKey = (key: string) => {
    if (!isWorkspaceStorageKey(key))
      throw new Error('Cette clé ne fait pas partie du stockage des espaces Solace.');
  };

  const enqueue = (key: string, operation: PendingWrite) => {
    queue = queue.then(async () => {
      // Coalesce rapid writes to one key while preserving ordering across keys.
      if (dirty.get(key) !== operation) return;
      try {
        const preferences = await options.preferences();
        if (operation.value === null) await preferences.remove({ key: durableKey(key) });
        else await preferences.set({ key: durableKey(key), value: operation.value });
        if (dirty.get(key) === operation) dirty.delete(key);
        if (!dirty.size) reportedFailure = false;
      } catch {
        // Retain the latest value in memory and the outbox for an explicit flush.
        report();
      }
    });
  };

  const storage: Storage = {
    get length() {
      if (!options.native()) return options.webStorage().length;
      ensureReady();
      return cache.size;
    },
    key(index: number) {
      if (!options.native()) return options.webStorage().key(index);
      ensureReady();
      return Array.from(cache.keys())[index] ?? null;
    },
    getItem(key: string) {
      if (!options.native()) return options.webStorage().getItem(key);
      ensureReady();
      return cache.get(String(key)) ?? null;
    },
    setItem(key: string, value: string) {
      if (!options.native()) return options.webStorage().setItem(key, value);
      ensureReady();
      key = String(key);
      ensureWorkspaceKey(key);
      value = String(value);
      cache.set(key, value);
      const operation = { value };
      dirty.set(key, operation);
      enqueue(key, operation);
    },
    removeItem(key: string) {
      if (!options.native()) return options.webStorage().removeItem(key);
      ensureReady();
      key = String(key);
      ensureWorkspaceKey(key);
      cache.delete(key);
      const operation = { value: null };
      dirty.set(key, operation);
      enqueue(key, operation);
    },
    clear() {
      if (!options.native()) return options.webStorage().clear();
      ensureReady();
      for (const key of cache.keys()) storage.removeItem(key);
    },
  };

  const initialize = (): Promise<void> => {
    if (!options.native() || initialized) return Promise.resolve();
    if (initialization) return initialization;
    initialization = (async () => {
      const preferences = await options.preferences();
      const [{ keys }, marker] = await Promise.all([
        preferences.keys(),
        preferences.get({ key: MIGRATION_MARKER }),
      ]);
      const staged = new Map<string, string>();
      await Promise.all(
        keys.map(async (key) => {
          const name = logicalKey(key);
          if (!name) return;
          const { value } = await preferences.get({ key });
          if (value !== null) staged.set(name, value);
        }),
      );

      if (marker.value !== '1') {
        const legacy = new Map<string, string>();
        try {
          const web = options.webStorage();
          for (let index = 0; index < web.length; index++) {
            const key = web.key(index);
            if (!key || !isWorkspaceStorageKey(key)) continue;
            const value = web.getItem(key);
            if (value !== null) legacy.set(key, value);
          }
        } catch {
          // Legacy WebView storage is optional; native Preferences is primary.
        }
        for (const [key, value] of legacy) {
          if (staged.has(key)) continue;
          await preferences.set({ key: durableKey(key), value });
          staged.set(key, value);
        }
        // A marker prevents deleted account caches from being resurrected by
        // stale WebView data if its best-effort cleanup is denied by the OS.
        await preferences.set({ key: MIGRATION_MARKER, value: '1' });
        try {
          const web = options.webStorage();
          for (const key of legacy.keys()) web.removeItem(key);
        } catch {
          // The durable migration marker already prevents a second import.
        }
      }
      for (const [key, value] of staged) cache.set(key, value);
      initialized = true;
    })().catch(() => {
      initialization = undefined;
      report();
      throw new Error(WORKSPACE_STORAGE_ERROR);
    });
    return initialization;
  };

  const drain = async () => {
    for (;;) {
      const current = queue;
      await current;
      if (current === queue) return;
    }
  };

  const flush = async () => {
    if (!options.native()) return;
    await initialize();
    await drain();
    if (dirty.size) {
      for (const [key, operation] of dirty) enqueue(key, operation);
      await drain();
    }
    if (dirty.size) throw new Error(WORKSPACE_STORAGE_ERROR);
    reportedFailure = false;
  };

  return { storage, initialize, flush };
}

const workspace = createWorkspaceStorage({
  native: isNativeApp,
  preferences: async () => {
    const { Preferences } = await import('@capacitor/preferences');
    // Capacitor plugins are proxies that synthesize every property, including
    // `then`. Returning the proxy from an async function would invoke a native
    // Preferences.then method during Promise assimilation and stall startup.
    return {
      get: (input) => Preferences.get(input),
      set: (input) => Preferences.set(input),
      remove: (input) => Preferences.remove(input),
      keys: () => Preferences.keys(),
    };
  },
  webStorage: () => localStorage,
  onError: (message) => {
    if (typeof window !== 'undefined')
      window.dispatchEvent(new CustomEvent('solace:storage-error', { detail: message }));
  },
});

export const workspaceStorage = workspace.storage;
export const initializeWorkspaceStorage = workspace.initialize;
export const flushWorkspaceStorage = workspace.flush;
