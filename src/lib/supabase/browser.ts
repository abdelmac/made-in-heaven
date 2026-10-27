'use client';

import { createBrowserClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isNativeApp } from '../mobile-platform';
import { nativeSessionStorage } from '../native-session-storage';

let client: SupabaseClient | null = null;
let nativeClient: SupabaseClient | null = null;
export function createBrowserSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (isNativeApp()) {
    nativeClient ??= createClient(url, key, {
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: false,
        persistSession: true,
        autoRefreshToken: true,
        storageKey: `solace.native.${new URL(url).hostname}.auth`,
        storage: nativeSessionStorage,
      },
    });
    return nativeClient;
  }
  client ??= createBrowserClient(url, key);
  return client;
}

/** Native sessions refresh while the app is active, rather than in a suspended WebView. */
export async function setNativeAuthActive(active: boolean): Promise<void> {
  if (!isNativeApp()) return;
  const supabase = createBrowserSupabase();
  if (active) await supabase?.auth.startAutoRefresh();
  else await supabase?.auth.stopAutoRefresh();
}
