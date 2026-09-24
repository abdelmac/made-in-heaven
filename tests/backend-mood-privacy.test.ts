import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyData, type Preferences } from '@/lib/model';

const state = vi.hoisted(() => ({
  actor: '',
  preferences: {} as Record<string, Preferences>,
  queries: [] as { table: string; filters: Record<string, string> }[],
}));
const workspaceId = '22222222-2222-4222-8222-222222222222';
const firstActor = '11111111-1111-4111-8111-111111111111';
const secondActor = '33333333-3333-4333-8333-333333333333';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/auth', () => ({
  requireWorkspace: vi.fn(async () => ({ user: { id: state.actor }, role: 'viewer' })),
  durableRateLimit: vi.fn(async () => undefined),
}));
vi.mock('@/lib/supabase/server', () => ({
  getAdminSupabase: () => ({
    rpc: async () => ({ data: createEmptyData().preferences, error: null }),
    from: (table: string) => {
      const filters: Record<string, string> = {};
      state.queries.push({ table, filters });
      const result = () => {
        if (table === 'workspace_documents') {
          // Even a historical snapshot carrying another actor's preferences must
          // never win over the actor-specific overlay.
          const data = createEmptyData(workspaceId);
          data.preferences = state.preferences[firstActor];
          return { data: { data, version: 5 }, error: null };
        }
        if (table === 'preferences') {
          const preferences = state.preferences[filters.user_id];
          return { data: preferences ? { data: preferences } : null, error: null };
        }
        return { data: null, error: null };
      };
      const query = {
        select: () => query,
        eq: (key: string, value: string) => {
          filters[key] = value;
          return query;
        },
        single: async () => result(),
        maybeSingle: async () => result(),
      };
      return query;
    },
  }),
}));
import { GET } from '@/app/api/sync/route';

beforeEach(() => {
  state.queries = [];
  state.actor = firstActor;
  state.preferences = Object.fromEntries(
    [firstActor, secondActor].map((actor, index) => {
      const preferences = createEmptyData().preferences;
      preferences.moodEntries = [
        {
          date: '2026-09-20',
          mood: index + 2,
          energy: null,
          note: `Private note for ${actor}`,
          updatedAt: '2026-09-20T18:00:00Z',
        },
      ];
      return [actor, preferences];
    }),
  );
});

describe('mood snapshot actor isolation', () => {
  it.each([false, true])(
    'returns only each actor mood entries in full/paged reads (paged=%s)',
    async (paged) => {
      for (const actor of [firstActor, secondActor]) {
        state.actor = actor;
        const response = await GET(
          new Request(
            `http://localhost/api/sync?workspaceId=${workspaceId}${paged ? '&transfer=paged&cursor=0' : ''}`,
            { headers: { 'X-Folia-Document-Version': '2', 'X-Folia-Mood-Version': '1' } },
          ),
        );
        expect(response.status).toBe(200);
        const body = await response.json();
        expect((paged ? body.metadata : body.data).preferences.moodEntries).toEqual(
          state.preferences[actor].moodEntries,
        );
        const otherActor = actor === firstActor ? secondActor : firstActor;
        expect(JSON.stringify(body)).not.toContain(
          state.preferences[otherActor].moodEntries[0].note,
        );
        expect(
          state.queries.filter((query) => query.table === 'preferences').at(-1)?.filters,
        ).toEqual({ workspace_id: workspaceId, user_id: actor });
      }
    },
  );

  it('initializes an empty personal log instead of copying another member historical snapshot', async () => {
    delete state.preferences[secondActor];
    state.actor = secondActor;
    const response = await GET(
      new Request(`http://localhost/api/sync?workspaceId=${workspaceId}`, {
        headers: { 'X-Folia-Document-Version': '2', 'X-Folia-Mood-Version': '1' },
      }),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).data.preferences.moodEntries).toEqual([]);
  });
});
