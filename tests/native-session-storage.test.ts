import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  setKeyPrefix: vi.fn(),
  setSynchronize: vi.fn(),
  setDefaultKeychainAccess: vi.fn(),
  synthesizedThen: vi.fn(),
}));

vi.mock('@aparajita/capacitor-secure-storage', () => ({
  SecureStorage: new Proxy(mocks, {
    get(target, property) {
      if (property === 'then') return mocks.synthesizedThen;
      return Reflect.get(target, property);
    },
  }),
  KeychainAccess: { whenUnlockedThisDeviceOnly: 1 },
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.setKeyPrefix.mockResolvedValue(undefined);
  mocks.setSynchronize.mockResolvedValue(undefined);
  mocks.setDefaultKeychainAccess.mockResolvedValue(undefined);
  mocks.getItem.mockResolvedValue('fixture-session');
  mocks.setItem.mockResolvedValue(undefined);
  mocks.removeItem.mockResolvedValue(undefined);
  mocks.synthesizedThen.mockImplementation((_resolve, reject) => {
    reject(new Error('SecureStorage.then is not a native plugin method'));
  });
});

describe('native auth session storage', () => {
  it('stores auth values through the secure plugin with device-only, non-iCloud settings', async () => {
    const { nativeSessionStorage } = await import('../src/lib/native-session-storage');
    expect(await nativeSessionStorage.getItem('project.auth')).toBe('fixture-session');
    await nativeSessionStorage.setItem('project.auth', 'new-session');
    await nativeSessionStorage.removeItem('project.auth');
    expect(mocks.setKeyPrefix).toHaveBeenCalledExactlyOnceWith('solace.auth.');
    expect(mocks.setSynchronize).toHaveBeenCalledExactlyOnceWith(false);
    expect(mocks.setDefaultKeychainAccess).toHaveBeenCalledExactlyOnceWith(1);
    expect(mocks.getItem).toHaveBeenCalledWith('project.auth');
    expect(mocks.setItem).toHaveBeenCalledWith('project.auth', 'new-session');
    expect(mocks.removeItem).toHaveBeenCalledWith('project.auth');
  });

  it('does not fall back to plaintext storage if the secure store is unavailable', async () => {
    mocks.setKeyPrefix.mockRejectedValue(new Error('secure storage unavailable'));
    const { nativeSessionStorage } = await import('../src/lib/native-session-storage');
    await expect(nativeSessionStorage.getItem('project.auth')).rejects.toThrow(
      'secure storage unavailable',
    );
    await expect(nativeSessionStorage.setItem('project.auth', 'new-session')).rejects.toThrow(
      'secure storage unavailable',
    );
    expect(mocks.getItem).not.toHaveBeenCalled();
    expect(mocks.setItem).not.toHaveBeenCalled();
  });

  it('does not assimilate the native plugin proxy as a Promise thenable', async () => {
    const { nativeSessionStorage } = await import('../src/lib/native-session-storage');
    await expect(nativeSessionStorage.getItem('project.auth')).resolves.toBe('fixture-session');
    await expect(
      nativeSessionStorage.setItem('project.auth', 'new-session'),
    ).resolves.toBeUndefined();
    await expect(nativeSessionStorage.removeItem('project.auth')).resolves.toBeUndefined();
    expect(mocks.synthesizedThen).not.toHaveBeenCalled();
  });
});
