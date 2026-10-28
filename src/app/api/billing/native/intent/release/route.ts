import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWorkspace, durableRateLimit } from '@/lib/server/auth';
import { assertSameOrigin, handleApiError, HttpError, readJson } from '@/lib/server/http';
import { nativeApiOptions, withNativeApiCors } from '@/lib/server/native-route';
import { releaseNativePurchase } from '@/lib/billing/native-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const schema = z.object({ workspaceId: z.uuid(), intentId: z.uuid() }).strict();
async function handlePOST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = schema.parse(await readJson(request, 2048));
    const { user, workspace } = await requireWorkspace(body.workspaceId, { roles: ['owner'] });
    if (workspace.kind !== 'personal')
      throw new HttpError(400, 'Native purchases require a personal workspace.');
    await durableRateLimit(user.id, 'billing:native:intent:release', 10);
    return NextResponse.json(
      await releaseNativePurchase(user.id, body.workspaceId, body.intentId),
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
export const POST = withNativeApiCors(handlePOST);
export const OPTIONS = nativeApiOptions;
