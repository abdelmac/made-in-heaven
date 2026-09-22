import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyData } from '@/lib/model';
import { makeDocumentPatch } from '@/lib/sync-transfer';
import { organizationDefaults } from '@/lib/workspace-settings';

const state = vi.hoisted(() => ({
  signedIn: true,
  membershipRole: 'owner' as string | null,
  bindingMode: 'test',
  bindingAccount: null as string | null,
  bindingUnavailable: false,
  rpc: vi.fn(),
  tables: vi.fn(),
  sendInvitationEmail: vi.fn(),
}));
const workspaceId = '22222222-2222-4222-8222-222222222222';
const userId = '11111111-1111-4111-8111-111111111111';
const operationId = '33333333-3333-4333-8333-333333333333';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({
  getAdminSupabase: () => ({ rpc: state.rpc, from: state.tables }),
  getServerSupabase: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: state.signedIn ? { id: '11111111-1111-4111-8111-111111111111' } : null },
        error: null,
      }),
    },
    from: (table: string) => {
      const result = () => ({
        data:
          table === 'workspace_memberships'
            ? state.membershipRole && { role: state.membershipRole }
            : { id: '22222222-2222-4222-8222-222222222222', name: 'Personal', kind: 'personal' },
        error: null,
      });
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => result(),
        single: async () => result(),
      };
      return query;
    },
  }),
}));
vi.mock('@/lib/server/invitation-mail', () => ({
  invitationEmailConfigured: () => false,
  sendInvitationEmail: state.sendInvitationEmail,
}));

import { requireWorkspace } from '@/lib/server/auth';
import { PUT as syncPut, PATCH as syncPatch } from '@/app/api/sync/route';
import { PUT as preferencesPut } from '@/app/api/preferences/route';
import { GET as workspacesGet, POST as workspacesPost } from '@/app/api/workspaces/route';

const request = (path: string, method: string, body: unknown) =>
  new Request(`http://localhost/api/${path}`, {
    method,
    headers: { origin: 'http://localhost', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost');
  vi.stubEnv('STRIPE_BILLING_MODE', 'test');
  vi.stubEnv('STRIPE_ACCOUNT_ID', '');
  state.signedIn = true;
  state.membershipRole = 'owner';
  state.bindingMode = 'test';
  state.bindingAccount = null;
  state.bindingUnavailable = false;
  state.rpc.mockImplementation(async (name: string, params: Record<string, unknown>) => {
    if (name === 'assert_billing_environment') {
      return {
        data: null,
        error:
          state.bindingUnavailable ||
          params.p_mode !== state.bindingMode ||
          params.p_stripe_account_id !== state.bindingAccount
            ? {
                code: state.bindingUnavailable ? 'PGRST202' : '23514',
                message: 'Billing environment could not be verified.',
              }
            : null,
      };
    }
    if (name === 'folia_rate_limit') return { data: true, error: null };
    return { data: { version: 1, committedVersion: 1 }, error: null };
  });
});
afterEach(() => vi.unstubAllEnvs());

describe('workspace deployment binding', () => {
  it.each([
    ['test', null],
    ['test', 'acct_test'],
    ['live', 'acct_live'],
  ] as const)('allows a member when %s configuration matches storage', async (mode, account) => {
    vi.stubEnv('STRIPE_BILLING_MODE', mode);
    vi.stubEnv('STRIPE_ACCOUNT_ID', account ?? '');
    state.bindingMode = mode;
    state.bindingAccount = account;
    expect(await requireWorkspace(workspaceId)).toMatchObject({
      user: { id: userId },
      workspace: { id: workspaceId },
      role: 'owner',
    });
    expect(state.rpc).toHaveBeenCalledWith('assert_billing_environment', {
      p_mode: mode,
      p_stripe_account_id: account,
    });
  });

  it.each(['mode', 'account', 'unavailable'] as const)(
    'denies authorized workspace access when binding %s differs or cannot be checked',
    async (reason) => {
      if (reason === 'mode') state.bindingMode = 'live';
      if (reason === 'account') state.bindingAccount = 'acct_other';
      if (reason === 'unavailable') state.bindingUnavailable = true;
      await expect(requireWorkspace(workspaceId)).rejects.toMatchObject({ status: 503 });
    },
  );

  it.each(['signed-out', 'nonmember', 'wrong-role'] as const)(
    'checks %s authorization before trusted billing configuration',
    async (reason) => {
      if (reason === 'signed-out') state.signedIn = false;
      if (reason === 'nonmember') state.membershipRole = null;
      if (reason === 'wrong-role') state.membershipRole = 'viewer';
      await expect(requireWorkspace(workspaceId, { roles: ['owner'] })).rejects.toMatchObject({
        status: reason === 'signed-out' ? 401 : 403,
      });
      expect(state.rpc).not.toHaveBeenCalled();
    },
  );
});

describe('premium SQL routes cannot bypass the deployment binding', () => {
  beforeEach(() => {
    vi.stubEnv('STRIPE_BILLING_MODE', 'live');
    vi.stubEnv('STRIPE_ACCOUNT_ID', 'acct_live');
    // The application is live but its database still contains test entitlements.
  });

  it.each([
    ['sync PUT', syncPut, 'sync', 'PUT'],
    ['sync PATCH', syncPatch, 'sync', 'PATCH'],
    ['preferences PUT', preferencesPut, 'preferences', 'PUT'],
  ] as const)('blocks %s before the data transaction', async (_label, route, path, method) => {
    const data = createEmptyData(workspaceId);
    data.preferences.background = {
      kind: 'preset',
      preset: 'aurora',
      image: null,
      overlay: 70,
      blur: 0,
    };
    const common = { expectedVersion: 0, operationId };
    const body =
      path === 'preferences'
        ? { ...common, preferences: data.preferences }
        : method === 'PATCH'
          ? { ...common, patch: makeDocumentPatch(createEmptyData(workspaceId), data) }
          : { ...common, data };
    const response = await route(request(`${path}?workspaceId=${workspaceId}`, method, body));
    expect(response.status).toBe(503);
    expect(state.rpc.mock.calls.map(([name]) => name)).toEqual(['assert_billing_environment']);
    expect(state.tables).not.toHaveBeenCalled();
  });

  it.each([
    { action: 'create', name: 'New organization' },
    { action: 'acceptInvite', token: 'a'.repeat(64) },
    { action: 'settings', workspaceId, icon: 'leaf', defaultPreferences: organizationDefaults() },
    { action: 'rename', workspaceId, name: 'Renamed organization' },
  ])('blocks $action even though it bypasses requireWorkspace', async (body) => {
    const response = await workspacesPost(request('workspaces', 'POST', body));
    expect(response.status).toBe(503);
    expect(state.rpc.mock.calls.map(([name]) => name)).toEqual([
      'folia_rate_limit',
      'assert_billing_environment',
    ]);
    expect(state.sendInvitationEmail).not.toHaveBeenCalled();
  });

  it('checks the binding before onboarding a user into a different database environment', async () => {
    expect((await workspacesGet(new Request('http://localhost/api/workspaces'))).status).toBe(503);
    expect(state.rpc.mock.calls.map(([name]) => name)).toEqual(['assert_billing_environment']);
  });

  it('allows preference writes after a matching live binding is verified', async () => {
    state.bindingMode = 'live';
    state.bindingAccount = 'acct_live';
    const response = await preferencesPut(
      request(`preferences?workspaceId=${workspaceId}`, 'PUT', {
        preferences: createEmptyData(workspaceId).preferences,
        expectedVersion: 0,
        operationId,
      }),
    );
    expect(response.status).toBe(200);
    expect(state.rpc.mock.calls.map(([name]) => name)).toEqual([
      'assert_billing_environment',
      'folia_rate_limit',
      'folia_save_preferences',
    ]);
  });

  it('allows organization management after a matching live binding is verified', async () => {
    state.bindingMode = 'live';
    state.bindingAccount = 'acct_live';
    const response = await workspacesPost(
      request('workspaces', 'POST', { action: 'create', name: 'Organization' }),
    );
    expect(response.status).toBe(200);
    expect(state.rpc.mock.calls.map(([name]) => name)).toEqual([
      'folia_rate_limit',
      'assert_billing_environment',
      'folia_manage_workspace',
    ]);
  });
});
