import { appApiOrigin, isNativeApp } from './mobile-platform';
import { createBrowserSupabase } from './supabase/browser';

/**
 * Browser requests retain same-origin cookies. Installed apps authenticate only
 * with their own session token, sent exclusively to Solace's configured API.
 */
export async function appFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  if (!isNativeApp()) return fetch(input, init);

  if (
    typeof input !== 'string' ||
    !input.startsWith('/api/') ||
    /[\\\u0000-\u0020\u007f]/.test(input)
  ) {
    throw new Error('Cette demande ne correspond pas à une API Solace.');
  }
  const origin = new URL(appApiOrigin()).origin;
  const destination = new URL(input, origin);
  if (
    destination.origin !== origin ||
    !destination.pathname.startsWith('/api/') ||
    destination.hash ||
    destination.username ||
    destination.password
  ) {
    throw new Error('Cette demande ne correspond pas à une API Solace.');
  }

  const headers = new Headers(init.headers);
  // Caller-supplied credentials must never replace the installed app's session.
  headers.delete('authorization');
  headers.delete('cookie');
  const supabase = createBrowserSupabase();
  if (supabase) {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw new Error('Votre session doit être renouvelée. Reconnectez-vous à Solace.');
    if (data.session?.access_token)
      headers.set('authorization', `Bearer ${data.session.access_token}`);
  }

  return fetch(destination.href, {
    ...init,
    headers,
    credentials: 'omit',
    // An API redirect must never forward a bearer token to another destination.
    redirect: 'error',
  });
}
