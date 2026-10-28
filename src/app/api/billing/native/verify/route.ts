import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWorkspace, durableRateLimit } from '@/lib/server/auth';
import { assertSameOrigin, handleApiError, HttpError, readJson } from '@/lib/server/http';
import { nativeApiOptions, withNativeApiCors } from '@/lib/server/native-route';
import { nativeLegalEligible, verifyNativePurchase } from '@/lib/billing/native-server';
import { nativePublicConfiguration } from '@/lib/billing/native-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const bodySchema = z.discriminatedUnion('platform', [
  z
    .object({
      workspaceId: z.uuid(),
      platform: z.literal('ios'),
      productId: z.string().max(200),
      jwsRepresentation: z.string().min(20).max(50_000),
    })
    .strict(),
  z
    .object({
      workspaceId: z.uuid(),
      platform: z.literal('android'),
      productId: z.string().max(200),
      purchaseToken: z.string().min(10).max(8_192),
    })
    .strict(),
]);
async function handlePOST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = bodySchema.parse(await readJson(request, 55_000));
    const { user, workspace } = await requireWorkspace(body.workspaceId, { roles: ['owner'] });
    if (workspace.kind !== 'personal')
      throw new HttpError(400, 'Native Pro requires a personal workspace.');
    await durableRateLimit(user.id, 'billing:native:verify', 15);
    if (!(await nativeLegalEligible(user.id)))
      throw new HttpError(
        428,
        'Accept the current account terms and confirm online-account age eligibility first.',
      );
    const config = nativePublicConfiguration(body.platform);
    if (!config.ready) throw new HttpError(503, 'Native store purchases are not configured yet.');
    if (body.productId !== config.productId)
      throw new HttpError(400, 'This store product is not configured.');
    return NextResponse.json(await verifyNativePurchase(user.id, body.workspaceId, body), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
export const POST = withNativeApiCors(handlePOST);
export const OPTIONS = nativeApiOptions;
