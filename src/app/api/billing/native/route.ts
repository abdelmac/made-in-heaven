import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWorkspace, durableRateLimit } from '@/lib/server/auth';
import { handleApiError, HttpError } from '@/lib/server/http';
import { nativeApiOptions, withNativeApiCors } from '@/lib/server/native-route';
import { nativePublicConfiguration, nativePurchaseLaunchReady } from '@/lib/billing/native-config';
import {
  nativeLegalEligible,
  nativePurchaseAvailable,
  pendingNativePurchaseIntent,
  prepareNativeBilling,
  refreshNativeWorkspace,
} from '@/lib/billing/native-server';
import { getWorkspaceEntitlements } from '@/lib/billing/server';
import { verifyGoogleProductConfiguration } from '@/lib/billing/native-google';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const workspaceId = z.uuid().parse(params.get('workspaceId'));
    const platform = z.enum(['ios', 'android']).parse(params.get('platform'));
    const { user, workspace } = await requireWorkspace(workspaceId, { roles: ['owner'] });
    if (workspace.kind !== 'personal')
      throw new HttpError(400, 'Native Pro is available for personal workspaces.');
    await durableRateLimit(user.id, 'billing:native:read', 30);
    const config = nativePublicConfiguration(platform);
    const legalEligible = await nativeLegalEligible(user.id);
    let appAccountToken: string | null = null;
    let refreshPending = false;
    let billingPeriod: 'P1M' | null = null;
    let purchaseAllowed = false;
    let pendingPurchaseIntent = null;
    if (config.ready && legalEligible) {
      if (platform === 'android') billingPeriod = await verifyGoogleProductConfiguration();
      appAccountToken = await prepareNativeBilling(user.id, workspaceId);
      try {
        await refreshNativeWorkspace(user.id, workspaceId);
      } catch {
        refreshPending = true;
      }
      purchaseAllowed = !refreshPending && (await nativePurchaseAvailable(workspaceId));
      pendingPurchaseIntent = await pendingNativePurchaseIntent(workspaceId);
    }
    return NextResponse.json(
      {
        ...config,
        ready: config.ready && legalEligible,
        reason: legalEligible
          ? config.ready
            ? nativePurchaseLaunchReady()
              ? null
              : 'launch_review_required'
            : 'store_configuration_required'
          : 'legal_acceptance_required',
        appAccountToken,
        refreshPending,
        billingPeriod,
        purchaseAllowed,
        pendingPurchaseIntent,
        entitlements: await getWorkspaceEntitlements(workspaceId),
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
export const GET = withNativeApiCors(handleGET);
export const OPTIONS = nativeApiOptions;
