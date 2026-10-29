import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseCapacitorInvocation, runCapacitorPlatforms } from '../scripts/capacitor-platform.mjs';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('native platform command isolation', () => {
  it.each([[], ['sync'], ['sync', 'web'], ['open', 'all'], ['run', 'all'], ['unknown', 'android']])(
    'refuses an ambiguous or unsupported invocation %j',
    (...args) => {
      expect(() => parseCapacitorInvocation(args)).toThrow();
    },
  );

  it('runs a complete sync sequentially with independent platform environments', () => {
    const calls: Array<{ args: string[]; env: Record<string, string | undefined>; cwd: string }> =
      [];
    const env = { SOLACE_CAPACITOR_PLATFORM: 'ios', PARENT_VALUE: 'preserved' };
    const run = vi.fn(
      (
        _executable: string,
        args: string[],
        options: { env: Record<string, string | undefined>; cwd: string },
      ) => {
        calls.push({ args, env: options.env, cwd: options.cwd });
        return { status: 0 };
      },
    );
    runCapacitorPlatforms(['sync', 'all'], { run, env, cwd: process.cwd() });
    expect(calls).toHaveLength(2);
    expect(calls.map((call) => call.args.slice(1))).toEqual([
      ['sync', 'android'],
      ['sync', 'ios'],
    ]);
    expect(calls.map((call) => call.env.SOLACE_CAPACITOR_PLATFORM)).toEqual(['android', 'ios']);
    expect(calls.every((call) => call.env.PARENT_VALUE === 'preserved')).toBe(true);
    expect(calls[0].env).not.toBe(calls[1].env);
    expect(env.SOLACE_CAPACITOR_PLATFORM).toBe('ios');
  });

  it('does not continue to iOS after an Android sync failure', () => {
    const run = vi.fn(() => ({ status: 1 }));
    expect(() => runCapacitorPlatforms(['sync', 'all'], { run })).toThrow('android failed');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('opens only the requested platform without a shell', () => {
    type Runner = NonNullable<NonNullable<Parameters<typeof runCapacitorPlatforms>[1]>['run']>;
    const run = vi.fn<Runner>(() => ({ status: 0 }));
    runCapacitorPlatforms(['open', 'ios'], { run, env: {} });
    expect(run).toHaveBeenCalledTimes(1);
    const [, args, options] = run.mock.calls[0];
    expect(args.slice(1)).toEqual(['open', 'ios']);
    expect(options.env.SOLACE_CAPACITOR_PLATFORM).toBe('ios');
    expect(options).not.toHaveProperty('shell');
    expect(options.windowsHide).toBe(true);
  });
});

describe('platform-specific Capacitor configuration', () => {
  it.each([
    ['android', 'com.solacepomodoro.myapp'],
    ['ios', 'com.solace.pomodoro'],
  ])(
    'uses the exact %s identity without changing purchase safety settings',
    async (platform, appId) => {
      vi.stubEnv('SOLACE_CAPACITOR_PLATFORM', platform);
      const { default: config } = await import('../capacitor.config');
      expect(config.appId).toBe(appId);
      expect(config.plugins?.NativePurchases).toEqual({
        autoFinishTransactions: false,
        debugLogging: false,
      });
    },
  );

  it('refuses to select one identity for an ambiguous native command', async () => {
    vi.stubEnv('SOLACE_CAPACITOR_PLATFORM', '');
    await expect(import('../capacitor.config')).rejects.toThrow('Select a native platform');
  });
});
