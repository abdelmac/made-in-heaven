import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  native: true,
  platform: 'ios',
  code: vi.fn(),
  otp: vi.fn(),
  unsubscribe: vi.fn(),
  onAuthStateChange: vi.fn(),
  authEvent: null as null | ((event: string) => void),
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => mocks.native, getPlatform: () => mocks.platform },
}));
vi.mock('@/lib/supabase/browser', () => ({
  createBrowserSupabase: () => ({
    auth: {
      exchangeCodeForSession: mocks.code,
      verifyOtp: mocks.otp,
      onAuthStateChange: mocks.onAuthStateChange,
    },
  }),
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.native = true;
  mocks.platform = 'ios';
  mocks.authEvent = null;
  mocks.onAuthStateChange.mockImplementation((callback) => {
    mocks.authEvent = callback;
    return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
  });
  mocks.code.mockResolvedValue({
    data: { session: { access_token: 'fixture-session' } },
    error: null,
  });
  mocks.otp.mockResolvedValue({
    data: { session: { access_token: 'fixture-session' } },
    error: null,
  });
});

describe('native authentication links', () => {
  it.each([
    'https://www.solace-pomodoro.com/auth/callback?code=valid',
    'com.solace.pomodoro://other/callback?code=valid',
    'com.solace.pomodoro://auth/other?code=valid',
    'attacker://auth/callback?code=valid',
    'com.solacepomodoro.myapp://auth/callback?code=valid',
    'com.solace.pomodoro://user@auth/callback?code=valid',
  ])('does not handle another origin or route: %s', async (url) => {
    const { handleNativeAuthUrl } = await import('../src/lib/native-auth');
    expect(await handleNativeAuthUrl(url)).toEqual({ handled: false });
    expect(mocks.code).not.toHaveBeenCalled();
    expect(mocks.otp).not.toHaveBeenCalled();
  });

  it('uses the new Android callback and rejects the iOS/old Android callback on Android', async () => {
    mocks.platform = 'android';
    const { handleNativeAuthUrl } = await import('../src/lib/native-auth');
    expect(await handleNativeAuthUrl('com.solace.pomodoro://auth/callback?code=old-app')).toEqual({
      handled: false,
    });
    expect(mocks.code).not.toHaveBeenCalled();
    expect(
      await handleNativeAuthUrl('com.solacepomodoro.myapp://auth/callback?code=new-app'),
    ).toEqual({ handled: true, recovery: false });
    expect(mocks.code).toHaveBeenCalledWith('new-app', undefined);
  });

  it('does not consume a callback on an unsupported native platform', async () => {
    mocks.platform = 'unknown';
    const { handleNativeAuthUrl } = await import('../src/lib/native-auth');
    expect(await handleNativeAuthUrl('com.solacepomodoro.myapp://auth/callback?code=code')).toEqual(
      { handled: false },
    );
    expect(mocks.code).not.toHaveBeenCalled();
  });

  it('exchanges a PKCE code bound to the native installation and keeps an explicit flow ID', async () => {
    const { handleNativeAuthUrl } = await import('../src/lib/native-auth');
    const result = await handleNativeAuthUrl(
      'com.solace.pomodoro://auth/callback?code=verified-code&sb_flow_id=flow-identifier&next=https://attacker.invalid',
    );
    expect(mocks.code).toHaveBeenCalledWith('verified-code', { flowId: 'flow-identifier' });
    expect(result).toEqual({ handled: true, recovery: false });
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
  });

  it('recognizes password recovery from the verified SDK event', async () => {
    mocks.code.mockImplementation(async () => {
      mocks.authEvent?.('PASSWORD_RECOVERY');
      return { data: { session: {} }, error: null };
    });
    const { handleNativeAuthUrl } = await import('../src/lib/native-auth');
    expect(
      await handleNativeAuthUrl('com.solace.pomodoro://auth/callback?code=recovery-code'),
    ).toEqual({ handled: true, recovery: true });
  });

  it('verifies a token hash with its allowed email type', async () => {
    const { handleNativeAuthUrl } = await import('../src/lib/native-auth');
    const result = await handleNativeAuthUrl(
      'com.solace.pomodoro://auth/callback?token_hash=verified-hash&type=recovery',
    );
    expect(mocks.otp).toHaveBeenCalledWith({ token_hash: 'verified-hash', type: 'recovery' });
    expect(result).toEqual({ handled: true, recovery: true });
  });

  it.each([
    'com.solace.pomodoro://auth/callback#access_token=borrowed&refresh_token=borrowed',
    'com.solace.pomodoro://auth/callback?code=one&code=two',
    'com.solace.pomodoro://auth/callback?code=code&token_hash=hash&type=email',
    'com.solace.pomodoro://auth/callback?token_hash=hash&type=invite',
    'com.solace.pomodoro://auth/callback?error=access_denied',
  ])('rejects unsafe or ambiguous authentication input: %s', async (url) => {
    const { handleNativeAuthUrl } = await import('../src/lib/native-auth');
    expect(await handleNativeAuthUrl(url)).toMatchObject({
      handled: true,
      error: expect.any(String),
    });
    expect(mocks.code).not.toHaveBeenCalled();
    expect(mocks.otp).not.toHaveBeenCalled();
  });

  it('coalesces duplicate platform callback events without exchanging a one-time code twice', async () => {
    const { handleNativeAuthUrl } = await import('../src/lib/native-auth');
    const url = 'com.solace.pomodoro://auth/callback?code=one-time-code';
    const results = await Promise.all([handleNativeAuthUrl(url), handleNativeAuthUrl(url)]);
    expect(results).toEqual([
      { handled: true, recovery: false },
      { handled: true, recovery: false },
    ]);
    expect(mocks.code).toHaveBeenCalledOnce();
  });

  it('does not expose provider errors or credentials in the returned error', async () => {
    mocks.code.mockRejectedValue(new Error('private provider diagnostic with fixture-token'));
    const { handleNativeAuthUrl } = await import('../src/lib/native-auth');
    const result = await handleNativeAuthUrl(
      'com.solace.pomodoro://auth/callback?code=expired-code',
    );
    expect(result.error).toContain('Demandez un nouveau lien');
    expect(result.error).not.toContain('fixture-token');
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
  });
});
