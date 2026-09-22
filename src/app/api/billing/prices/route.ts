import { NextResponse } from 'next/server';
import { billingConfigured, listConfiguredPrices, verifyStripeAccount } from '@/lib/billing/stripe';
import { portalConfigurationId } from '@/lib/billing/portal';
import { billingMode } from '@/lib/billing/config';
import { checkoutLaunchReady } from '@/lib/billing/launch';
import { assertBillingEnvironment } from '@/lib/billing/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const configured = billingConfigured();
    if (configured) {
      await assertBillingEnvironment();
      await verifyStripeAccount();
    }
    const checkoutEnabled = configured && checkoutLaunchReady();
    return NextResponse.json(
      {
        configured,
        mode: billingMode(),
        checkoutEnabled,
        prices: configured
          ? (await listConfiguredPrices()).map((price) => ({
              ...price,
              checkoutAvailable: checkoutEnabled && !!portalConfigurationId(price.tier),
            }))
          : [],
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json(
      {
        configured: false,
        mode: null,
        checkoutEnabled: false,
        prices: [],
        error: 'Billing configuration needs administrator review.',
      },
      { status: 503 },
    );
  }
}
