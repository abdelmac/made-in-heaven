import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWorkspace, durableRateLimit } from '@/lib/server/auth';
import { assertSameOrigin, handleApiError, HttpError, readJson } from '@/lib/server/http';
import { approvedAppOrigin, configuredPrices, tierForWorkspace } from '@/lib/billing/config';
import { billingConfigured, getStripe } from '@/lib/billing/stripe';
import { billingDatabase } from '@/lib/billing/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { workspaceId } = z
      .object({ workspaceId: z.uuid() })
      .strict()
      .parse(await readJson(request, 4_096));
    const { user, workspace } = await requireWorkspace(workspaceId, { roles: ['owner'] });
    await durableRateLimit(user.id, 'billing:portal', 10);
    if (!billingConfigured()) throw new HttpError(503, 'Billing is not configured.');
    const tier = tierForWorkspace(workspace.kind);
    const configurationId = process.env[`STRIPE_${tier.toUpperCase()}_PORTAL_CONFIGURATION_ID`];
    if (!configurationId)
      throw new HttpError(503, 'The customer portal is not configured for this workspace type.');
    const stripe = getStripe()!;
    const configuration = await stripe.billingPortal.configurations.retrieve(configurationId);
    const allowed = new Set(
      configuredPrices()
        .filter((choice) => choice.tier === tier)
        .map((choice) => choice.priceId),
    );
    const update = configuration.features.subscription_update;
    if (
      !configuration.active ||
      configuration.livemode ||
      (update.enabled &&
        (!update.products?.length ||
          update.default_allowed_updates.includes('quantity') ||
          update.products.some((product) =>
            product.prices.some((priceId) => !allowed.has(priceId)),
          )))
    ) {
      throw new HttpError(
        503,
        'The customer portal plan configuration needs administrator review.',
      );
    }
    const { data, error } = await billingDatabase()
      .from('workspace_subscriptions')
      .select('stripe_customer_id')
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (error) throw error;
    if (!data?.stripe_customer_id)
      throw new HttpError(400, 'This workspace does not have a billing customer yet.');
    const session = await stripe.billingPortal.sessions.create({
      customer: data.stripe_customer_id,
      configuration: configurationId,
      return_url: `${approvedAppOrigin()}/?view=billing`,
    });
    return NextResponse.json({ url: session.url }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return handleApiError(error);
  }
}
