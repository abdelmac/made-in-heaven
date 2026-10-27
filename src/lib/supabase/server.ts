import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cookies, headers } from 'next/headers';
import { HttpError } from '@/lib/server/http';
import { isNativeApiOrigin, requestBearerToken } from '@/lib/server/mobile-api';

export async function getServerSupabase(): Promise<SupabaseClient | null> {
  const requestHeaders = await headers();
  const tokenAuthentication =
    requestHeaders.has('authorization') || isNativeApiOrigin(requestHeaders.get('origin'));
  const token = tokenAuthentication ? requestBearerToken(requestHeaders) : null;
  // Missing native credentials are rejected even before provider configuration
  // is considered. A browser cookie must never turn this into a native session.
  if (tokenAuthentication && !token) throw new HttpError(401, 'Sign in to continue.');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (token) {
    // The public key is used here; every query retains the caller's JWT/RLS.
    // auth.getUser() validates this custom Authorization header with Supabase.
    // There is no local session, cookie fallback, refresh, or elevated service key.
    return createClient(url, key, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  const store = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (values) => {
        try {
          values.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          /* Server components cannot set cookies; proxy refreshes them. */
        }
      },
    },
  });
}

export function getAdminSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
