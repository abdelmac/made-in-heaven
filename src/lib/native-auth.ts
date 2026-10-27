import { isNativeApp } from './mobile-platform';
import { createBrowserSupabase } from './supabase/browser';

export type NativeAuthResult = { handled: boolean; recovery?: boolean; error?: string };

const callbackScheme = 'com.solace.pomodoro:';
const failureMessage = 'Ce lien de connexion est invalide ou a expiré. Demandez un nouveau lien.';
let activeCallback: { url: string; result: Promise<NativeAuthResult> } | null = null;

/** Accept only our exact callback; PKCE codes are bound to this installation. */
export async function handleNativeAuthUrl(raw: string): Promise<NativeAuthResult> {
  if (!isNativeApp()) return { handled: false };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { handled: false };
  }
  if (
    url.protocol !== callbackScheme ||
    url.hostname !== 'auth' ||
    url.pathname !== '/callback' ||
    url.port ||
    url.username ||
    url.password
  ) {
    return { handled: false };
  }
  if (activeCallback?.url === raw) return activeCallback.result;

  const result = completeCallback(url);
  activeCallback = { url: raw, result };
  try {
    return await result;
  } finally {
    if (activeCallback?.result === result) activeCallback = null;
  }
}

async function completeCallback(url: URL): Promise<NativeAuthResult> {
  // Never accept arbitrary bearer-token fragments as a replacement for PKCE.
  if (
    url.hash ||
    url.searchParams.has('access_token') ||
    url.searchParams.has('refresh_token') ||
    url.searchParams.has('error') ||
    url.searchParams.has('error_code')
  ) {
    return { handled: true, error: failureMessage };
  }
  const supabase = createBrowserSupabase();
  if (!supabase) return { handled: true, error: 'La connexion au compte n’est pas configurée.' };
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  if (
    (code && tokenHash) ||
    url.searchParams.getAll('code').length > 1 ||
    url.searchParams.getAll('token_hash').length > 1 ||
    url.searchParams.getAll('type').length > 1
  ) {
    return { handled: true, error: failureMessage };
  }

  let recovery = false;
  const listener = supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') recovery = true;
  });
  try {
    if (code && code.length <= 4096) {
      // Newer SDKs can identify concurrent PKCE flows; do not borrow a verifier
      // from another flow when Supabase supplies an explicit flow identifier.
      const flowId = url.searchParams.get('sb_flow_id');
      const { data, error } = await supabase.auth.exchangeCodeForSession(
        code,
        flowId ? { flowId } : undefined,
      );
      if (error || !data.session) return { handled: true, error: failureMessage };
      return { handled: true, recovery };
    }
    if (
      tokenHash &&
      tokenHash.length <= 4096 &&
      (type === 'signup' || type === 'email' || type === 'recovery')
    ) {
      const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
      if (error || !data.session) return { handled: true, error: failureMessage };
      return { handled: true, recovery: type === 'recovery' || recovery };
    }
    return { handled: true, error: failureMessage };
  } catch {
    return { handled: true, error: failureMessage };
  } finally {
    listener.data.subscription.unsubscribe();
  }
}
