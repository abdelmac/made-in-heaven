import { NextResponse } from 'next/server';
import { billingConfigured, listConfiguredPrices } from '@/lib/billing/stripe';
import { portalConfigurationId } from '@/lib/billing/portal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const configured = billingConfigured();
    return NextResponse.json(
      {
        configured,
        mode: 'test',
        prices: configured
          ? (await listConfiguredPrices()).map((price) => ({
              ...price,
              checkoutAvailable: !!portalConfigurationId(price.tier),
            }))
          : [],
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json(
      {
        configured: false,
        mode: 'test',
        prices: [],
        error: 'Billing configuration needs administrator review.',
      },
      { status: 503 },
    );
  }
}
