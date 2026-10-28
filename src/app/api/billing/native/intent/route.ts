import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWorkspace, durableRateLimit } from '@/lib/server/auth';
import { assertSameOrigin, handleApiError, HttpError, readJson } from '@/lib/server/http';
import { nativeApiOptions, withNativeApiCors } from '@/lib/server/native-route';
import { nativePublicConfiguration } from '@/lib/billing/native-config';
import { reserveNativePurchase } from '@/lib/billing/native-server';
import { verifyGoogleProductConfiguration } from '@/lib/billing/native-google';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const schema = z
  .object({
    workspaceId: z.uuid(),
    platform: z.enum(['ios', 'android']),
    productId: z.string().min(1).max(200),
  })
  .strict();
async function handlePOST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = schema.parse(await readJson(request, 2048));
    const { user, workspace } = await requireWorkspace(body.workspaceId, { roles: ['owner'] });
    if (workspace.kind !== 'personal')
      throw new HttpError(400, 'Native purchases require a personal workspace.');
    await durableRateLimit(user.id, 'billing:native:intent', 10);
    const config = nativePublicConfiguration(body.platform);
    if (!config.ready) throw new HttpError(503, 'Native store billing is not configured.');
    if (body.productId !== config.productId)
      throw new HttpError(400, 'This store product is not configured.');
    if (body.platform === 'android') await verifyGoogleProductConfiguration();
    return NextResponse.json(
      await reserveNativePurchase(user.id, body.workspaceId, body.platform, body.productId),
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
export const POST = withNativeApiCors(handlePOST);
export const OPTIONS = nativeApiOptions;
