import { expect, it, vi } from 'vitest';

const device = vi.hoisted(() => ({ values: new Map<string, string>(), thenCalls: 0 }));

vi.mock('@/lib/mobile-platform', () => ({ isNativeApp: () => true }));
vi.mock('@capacitor/preferences', () => ({
  Preferences: new Proxy(
    {
      get: async ({ key }: { key: string }) => ({ value: device.values.get(key) ?? null }),
      set: async ({ key, value }: { key: string; value: string }) => {
        device.values.set(key, value);
      },
      remove: async ({ key }: { key: string }) => {
        device.values.delete(key);
      },
      keys: async () => ({ keys: Array.from(device.values.keys()) }),
    },
    {
      get(target, name, receiver) {
        if (name === 'then')
          return () => {
            device.thenCalls++;
            throw new Error('Preferences.then is not a native method');
          };
        return Reflect.get(target, name, receiver);
      },
    },
  ),
}));

import {
  flushWorkspaceStorage,
  initializeWorkspaceStorage,
  workspaceStorage,
} from '../src/lib/workspace-storage';

it('hydrates and flushes through a Capacitor-style proxy without awaiting the plugin itself', async () => {
  await expect(initializeWorkspaceStorage()).resolves.toBeUndefined();
  workspaceStorage.setItem('folia:v1:active-local', 'workspace-1');
  await flushWorkspaceStorage();
  expect(workspaceStorage.getItem('folia:v1:active-local')).toBe('workspace-1');
  expect(device.values.get('solace.workspace.folia%3Av1%3Aactive-local')).toBe('workspace-1');
  workspaceStorage.removeItem('folia:v1:active-local');
  await flushWorkspaceStorage();
  expect(device.values.has('solace.workspace.folia%3Av1%3Aactive-local')).toBe(false);
  expect(device.thenCalls).toBe(0);
});
