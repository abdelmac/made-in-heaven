import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyData, id } from '@/lib/model';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), requireWorkspace: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/auth', () => ({
  requireWorkspace: mocks.requireWorkspace,
  durableRateLimit: vi.fn(async () => undefined),
}));
vi.mock('@/lib/supabase/server', () => ({ getAdminSupabase: () => ({ rpc: mocks.rpc }) }));
import { PUT } from '@/app/api/preferences/route';

const workspaceId = '22222222-2222-4222-8222-222222222222';
const actorId = '11111111-1111-4111-8111-111111111111';
const request = (extra = {}) =>
  new Request(`http://localhost/api/preferences?workspaceId=${workspaceId}`, {
    method: 'PUT',
    headers: { origin: 'http://localhost', 'content-type': 'application/json' },
    body: JSON.stringify({
      preferences: createEmptyData().preferences,
      expectedVersion: 0,
      operationId: id(),
      ...extra,
    }),
  });

describe('private preference API', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost');
    mocks.rpc.mockReset();
    mocks.requireWorkspace.mockReset();
    mocks.requireWorkspace.mockResolvedValue({ user: { id: actorId }, role: 'viewer' });
    mocks.rpc.mockResolvedValue({ data: { version: 1, committedVersion: 1 }, error: null });
  });
  afterEach(() => vi.unstubAllEnvs());
  it('allows a viewer to save validated own preferences without any content or timer payload', async () => {
    expect((await PUT(request())).status).toBe(200);
    expect(mocks.requireWorkspace).toHaveBeenCalledWith(workspaceId);
    expect(mocks.rpc).toHaveBeenCalledWith(
      'folia_save_preferences',
      expect.objectContaining({
        p_actor: actorId,
        p_workspace: workspaceId,
        p_expected_version: 0,
      }),
    );
    expect(Object.keys(mocks.rpc.mock.calls[0][1]).sort()).toEqual([
      'p_actor',
      'p_expected_version',
      'p_operation',
      'p_preferences',
      'p_workspace',
    ]);
  });
  it('rejects productivity content and claimed identity before the transaction', async () => {
    expect((await PUT(request({ tasks: [], userId: workspaceId }))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('surfaces version conflicts for explicit client resolution', async () => {
    mocks.rpc.mockResolvedValue({ data: { version: 7, conflict: true }, error: null });
    const response = await PUT(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ version: 7 });
  });
  it('does not bypass server entitlement denial for a viewer', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'A paid plan is required.' },
    });
    expect((await PUT(request())).status).toBe(403);
  });
});
