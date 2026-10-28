import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ACCOUNT_PRIVACY_VERSION, ACCOUNT_TERMS_VERSION } from '@/lib/account-eligibility';
import { durableRateLimit, requireUser } from '@/lib/server/auth';
import {
  assertSameOrigin,
  databaseError,
  handleApiError,
  HttpError,
  readJson,
} from '@/lib/server/http';
import { nativeApiOptions, withNativeApiCors } from '@/lib/server/native-route';
import { getAdminSupabase } from '@/lib/supabase/server';

const selection = 'age_group,terms_version,privacy_version,accepted_at';
const schema = z
  .object({
    age_group: z.enum(['16-17', '18+']),
    terms_version: z.literal(ACCOUNT_TERMS_VERSION),
    privacy_version: z.literal(ACCOUNT_PRIVACY_VERSION),
    legal_accepted: z.literal(true),
  })
  .strict();
const headers = { 'Cache-Control': 'private, no-store' };

async function handleGET() {
  try {
    const { user } = await requireUser();
    await durableRateLimit(user.id, 'account-consent-read', 60, 60);
    const db = getAdminSupabase();
    if (!db)
      throw new HttpError(
        503,
        'Legal acceptance is temporarily unavailable. Please try again later.',
      );
    const { data: eligible, error: eligibilityError } = await db.rpc(
      'folia_account_legal_eligible',
      { p_user: user.id },
    );
    if (eligibilityError || typeof eligible !== 'boolean')
      throw new HttpError(
        503,
        'Legal acceptance is temporarily unavailable. Please try again later.',
      );
    const { data: acceptance, error } = await db
      .from('account_legal_acceptances')
      .select(selection)
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) throw databaseError(error);
    return NextResponse.json(
      {
        eligible,
        acceptance,
        versions: { terms: ACCOUNT_TERMS_VERSION, privacy: ACCOUNT_PRIVACY_VERSION },
      },
      { headers },
    );
  } catch (error) {
    return handleApiError(error);
  }
}

async function handlePOST(request: Request) {
  try {
    assertSameOrigin(request);
    const { user } = await requireUser();
    await durableRateLimit(user.id, 'account-consent-write', 10, 3600);
    const body = schema.parse(await readJson(request, 2000));
    const db = getAdminSupabase();
    if (!db)
      throw new HttpError(
        503,
        'Legal acceptance is temporarily unavailable. Please try again later.',
      );
    // Identity comes from the verified session; accepted_at is stamped in SQL.
    const { data: acceptance, error } = await db
      .from('account_legal_acceptances')
      .upsert({ user_id: user.id, ...body, source: 'account' }, { onConflict: 'user_id' })
      .select(selection)
      .single();
    if (error) throw databaseError(error);
    if (!acceptance)
      throw new HttpError(503, 'Legal acceptance could not be saved. Please try again.');
    return NextResponse.json({ eligible: true, acceptance }, { headers });
  } catch (error) {
    return handleApiError(error);
  }
}

export const GET = withNativeApiCors(handleGET);
export const POST = withNativeApiCors(handlePOST);
export const OPTIONS = nativeApiOptions;
