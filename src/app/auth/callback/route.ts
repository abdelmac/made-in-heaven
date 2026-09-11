import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  const next = url.searchParams.get('next') === '/?reset-password=1' ? '/?reset-password=1' : '/';
  const supabase = await getServerSupabase();
  if (supabase && tokenHash && (type === 'signup' || type === 'recovery' || type === 'email')) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error)
      return NextResponse.redirect(
        new URL(type === 'recovery' ? '/?reset-password=1' : next, request.url),
      );
  }
  if (supabase && code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  }
  return NextResponse.redirect(new URL('/?auth-error=verification', request.url));
}
