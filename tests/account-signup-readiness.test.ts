import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/account/signup-readiness/route';
import { ACCOUNT_PRIVACY_VERSION, ACCOUNT_TERMS_VERSION } from '@/lib/account-eligibility';

afterEach(() => vi.unstubAllEnvs());
describe('public signup deployment evidence', () => {
  it('derives the public project and exact shared legal versions without private configuration', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abcdefghijklmnopqrst.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'not-read-or-reflected');
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      signupMetadataVersion: 1,
      termsVersion: ACCOUNT_TERMS_VERSION,
      privacyVersion: ACCOUNT_PRIVACY_VERSION,
      minimumOnlineAge: 16,
      projectRef: 'abcdefghijklmnopqrst',
    });
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
  it.each([
    undefined,
    '',
    'http://abcdefghijklmnopqrst.supabase.co',
    'https://elsewhere.test',
    'https://abcdefghijklmnopqrst.supabase.co.evil.test',
    'https://user:private@abcdefghijklmnopqrst.supabase.co',
    'https://abcdefghijklmnopqrst.supabase.co/path',
    'https://abcdefghijklmnopqrst.supabase.co?private=value',
    'https://abcdefghijklmnopqrst.supabase.co#private',
    ' https://abcdefghijklmnopqrst.supabase.co',
    'https://abcdefghijklmnopqrst.supabase.co:8443',
  ])('returns only a fixed unavailable response for invalid target (%s)', async (value) => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', value);
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Signup deployment target is not configured.' });
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
});
