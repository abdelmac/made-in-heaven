import { describe, expect, it, vi } from 'vitest';
import {
  createWorkspaceStorage,
  WORKSPACE_PREFERENCES_PREFIX,
  WORKSPACE_STORAGE_ERROR,
} from '../src/lib/workspace-storage';

const ownKey = (key: string) => `${WORKSPACE_PREFERENCES_PREFIX}${encodeURIComponent(key)}`;
const record = 'folia:v1:local:workspace-1';
const marker = `${WORKSPACE_PREFERENCES_PREFIX}legacy-migrated.v1`;

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    key: (index) => Array.from(data.keys())[index] ?? null,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, String(value));
    },
    removeItem: (key) => {
      data.delete(key);
    },
    clear: () => data.clear(),
  };
}

function fixture(initial: Record<string, string> = {}, legacy = memoryStorage()) {
  const durable = new Map(Object.entries(initial));
  const preferences = {
    get: vi.fn(async ({ key }: { key: string }) => ({ value: durable.get(key) ?? null })),
    keys: vi.fn(async () => ({ keys: Array.from(durable.keys()) })),
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
      durable.set(key, value);
    }),
    remove: vi.fn(async ({ key }: { key: string }) => {
      durable.delete(key);
    }),
  };
  const errors: string[] = [];
  const make = (native = true) =>
    createWorkspaceStorage({
      native: () => native,
      preferences: async () => preferences,
      webStorage: () => legacy,
      onError: (message) => {
        errors.push(message);
      },
    });
  return { durable, preferences, errors, make, legacy };
}

describe('durable native workspace storage', () => {
  it('hydrates completed, pending and preference data on a new process without WebView storage', async () => {
    const test = fixture({
      [ownKey(record)]: '{"version":3,"pending":{"expectedVersion":1}}',
      [ownKey('folia.appearance')]: '{"mode":"dark"}',
      'capacitor.notification.internal': 'untouched',
      [ownKey('sb-provider-auth-token')]: 'never loaded',
    });
    const first = test.make();
    expect(() => first.storage.getItem(record)).toThrow('pas encore prêt');
    await first.initialize();
    expect(first.storage.length).toBe(2);
    expect(first.storage.getItem(record)).toContain('"version":3');
    first.storage.setItem(record, '{"version":4,"timer":"running"}');
    await first.flush();

    const restarted = test.make();
    await restarted.initialize();
    expect(restarted.storage.getItem(record)).toBe('{"version":4,"timer":"running"}');
    expect(restarted.storage.getItem('folia.appearance')).toContain('dark');
    expect(restarted.storage.getItem('sb-provider-auth-token')).toBeNull();
    expect(test.durable.get('capacitor.notification.internal')).toBe('untouched');
  });

  it('coalesces rapid writes/removals and restores the final synchronous state', async () => {
    const test = fixture();
    const current = test.make();
    await current.initialize();
    current.storage.setItem(record, 'first');
    current.storage.setItem(record, 'second');
    current.storage.removeItem(record);
    current.storage.setItem(record, 'last');
    current.storage.setItem('folia:v1:active-local', 'workspace-1');
    expect(current.storage.getItem(record)).toBe('last');
    await current.flush();
    const restarted = test.make();
    await restarted.initialize();
    expect(restarted.storage.getItem(record)).toBe('last');
    expect(restarted.storage.getItem('folia:v1:active-local')).toBe('workspace-1');
  });

  it('migrates only workspace legacy keys, preserving newer durable records', async () => {
    const legacy = memoryStorage({
      [record]: 'legacy stale',
      'folia:v1:active-local': 'workspace-1',
      'folia.appearance': 'dark',
      'sb-project-auth-token': 'private token',
      unrelated: 'other app data',
    });
    const test = fixture({ [ownKey(record)]: 'native current' }, legacy);
    const current = test.make();
    await current.initialize();
    expect(current.storage.getItem(record)).toBe('native current');
    expect(current.storage.getItem('folia:v1:active-local')).toBe('workspace-1');
    expect(current.storage.getItem('folia.appearance')).toBe('dark');
    expect(legacy.getItem(record)).toBeNull();
    expect(legacy.getItem('sb-project-auth-token')).toBe('private token');
    expect(legacy.getItem('unrelated')).toBe('other app data');
    expect(test.preferences.set.mock.calls.some(([input]) => input.value === 'private token')).toBe(
      false,
    );
  });

  it('never resurrects a removed account cache from stale legacy storage', async () => {
    const account = 'folia:v1:account:user-1:workspace-1';
    const legacy = memoryStorage({ [account]: 'legacy copy' });
    const remove = legacy.removeItem;
    legacy.removeItem = () => {
      throw new Error('WebView cleanup denied');
    };
    const test = fixture({}, legacy);
    const first = test.make();
    await first.initialize();
    first.storage.removeItem(account);
    await first.flush();
    const restarted = test.make();
    await restarted.initialize();
    expect(restarted.storage.getItem(account)).toBeNull();
    expect(legacy.getItem(account)).toBe('legacy copy');
    expect(test.durable.get(marker)).toBe('1');
    legacy.removeItem = remove;
  });

  it('keeps a failed write in memory, reports a generic error and retries successfully', async () => {
    const test = fixture();
    const current = test.make();
    await current.initialize();
    const write = test.preferences.set.getMockImplementation()!;
    test.preferences.set.mockRejectedValue(new Error('Disk is full with private details'));
    current.storage.setItem(record, 'pending work');
    await expect(current.flush()).rejects.toThrow(WORKSPACE_STORAGE_ERROR);
    expect(current.storage.getItem(record)).toBe('pending work');
    expect(test.errors).toEqual([WORKSPACE_STORAGE_ERROR]);
    test.preferences.set.mockImplementation(write);
    await current.flush();
    const restarted = test.make();
    await restarted.initialize();
    expect(restarted.storage.getItem(record)).toBe('pending work');
  });

  it('preserves queued ordering when a write is still committing during a removal', async () => {
    const test = fixture();
    const current = test.make();
    await current.initialize();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const write = test.preferences.set.getMockImplementation()!;
    const entered = vi.fn();
    test.preferences.set.mockImplementationOnce(async (value) => {
      entered();
      await gate;
      await write(value);
    });
    current.storage.setItem(record, 'during save');
    await vi.waitFor(() => expect(entered).toHaveBeenCalledOnce());
    current.storage.removeItem(record);
    release();
    await current.flush();
    expect(current.storage.getItem(record)).toBeNull();
    expect(test.durable.has(ownKey(record))).toBe(false);
  });

  it('rejects auth/session keys and clears only workspace keys, preserving plugin preferences', async () => {
    const test = fixture({ 'plugin.notification.setting': 'keep' });
    const current = test.make();
    await current.initialize();
    expect(() => current.storage.setItem('sb-auth-token', 'secret')).toThrow('ne fait pas partie');
    current.storage.setItem(record, 'work');
    current.storage.setItem('folia.appearance', 'light');
    current.storage.clear();
    await current.flush();
    expect(current.storage.length).toBe(0);
    expect(test.durable.get('plugin.notification.setting')).toBe('keep');
    expect(Array.from(test.durable.keys())).toEqual(['plugin.notification.setting', marker]);
  });

  it('fails initialization safely and permits a later retry without exposing an empty workspace', async () => {
    const test = fixture({ [ownKey(record)]: 'retained' });
    test.preferences.keys.mockRejectedValueOnce(new Error('OS temporarily unavailable'));
    const current = test.make();
    await expect(current.initialize()).rejects.toThrow(WORKSPACE_STORAGE_ERROR);
    expect(() => current.storage.length).toThrow('pas encore prêt');
    await current.initialize();
    expect(current.storage.getItem(record)).toBe('retained');
  });

  it('delegates to web storage lazily and does not use native Preferences for the website', async () => {
    const legacy = memoryStorage();
    const access = vi.fn(() => legacy);
    const preferences = vi.fn();
    const web = createWorkspaceStorage({ native: () => false, webStorage: access, preferences });
    expect(access).not.toHaveBeenCalled();
    await web.initialize();
    await web.flush();
    expect(access).not.toHaveBeenCalled();
    web.storage.setItem('any-web-key', 'value');
    expect(web.storage.getItem('any-web-key')).toBe('value');
    expect(preferences).not.toHaveBeenCalled();
  });
});
