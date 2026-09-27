import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getServerSupabase: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  verifyOtp: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ getServerSupabase: mocks.getServerSupabase }));

import { GET } from '../src/app/auth/callback/route';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getServerSupabase.mockResolvedValue({
    auth: {
      exchangeCodeForSession: mocks.exchangeCodeForSession,
      verifyOtp: mocks.verifyOtp,
    },
  });
  mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
  mocks.verifyOtp.mockResolvedValue({ error: null });
});

async function destination(query: string) {
  const response = await GET(new Request(`https://solace.example/auth/callback?${query}`));
  return response.headers.get('location');
}

describe('authentication destinations with a public home page', () => {
  it('takes a verified sign-in into the workspace', async () => {
    expect(await destination('code=valid-code')).toBe('https://solace.example/?view=overview');
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith('valid-code');
  });

  it.each(['signup', 'email'])('takes a verified %s email into the workspace', async (type) => {
    expect(await destination(`token_hash=valid-hash&type=${type}`)).toBe(
      'https://solace.example/?view=overview',
    );
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: 'valid-hash', type });
  });

  it('keeps both recovery mechanisms in the password form', async () => {
    expect(await destination('code=valid-code&next=%2F%3Freset-password%3D1')).toBe(
      'https://solace.example/?reset-password=1',
    );
    expect(await destination('token_hash=valid-hash&type=recovery')).toBe(
      'https://solace.example/?reset-password=1',
    );
  });

  it('ignores unapproved return destinations', async () => {
    expect(await destination('code=valid-code&next=https%3A%2F%2Fexample.org')).toBe(
      'https://solace.example/?view=overview',
    );
  });

  it('keeps failed verification in the workspace where its error is shown', async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: new Error('expired') });
    expect(await destination('code=expired-code')).toBe(
      'https://solace.example/?auth-error=verification',
    );
  });
});
