import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { invalidSupabaseVariables } from './validate-env.mjs';

/** Import only explicitly public settings; private provider values never enter a bundle. */
export function loadMobilePublicEnvironment(projectRoot) {
  const filename = resolve(projectRoot, '.local/mobile-public.json');
  const value = existsSync(filename) ? JSON.parse(readFileSync(filename, 'utf8')) : {};
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL && typeof value.supabaseUrl === 'string') {
    process.env.NEXT_PUBLIC_SUPABASE_URL = value.supabaseUrl;
  }
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    typeof value.supabaseKey === 'string'
  ) {
    process.env[
      value.supabaseKey.startsWith('sb_publishable_')
        ? 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
        : 'NEXT_PUBLIC_SUPABASE_ANON_KEY'
    ] = value.supabaseKey;
  }
  const publicKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!publicKey) return;
  const invalid = invalidSupabaseVariables({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  if (invalid.length || !process.env.NEXT_PUBLIC_SUPABASE_URL)
    throw new Error(
      'Mobile builds accept only a valid Supabase URL and public publishable/anon key.',
    );
}
