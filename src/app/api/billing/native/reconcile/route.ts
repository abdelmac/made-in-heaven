import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { reconcileNativeSubscriptions } from '@/lib/billing/native-server';
import { handleApiError, HttpError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export async function GET(request: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret || secret.length < 32)
      throw new HttpError(503, 'Native reconciliation is not configured.');
    const expected = Buffer.from(`Bearer ${secret}`);
    const supplied = Buffer.from(request.headers.get('authorization') ?? '');
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
      throw new HttpError(401, 'Scheduler authentication is required.');
    const result = await reconcileNativeSubscriptions();
    return NextResponse.json(result, {
      status: result.failed ? 503 : 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
