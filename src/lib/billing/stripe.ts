import 'server-only';
import Stripe from 'stripe';
import {
  approvedAppOrigin,
  assertStripeSecret,
  matchesBillingMode,
  billingMode,
  stripeAccountId,
  configuredPrices,
  formatStripeAmount,
  type PriceChoice,
} from './config';

let client: Stripe | null = null;
let clientKey: string | undefined;

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  assertStripeSecret(key);
  if (!client || clientKey !== key) {
    client = new Stripe(key, {
      maxNetworkRetries: 2,
      timeout: 15_000,
      appInfo: { name: 'Solace', version: '1.0.0' },
    });
    clientKey = key;
  }
  return client;
}

export async function verifyStripeAccount(): Promise<void> {
  const expected = stripeAccountId();
  if (!expected && billingMode() === 'test') return;
  const stripe = getStripe();
  if (!stripe || (await stripe.accounts.retrieve(null)).id !== expected)
    throw new Error('Stripe account does not match this deployment.');
}

export function billingConfigured(): boolean {
  if (!getStripe() || !process.env.STRIPE_WEBHOOK_SECRET) return false;
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY ||
    !(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  )
    return false;
  approvedAppOrigin();
  return configuredPrices().length > 0;
}

export function assertConfiguredPrice(price: Stripe.Price, choice: PriceChoice): void {
  if (
    !matchesBillingMode(price) ||
    !price.active ||
    price.type !== 'recurring' ||
    price.recurring?.interval !== choice.interval ||
    price.recurring.interval_count !== 1 ||
    price.recurring.usage_type !== 'licensed' ||
    price.billing_scheme !== 'per_unit' ||
    price.unit_amount === null ||
    price.transform_quantity
  ) {
    throw new Error(
      'Configure an active, flat recurring Stripe Price in the deployment billing mode.',
    );
  }
}

export async function listConfiguredPrices() {
  const stripe = getStripe();
  if (!stripe || !billingConfigured()) return [];
  return Promise.all(
    configuredPrices().map(async (choice) => {
      const price = await stripe.prices.retrieve(choice.priceId);
      assertConfiguredPrice(price, choice);
      return {
        ...choice,
        currency: price.currency,
        unitAmount: price.unit_amount!,
        formattedAmount: formatStripeAmount(price.unit_amount!, price.currency),
      };
    }),
  );
}
