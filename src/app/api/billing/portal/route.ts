import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWorkspace, durableRateLimit } from '@/lib/server/auth';
import { assertSameOrigin, handleApiError, HttpError, readJson } from '@/lib/server/http';
import {
  approvedAppOrigin,
  assertResourceMode,
  assertSubscriptionEnvironment,
  tierForWorkspace,
} from '@/lib/billing/config';
import { billingConfigured, getStripe, verifyStripeAccount } from '@/lib/billing/stripe';
import { assertBillingEnvironment, billingDatabase } from '@/lib/billing/server';
import { getPortalConfiguration } from '@/lib/billing/portal';

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
    const configurationId = await getPortalConfiguration(tier);
    await assertBillingEnvironment();
    await verifyStripeAccount();
    const stripe = getStripe()!;
    const { data, error } = await billingDatabase()
      .from('workspace_subscriptions')
      .select('stripe_customer_id,billing_mode')
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (error) throw error;
    if (!data?.stripe_customer_id)
      throw new HttpError(400, 'This workspace does not have a billing customer yet.');
    assertSubscriptionEnvironment(data);
    const customer = await stripe.customers.retrieve(data.stripe_customer_id);
    if (customer.deleted) throw new HttpError(503, 'Le compte de facturation doit être vérifié.');
    assertResourceMode(customer);
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
