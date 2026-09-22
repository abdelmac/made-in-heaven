import 'server-only';
import type Stripe from 'stripe';
import { configuredPrices, matchesBillingMode, type PaidTier } from './config';
import { getStripe } from './stripe';
import { HttpError } from '@/lib/server/http';

export function portalConfigurationId(tier: PaidTier): string | null {
  const value = process.env[`STRIPE_${tier.toUpperCase()}_PORTAL_CONFIGURATION_ID`];
  return value && /^bpc_[A-Za-z0-9]+$/.test(value) ? value : null;
}

export function assertPortalConfiguration(
  configuration: Stripe.BillingPortal.Configuration,
  tier: PaidTier,
): void {
  const allowed = new Set(
    configuredPrices()
      .filter((choice) => choice.tier === tier)
      .map((choice) => choice.priceId),
  );
  const { subscription_update: update, subscription_cancel: cancel } = configuration.features;
  if (
    !configuration.active ||
    !matchesBillingMode(configuration) ||
    !cancel.enabled ||
    cancel.mode !== 'at_period_end' ||
    !configuration.features.payment_method_update.enabled ||
    !configuration.features.invoice_history.enabled ||
    (update.enabled &&
      (!update.products?.length ||
        update.default_allowed_updates.includes('quantity') ||
        update.products.some(
          (product) =>
            !product.prices.length || product.prices.some((priceId) => !allowed.has(priceId)),
        )))
  ) {
    throw new HttpError(503, 'The customer portal plan configuration needs administrator review.');
  }
}

// Validate management access before creating a payable Checkout session, too.
// Every subscription must have a working cancellation and payment-recovery path.
export async function getPortalConfiguration(tier: PaidTier): Promise<string> {
  const id = portalConfigurationId(tier);
  const stripe = getStripe();
  if (!id || !stripe)
    throw new HttpError(503, 'The customer portal is not configured for this workspace type.');
  const configuration = await stripe.billingPortal.configurations.retrieve(id);
  assertPortalConfiguration(configuration, tier);
  return id;
}
