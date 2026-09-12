import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyData, id } from '@/lib/model';

const state = vi.hoisted(() => ({ reads: 0, replayed: false }));
const workspace = '22222222-2222-4222-8222-222222222222';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/auth', () => ({
  requireWorkspace: vi.fn(async () => ({ user: { id: '11111111-1111-4111-8111-111111111111' } })),
  durableRateLimit: vi.fn(async () => undefined),
}));
vi.mock('@/lib/supabase/server', () => ({
  getAdminSupabase: () => ({
    rpc: async (name: string) => ({
      data:
        name === 'folia_initialize_preferences'
          ? createEmptyData().preferences
          : { version: state.replayed ? 9 : 2, replayed: state.replayed },
      error: null,
    }),
    from: (table: string) => {
      const result = () => {
        if (table === 'workspace_documents') {
          state.reads++;
          return { data: { data: null, version: state.reads === 1 ? 1 : 9 }, error: null };
        }
        if (table === 'workspace_memberships')
          return { data: [{ user_id: '11111111-1111-4111-8111-111111111111' }], error: null };
        if (table === 'sync_operations') return { data: { version: 2 }, error: null };
        return { data: null, error: null };
      };
      const query = {
        select: () => query,
        eq: () => query,
        single: async () => result(),
        maybeSingle: async () => result(),
        then: (resolve: (value: ReturnType<typeof result>) => unknown) =>
          Promise.resolve(result()).then(resolve),
      };
      return query;
    },
  }),
}));

import { PUT, GET } from '@/app/api/sync/route';

describe('sync acknowledgment race', () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    state.reads = 0;
    state.replayed = false;
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost');
  });
  const request = () =>
    new Request(`http://localhost/api/sync?workspaceId=${workspace}`, {
      method: 'PUT',
      headers: { origin: 'http://localhost', 'content-type': 'application/json' },
      body: JSON.stringify({
        data: createEmptyData(workspace),
        expectedVersion: 1,
        operationId: id(),
      }),
    });
  it('separates the committed operation from a later device version', async () => {
    const response = await PUT(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ version: 9, committedVersion: 2 });
  });
  it('acknowledges a replay using its durable original version', async () => {
    state.replayed = true;
    const response = await PUT(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ version: 9, committedVersion: 2 });
  });
  it('returns a legacy document to older tabs and full collections to capable clients', async () => {
    const legacy = await GET(new Request(`http://localhost/api/sync?workspaceId=${workspace}`));
    const body = await legacy.json();
    expect(body.data).not.toHaveProperty('noteSheets');
    expect(body.data.preferences).not.toHaveProperty('background');
    const modern = await GET(
      new Request(`http://localhost/api/sync?workspaceId=${workspace}`, {
        headers: { 'x-folia-document-version': '2' },
      }),
    );
    const current = await modern.json();
    expect(current.data.noteSheets).toEqual([]);
    expect(current.data.preferences.background.kind).toBe('none');
  });
});
