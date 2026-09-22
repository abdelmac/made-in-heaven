import { launchInformationReady } from '@/lib/launch-config';
import { approvedAppOrigin, billingMode, stripeAccountId } from './config';

// This controls NEW purchases only. Cancellation, invoices, existing entitlements
// and signed webhook reconciliation must keep working when checkout is paused.
export function checkoutLaunchReady(
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (billingMode(env) === 'test') return true;
  stripeAccountId(env);
  const origin = approvedAppOrigin(env);
  return (
    new URL(origin).protocol === 'https:' &&
    env.STRIPE_LIVE_CHECKOUT_ENABLED === 'true' &&
    env.SOLACE_COMMERCIAL_HOSTING_CONFIRMED === 'true' &&
    env.SOLACE_AUTH_EMAIL_VERIFIED === 'true' &&
    env.SOLACE_LAUNCH_REVIEWED === 'true' &&
    launchInformationReady(env)
  );
}
