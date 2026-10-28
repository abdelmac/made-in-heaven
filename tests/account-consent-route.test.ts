import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  durableRateLimit: vi.fn(),
  getAdminSupabase: vi.fn(),
}));
vi.mock('@/lib/server/auth', () => ({
  requireUser: mocks.requireUser,
  durableRateLimit: mocks.durableRateLimit,
}));
vi.mock('@/lib/supabase/server', () => ({ getAdminSupabase: mocks.getAdminSupabase }));
import { GET, POST, OPTIONS } from '../src/app/api/account/consent/route';
import { HttpError } from '../src/lib/server/http';

const userId = 'c1111111-1111-4111-8111-111111111111';
const declaration = {
  age_group: '18+',
  terms_version: '2026-10-28',
  privacy_version: '2026-10-28',
  legal_accepted: true,
};
const acceptance = {
  age_group: '18+',
  terms_version: '2026-10-28',
  privacy_version: '2026-10-28',
  accepted_at: '2026-10-28T12:00:00.000Z',
};
const rpc = vi.fn(),
  from = vi.fn(),
  upsert = vi.fn(),
  select = vi.fn(),
  eq = vi.fn(),
  maybeSingle = vi.fn(),
  single = vi.fn();
const request = (body: unknown = declaration, headers: Record<string, string> = {}) =>
  new Request('http://localhost:3000/api/account/consent', {
    method: 'POST',
    headers: { origin: 'http://localhost:3000', 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000');
  mocks.requireUser.mockResolvedValue({ user: { id: userId, user_metadata: { ...declaration } } });
  const query = { upsert, select, eq, maybeSingle, single };
  from.mockReturnValue(query);
  upsert.mockReturnValue(query);
  select.mockReturnValue(query);
  eq.mockReturnValue(query);
  rpc.mockResolvedValue({ data: false, error: null });
  maybeSingle.mockResolvedValue({ data: null, error: null });
  single.mockResolvedValue({ data: acceptance, error: null });
  mocks.getAdminSupabase.mockReturnValue({ rpc, from });
});

describe('private legal acceptance API', () => {
  it('reads only the verified account record and does not trust editable user metadata', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      eligible: false,
      acceptance: null,
      versions: { terms: '2026-10-28', privacy: '2026-10-28' },
    });
    expect(rpc).toHaveBeenCalledWith('folia_account_legal_eligible', { p_user: userId });
    expect(eq).toHaveBeenCalledWith('user_id', userId);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(upsert).not.toHaveBeenCalled();
    expect(mocks.durableRateLimit).toHaveBeenCalledWith(userId, 'account-consent-read', 60, 60);
  });

  it('returns the server-owned acceptance when canonical eligibility is true', async () => {
    rpc.mockResolvedValueOnce({ data: true, error: null });
    maybeSingle.mockResolvedValueOnce({ data: acceptance, error: null });
    const response = await GET();
    expect((await response.json()).acceptance).toEqual(acceptance);
  });

  it.each([
    { data: null, error: { code: 'PGRST202' } },
    { data: 'true', error: null },
    { data: true, error: { code: '08006' } },
  ])('fails closed when eligibility cannot be verified (%j)', async (value) => {
    rpc.mockResolvedValueOnce(value);
    expect((await GET()).status).toBe(503);
    expect(from).not.toHaveBeenCalled();
  });

  it.each(['16-17', '18+'])(
    'records explicit %s acceptance under the session owner with a database timestamp',
    async (ageGroup) => {
      const response = await POST(request({ ...declaration, age_group: ageGroup }));
      expect(response.status).toBe(200);
      expect(upsert).toHaveBeenCalledWith(
        { user_id: userId, ...declaration, age_group: ageGroup, source: 'account' },
        { onConflict: 'user_id' },
      );
      expect(upsert.mock.calls[0][0]).not.toHaveProperty('accepted_at');
      expect(await response.json()).toEqual({ eligible: true, acceptance });
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
      expect(mocks.durableRateLimit).toHaveBeenCalledWith(
        userId,
        'account-consent-write',
        10,
        3600,
      );
    },
  );

  it.each([
    { age_group: 'under16' },
    { age_group: '' },
    { age_group: 'adult' },
    { terms_version: '2025-01-01' },
    { privacy_version: '2025-01-01' },
    { legal_accepted: false },
    { legal_accepted: 'true' },
    { user_id: 'another-account' },
    { accepted_at: '1900-01-01' },
    { date_of_birth: '2000-01-01' },
  ])('rejects underage, stale, forged-actor or extra fields before writing (%j)', async (patch) => {
    expect((await POST(request({ ...declaration, ...patch }))).status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('does not report success when persistence fails', async () => {
    single.mockResolvedValueOnce({
      data: null,
      error: { code: '08006', message: 'Private database diagnostic' },
    });
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain('Private database diagnostic');
  });

  it('requires an online verified session for reads and writes', async () => {
    mocks.requireUser.mockRejectedValue(new HttpError(401, 'Sign in to continue.'));
    expect((await GET()).status).toBe(401);
    expect((await POST(request())).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it.each<Record<string, string>>([
    { origin: 'https://attacker.example' },
    { 'sec-fetch-site': 'cross-site' },
    { origin: 'capacitor://localhost' },
  ])('retains CSRF/native bearer guards (%j)', async (headers) => {
    expect((await POST(request(declaration, headers))).status).toBe(403);
    expect(mocks.requireUser).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('allows verified native bearer requests with explicit route CORS', async () => {
    const response = await POST(
      request(declaration, {
        origin: 'capacitor://localhost',
        authorization: 'Bearer fixture-token',
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('capacitor://localhost');
    expect(response.headers.has('Access-Control-Allow-Credentials')).toBe(false);
  });

  it('retains native authorization preflight', () => {
    const response = OPTIONS(
      new Request('http://localhost:3000/api/account/consent', {
        method: 'OPTIONS',
        headers: {
          origin: 'capacitor://localhost',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'authorization,content-type',
        },
      }),
    );
    expect(response.status).toBe(204);
  });

  it('honors durable write rate limiting before persistence', async () => {
    mocks.durableRateLimit.mockRejectedValueOnce(new HttpError(429, 'Too many requests.'));
    expect((await POST(request())).status).toBe(429);
    expect(upsert).not.toHaveBeenCalled();
  });
});
