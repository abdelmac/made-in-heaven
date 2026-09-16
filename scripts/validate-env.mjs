import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const publicKeys = ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'];
const serverKeys = ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY'];
const urlName = 'NEXT_PUBLIC_SUPABASE_URL';

function projectReference(value) {
  if (!value) return undefined;
  if (typeof value !== 'string' || /\s/.test(value)) return null;
  try {
    const url = new URL(value);
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.pathname !== '/' && url.pathname !== '')
    )
      return null;
    return url.hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1] ?? undefined;
  } catch {
    return null;
  }
}

function modernKey(value, prefix) {
  if (!value.startsWith(prefix)) return false;
  const token = value.slice(prefix.length);
  // Reject copied lists/combined credentials, including concatenated modern keys.
  return /^[A-Za-z0-9_-]{20,256}$/.test(token) && !/sb_(?:publishable|secret)_/.test(token);
}

function legacyKey(value, role, projectRef) {
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(value)) return false;
  try {
    const [headerPart, payloadPart] = value.split('.');
    const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
    // This is an offline exposure guard, not cryptographic authentication.
    // Hosted project references can be checked; custom domains/local endpoints
    // do not encode their underlying Supabase project reference.
    return (
      header?.alg === 'HS256' &&
      payload?.role === role &&
      typeof payload.ref === 'string' &&
      /^[a-z0-9-]{1,64}$/.test(payload.ref) &&
      (!projectRef || payload.ref === projectRef)
    );
  } catch {
    return false;
  }
}

/** Returns variable names only. Never return, log, or attach credential values. */
export function invalidSupabaseVariables(env) {
  const invalid = [];
  const projectRef = projectReference(env[urlName]);
  if (projectRef === null) invalid.push(urlName);
  for (const [names, prefix, role] of [
    [publicKeys, 'sb_publishable_', 'anon'],
    [serverKeys, 'sb_secret_', 'service_role'],
  ]) {
    for (const name of names) {
      const value = env[name];
      if (value === undefined || value === '') continue; // Optional cloud / local demo.
      if (
        typeof value !== 'string' ||
        /\s/.test(value) ||
        (!modernKey(value, prefix) && !legacyKey(value, role, projectRef))
      )
        invalid.push(name);
    }
  }
  return invalid;
}

export async function validateBuildEnvironment(directory = process.cwd()) {
  // Use the same production dotenv precedence/expansion as Next.js. Suppress
  // library errors because parser exceptions may contain environment values.
  const { default: nextEnv } = await import('@next/env');
  let loadFailed = false;
  const { combinedEnv } = nextEnv.loadEnvConfig(directory, false, {
    info() {},
    error() {
      loadFailed = true;
    },
  });
  if (loadFailed) throw new Error('Supabase environment could not be loaded.');
  const invalid = invalidSupabaseVariables(combinedEnv);
  if (invalid.length) throw new Error(`Invalid Supabase environment: ${invalid.join(', ')}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await validateBuildEnvironment();
    console.log('Supabase environment validation passed.');
  } catch (error) {
    // Only explicitly constructed messages are allowed into build logs.
    const message =
      error instanceof Error &&
      /^(?:Invalid Supabase environment: [A-Z_, .]+\.|Supabase environment could not be loaded\.)$/.test(
        error.message,
      )
        ? error.message
        : 'Supabase environment validation failed.';
    console.error(message);
    process.exitCode = 1;
  }
}
