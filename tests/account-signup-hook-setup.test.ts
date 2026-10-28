import { describe, expect, it, vi } from 'vitest';
import {
  checkDiff,
  checkFrontendPayload,
  executeHookWorkflow,
  EXPECTED_FRONTEND,
  hookConfig,
  HOOK_URI,
  parseArguments,
  protectedSnapshot,
  SetupError,
  verifyFrontend,
} from '../scripts/configure-account-signup-hook.mjs';
import { ACCOUNT_PRIVACY_VERSION, ACCOUNT_TERMS_VERSION } from '@/lib/account-eligibility';

const enabledPath = ['auth', 'hook', 'before_user_created', 'enabled'];
const uriPath = ['auth', 'hook', 'before_user_created', 'uri'];
interface SettingChange {
  path: string[];
  remote: unknown;
  class: string;
  declared: boolean;
  local?: unknown;
}
const cleanEnvironment = { NODE_ENV: 'test' as const };
const remote = (path: string[], value: unknown): SettingChange => ({
  path,
  remote: value,
  class: 'remote_only',
  declared: false,
});
function fixture(initial = { enabled: false, uri: '' }) {
  const state = {
    ...initial,
    smtp: 'PRIVATE_AUTH_SENTINEL',
    site: 'https://www.solace-pomodoro.com',
  };
  const command = vi.fn(async (operation: string, config: string) => {
    if (operation === 'push') {
      state.enabled = true;
      state.uri = HOOK_URI;
      return { services: [{ service: 'auth', status: 'updated' }], secrets: { sent: [] } };
    }
    const protectedValues = [
      remote(['auth', 'site_url'], state.site),
      remote(['auth', 'email', 'smtp', 'host'], state.smtp),
      remote(['auth', 'additional_redirect_urls'], ['com.solace.pomodoro://auth/callback']),
    ];
    if (config === 'base')
      return {
        changes: [
          ...protectedValues,
          remote(enabledPath, state.enabled),
          remote(uriPath, state.uri),
        ],
        masked: [],
        unmanaged: [],
      };
    const enabled = config === 'disabled' ? false : true;
    const uri = config === 'uriProbe' ? `${HOOK_URI}_read_only_probe` : HOOK_URI;
    const changes = [...protectedValues];
    if (enabled !== state.enabled)
      changes.push({
        ...remote(enabledPath, state.enabled),
        class: 'update',
        declared: true,
        local: enabled,
      });
    if (uri !== state.uri)
      changes.push({ ...remote(uriPath, state.uri), class: 'update', declared: true, local: uri });
    return { changes, masked: [], unmanaged: [] };
  });
  return { state, command };
}

describe('sparse signup-hook setup contract', () => {
  it('declares only the intended Postgres hook and no SMTP, secrets or default Auth settings', () => {
    const config = hookConfig();
    expect(config).toContain('[auth.hook.before_user_created]');
    expect(config).toContain(`uri = "${HOOK_URI}"`);
    expect(config).not.toMatch(/smtp|password|secret|site_url|redirect|jwt/i);
    expect(() => hookConfig(true, 'https://other.example/hook')).toThrow();
    expect(EXPECTED_FRONTEND.termsVersion).toBe(ACCOUNT_TERMS_VERSION);
    expect(EXPECTED_FRONTEND.privacyVersion).toBe(ACCOUNT_PRIVACY_VERSION);
  });
  it('rejects secret arguments, ambiguous modes and unknown command switches', () => {
    expect(parseArguments([], cleanEnvironment).mode).toBe('preview');
    expect(
      parseArguments(['--verify', '--profile', 'C:/local/profile.yaml'], cleanEnvironment).profile,
    ).toBe('C:/local/profile.yaml');
    for (const args of [
      ['--apply', '--verify'],
      ['--token', 'private'],
      ['--profile'],
      ['--api-url', 'https://other.example'],
    ])
      expect(() => parseArguments(args, cleanEnvironment)).toThrow();
  });
  it('allows only the two hook paths in a reviewed diff', async () => {
    const { command } = fixture();
    const diff = (await command('diff', 'desired')) as {
      changes: SettingChange[];
      masked: unknown[];
      unmanaged: unknown[];
    };
    expect(checkDiff(diff)).toEqual([
      'auth.hook.before_user_created.enabled',
      'auth.hook.before_user_created.uri',
    ]);
    for (const patch of [
      { masked: [['auth', 'email', 'smtp', 'pass']] },
      { unmanaged: [{ path: ['auth', 'unknown'] }] },
      {
        changes: [
          ...diff.changes,
          {
            path: ['auth', 'email', 'smtp', 'host'],
            local: 'other',
            declared: true,
            class: 'update',
          },
        ],
      },
      { changes: [{ path: enabledPath, local: false, declared: true, class: 'update' }] },
    ])
      expect(() => checkDiff({ ...diff, ...patch })).toThrow();
  });
  it('detects protected SMTP/redirect changes without returning their values', async () => {
    const { state, command } = fixture();
    const before = protectedSnapshot(await command('diff', 'base'));
    state.smtp = 'another-smtp-setting';
    expect(protectedSnapshot(await command('diff', 'base'))).not.toBe(before);
    expect(() => protectedSnapshot({ changes: [], masked: [] })).toThrow();
  });
});

describe('deployment activation evidence', () => {
  it('requires an exact public project, versions, age and schema', () => {
    expect(checkFrontendPayload({ ...EXPECTED_FRONTEND })).toBe(true);
    for (const patch of [
      { projectRef: 'another-project' },
      { termsVersion: 'old' },
      { minimumOnlineAge: 3 },
      { signupMetadataVersion: 0 },
      { extra: 'PRIVATE_AUTH_SENTINEL' },
    ])
      expect(() => checkFrontendPayload({ ...EXPECTED_FRONTEND, ...patch })).toThrow();
  });
  it('fetches only the production origin without redirects and requires no-store JSON', async () => {
    const fetcher = vi.fn(async () =>
      Response.json(EXPECTED_FRONTEND, { headers: { 'Cache-Control': 'no-store' } }),
    );
    expect(await verifyFrontend(fetcher)).toBe(true);
    expect(fetcher).toHaveBeenCalledWith(
      'https://www.solace-pomodoro.com/api/account/signup-readiness',
      expect.objectContaining({ redirect: 'error', cache: 'no-store' }),
    );
    await expect(
      verifyFrontend(async () => Response.json(EXPECTED_FRONTEND)),
    ).rejects.toMatchObject({ code: 'FRONTEND_NOT_READY' });
    await expect(
      verifyFrontend(async () => new Response('PRIVATE_AUTH_SENTINEL', { status: 503 })),
    ).rejects.toMatchObject({ code: 'FRONTEND_NOT_READY' });
  });
});

describe('reviewed setup workflow without provider calls', () => {
  it('previews without a push even before the matching frontend is deployed', async () => {
    const { command } = fixture();
    const result = await executeHookWorkflow({
      mode: 'preview',
      command,
      frontendCheck: async () => {
        throw new SetupError('FRONTEND_NOT_READY', 'not deployed');
      },
    });
    expect(result).toMatchObject({
      frontendReady: false,
      writeAttempted: false,
      productionWrites: 0,
      protectedAuthSnapshotUnchanged: true,
    });
    expect(command.mock.calls.some(([op]) => op === 'push')).toBe(false);
    expect(JSON.stringify(result)).not.toContain('PRIVATE_AUTH_SENTINEL');
  });
  it('refuses application before frontend deployment and makes no write', async () => {
    const { command } = fixture();
    await expect(
      executeHookWorkflow({ mode: 'apply', command, frontendCheck: async () => false }),
    ).rejects.toMatchObject({ code: 'FRONTEND_NOT_READY', writeAttempted: false });
    expect(command.mock.calls.some(([op]) => op === 'push')).toBe(false);
  });
  it('pushes only the desired hook after validation and confirms independent readback', async () => {
    const { command, state } = fixture();
    const frontendCheck = vi.fn(async () => true);
    const result = await executeHookWorkflow({ mode: 'apply', command, frontendCheck });
    expect(result).toMatchObject({
      verified: true,
      hookEnabled: true,
      productionWrites: 1,
      protectedAuthSnapshotUnchanged: true,
      rawAuthOutputPrinted: false,
    });
    expect(command.mock.calls.filter(([op]) => op === 'push')).toEqual([['push', 'desired']]);
    expect(frontendCheck.mock.invocationCallOrder[0]).toBeLessThan(
      command.mock.invocationCallOrder[command.mock.calls.findIndex(([op]) => op === 'push')],
    );
    expect(command.mock.calls).toContainEqual(['diff', 'disabled']);
    expect(command.mock.calls).toContainEqual(['diff', 'uriProbe']);
    expect(state.smtp).toBe('PRIVATE_AUTH_SENTINEL');
    expect(JSON.stringify(result)).not.toContain('PRIVATE_AUTH_SENTINEL');
  });
  it('is idempotent and verifies an already enabled hook with zero pushes', async () => {
    for (const mode of ['apply', 'verify']) {
      const { command } = fixture({ enabled: true, uri: HOOK_URI });
      expect(
        await executeHookWorkflow({ mode, command, frontendCheck: async () => true }),
      ).toMatchObject({ verified: true, productionWrites: 0, writeAttempted: false });
      expect(command.mock.calls.some(([op]) => op === 'push')).toBe(false);
    }
  });
  it('does not automatically replace another active signup policy', async () => {
    const { command } = fixture({
      enabled: true,
      uri: 'pg-functions://postgres/public/another_signup_policy',
    });
    await expect(
      executeHookWorkflow({ mode: 'apply', command, frontendCheck: async () => true }),
    ).rejects.toMatchObject({ code: 'OTHER_ACTIVE_HOOK', writeAttempted: false });
    expect(command.mock.calls.some(([op]) => op === 'push')).toBe(false);
  });
  it('detects concurrent protected configuration changes before writing', async () => {
    const { command, state } = fixture();
    const original = command.getMockImplementation()!;
    let bases = 0;
    command.mockImplementation(async (op, config) => {
      if (op === 'diff' && config === 'base' && ++bases === 2) state.smtp = 'changed-concurrently';
      return original(op, config);
    });
    await expect(
      executeHookWorkflow({ mode: 'apply', command, frontendCheck: async () => true }),
    ).rejects.toMatchObject({ code: 'AUTH_CHANGED_BEFORE_WRITE', writeAttempted: false });
    expect(command.mock.calls.some(([op]) => op === 'push')).toBe(false);
  });
  it('reports an attempted write on failed post-write checks and never rolls back unrelated Auth settings', async () => {
    const { command, state } = fixture();
    const original = command.getMockImplementation()!;
    command.mockImplementation(async (op, config) => {
      const result = await original(op, config);
      if (op === 'push') state.smtp = 'provider-concurrent-change';
      return result;
    });
    await expect(
      executeHookWorkflow({ mode: 'apply', command, frontendCheck: async () => true }),
    ).rejects.toMatchObject({ code: 'PROTECTED_AUTH_CHANGED', writeAttempted: true });
    expect(command.mock.calls.filter(([op]) => op === 'push')).toHaveLength(1);
  });
  it('sanitizes unexpected errors even after a push', async () => {
    const { command } = fixture();
    const original = command.getMockImplementation()!;
    command.mockImplementation(async (op, config) => {
      if (op === 'push') throw new Error('PRIVATE_AUTH_SENTINEL');
      return original(op, config);
    });
    try {
      await executeHookWorkflow({ mode: 'apply', command, frontendCheck: async () => true });
      throw new Error('expected failure');
    } catch (error) {
      expect(error).toMatchObject({ code: 'WORKFLOW_FAILED', writeAttempted: true });
      expect((error as Error).message).not.toContain('PRIVATE_AUTH_SENTINEL');
    }
  });
});
