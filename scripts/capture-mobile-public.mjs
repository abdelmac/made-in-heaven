import { mkdirSync, writeFileSync } from 'node:fs';

const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '');
const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
let publicKey = typeof key === 'string' && /^sb_publishable_[A-Za-z0-9_-]+$/.test(key);
if (!publicKey && key?.startsWith('eyJ')) {
  try {
    publicKey = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role === 'anon';
  } catch {
    publicKey = false;
  }
}
if (
  url.protocol !== 'https:' ||
  url.username ||
  url.password ||
  url.pathname !== '/' ||
  url.search ||
  url.hash ||
  !publicKey
) {
  throw new Error('A valid HTTPS Supabase URL and public publishable/anon key are required.');
}
mkdirSync('.local', { recursive: true });
writeFileSync(
  '.local/mobile-public.json',
  JSON.stringify({ supabaseUrl: url.origin, supabaseKey: key }, null, 2) + '\n',
  { mode: 0o600 },
);
console.log('Saved only public mobile connection settings in .local/mobile-public.json.');
