import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWorkspace, durableRateLimit } from '@/lib/server/auth';
import { handleApiError } from '@/lib/server/http';
import {
  billingConfigured,
  getStripe,
  listConfiguredPrices,
  verifyStripeAccount,
} from '@/lib/billing/stripe';
import { billingDatabase, getWorkspaceEntitlements } from '@/lib/billing/server';
import {
  assertResourceMode,
  assertSubscriptionEnvironment,
  billingMode,
  tierForWorkspace,
} from '@/lib/billing/config';
import { portalConfigurationId } from '@/lib/billing/portal';
import { checkoutLaunchReady } from '@/lib/billing/launch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const workspaceId = z.uuid().parse(new URL(request.url).searchParams.get('workspaceId'));
    const { role, user, workspace } = await requireWorkspace(workspaceId);
    await durableRateLimit(user.id, 'billing:read', 60);
    const configured = billingConfigured();
    const checkoutEnabled = configured && checkoutLaunchReady();
    if (configured) await verifyStripeAccount();
    const db = billingDatabase();
    const { data: subscription, error } = await db
      .from('workspace_subscriptions')
      .select('*')
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (error) throw error;
    assertSubscriptionEnvironment(subscription);
    const [entitlements, prices, invoices] = await Promise.all([
      getWorkspaceEntitlements(workspaceId),
      configured ? listConfiguredPrices() : Promise.resolve([]),
      configured && role === 'owner' && subscription?.stripe_customer_id
        ? getStripe()!
            .invoices.list({ customer: subscription.stripe_customer_id, limit: 24 })
            .then((list) =>
              list.data.map((invoice) => {
                assertResourceMode(invoice);
                return {
                  id: invoice.id,
                  number: invoice.number,
                  status: invoice.status,
                  total: invoice.total,
                  currency: invoice.currency,
                  created: new Date(invoice.created * 1000).toISOString(),
                  hostedInvoiceUrl: invoice.hosted_invoice_url,
                  invoicePdf: invoice.invoice_pdf,
                };
              }),
            )
        : Promise.resolve([]),
    ]);
    return NextResponse.json(
      {
        configured,
        mode: billingMode(),
        checkoutEnabled,
        canManage: role === 'owner',
        portalAvailable:
          configured &&
          role === 'owner' &&
          !!subscription?.stripe_customer_id &&
          !!portalConfigurationId(tierForWorkspace(workspace.kind)),
        message: configured
          ? null
          : 'Billing is not configured. Checkout is unavailable; your existing work stays accessible.',
        subscription: subscription
          ? {
              tier: subscription.tier,
              status: subscription.status,
              currentPeriodEnd: subscription.current_period_end,
              paidThrough: subscription.paid_through,
              cancelAtPeriodEnd: subscription.cancel_at_period_end,
              cancelAt: subscription.cancel_at,
            }
          : null,
        entitlements,
        prices: prices.map((price) => ({
          ...price,
          checkoutAvailable: checkoutEnabled && !!portalConfigurationId(price.tier),
        })),
        invoices,
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
