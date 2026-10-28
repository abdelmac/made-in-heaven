import { NextResponse } from 'next/server';
import { ACCOUNT_PRIVACY_VERSION, ACCOUNT_TERMS_VERSION } from '@/lib/account-eligibility';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store, max-age=0' };

/** Public deployment evidence for the signup-hook rollout. No Auth configuration
 * or credentials are queried, and no signup is attempted. */
export async function GET() {
  const configured = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let projectRef: string | undefined;
  try {
    if (!configured || /\s/.test(configured)) throw new Error();
    const url = new URL(configured);
    if (
      url.protocol !== 'https:' ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/'
    )
      throw new Error();
    projectRef = url.hostname.match(/^([a-z0-9]{20})\.supabase\.co$/)?.[1];
  } catch {
    /* Return a fixed message without reflecting configured values. */
  }
  if (!projectRef)
    return NextResponse.json(
      { error: 'Signup deployment target is not configured.' },
      { status: 503, headers },
    );
  return NextResponse.json(
    {
      signupMetadataVersion: 1,
      termsVersion: ACCOUNT_TERMS_VERSION,
      privacyVersion: ACCOUNT_PRIVACY_VERSION,
      minimumOnlineAge: 16,
      projectRef,
    },
    { headers },
  );
}
