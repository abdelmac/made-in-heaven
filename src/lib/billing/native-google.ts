import 'server-only';
import { GoogleAuth, OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import { HttpError } from '@/lib/server/http';
import { googleConfig } from './native-config';
import type { VerifiedNativeSubscription } from './native-types';

const lineSchema = z.object({
  productId: z.string(),
  expiryTime: z.string().optional(),
  latestSuccessfulOrderId: z.string().optional(),
  offerDetails: z.object({ basePlanId: z.string(), offerId: z.string().optional() }),
  autoRenewingPlan: z.object({ autoRenewEnabled: z.boolean() }).optional(),
});
const purchaseSchema = z.object({
  subscriptionState: z.string(),
  acknowledgementState: z.string(),
  lineItems: z.array(lineSchema).min(1).max(10),
  testPurchase: z.object({}).optional(),
  linkedPurchaseToken: z.string().optional(),
  externalAccountIdentifiers: z
    .object({ obfuscatedExternalAccountId: z.string().optional() })
    .optional(),
});

export function googleSubscriptionState(
  raw: unknown,
  purchaseToken: string,
  config: Pick<ReturnType<typeof googleConfig>, 'environment' | 'productId' | 'basePlanId'>,
  expectedAccountToken?: string,
  now = Date.now(),
): VerifiedNativeSubscription {
  const parsed = purchaseSchema.safeParse(raw);
  if (!parsed.success) throw new HttpError(400, 'Google Play returned an invalid subscription.');
  const purchase = parsed.data;
  const account = purchase.externalAccountIdentifiers?.obfuscatedExternalAccountId?.toLowerCase();
  if (
    !account ||
    !z.uuid().safeParse(account).success ||
    (expectedAccountToken && account !== expectedAccountToken.toLowerCase())
  )
    throw new HttpError(409, 'This purchase belongs to another Solace account.');
  if ((purchase.testPurchase !== undefined) !== (config.environment === 'sandbox'))
    throw new HttpError(400, 'This Google Play purchase belongs to another environment.');
  const line = purchase.lineItems[0];
  if (
    purchase.lineItems.length !== 1 ||
    line.productId !== config.productId ||
    line.offerDetails.basePlanId !== config.basePlanId ||
    !line.autoRenewingPlan ||
    line.offerDetails.offerId
  )
    throw new HttpError(400, 'This Google Play product or base plan is not configured.');
  const states: Record<string, VerifiedNativeSubscription['status']> = {
    SUBSCRIPTION_STATE_ACTIVE: 'active',
    SUBSCRIPTION_STATE_IN_GRACE_PERIOD: 'grace',
    SUBSCRIPTION_STATE_CANCELED: 'canceled',
    SUBSCRIPTION_STATE_EXPIRED: 'expired',
    SUBSCRIPTION_STATE_PENDING: 'pending',
    SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED: 'expired',
    SUBSCRIPTION_STATE_ON_HOLD: 'on_hold',
    SUBSCRIPTION_STATE_PAUSED: 'paused',
  };
  const state = states[purchase.subscriptionState];
  if (
    !state ||
    !['ACKNOWLEDGEMENT_STATE_PENDING', 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED'].includes(
      purchase.acknowledgementState,
    )
  )
    throw new HttpError(400, 'Google Play subscription state is unsupported.');
  let end = line.expiryTime ? Date.parse(line.expiryTime) : now;
  if (!Number.isFinite(end))
    throw new HttpError(400, 'Google Play subscription expiry is invalid.');
  if (['pending', 'expired', 'on_hold', 'paused'].includes(state)) end = Math.min(now, end);
  return {
    provider: 'google',
    environment: config.environment,
    appAccountToken: account,
    purchaseReference: purchaseToken,
    productId: config.productId,
    basePlanId: config.basePlanId,
    transactionId: line.latestSuccessfulOrderId ?? '',
    status: state,
    currentPeriodEnd: new Date(end).toISOString(),
    acknowledged: purchase.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
    ...(purchase.linkedPurchaseToken
      ? { linkedPurchaseReference: purchase.linkedPurchaseToken }
      : {}),
  };
}

async function googleRequest(path: string, method = 'GET') {
  const config = googleConfig();
  const auth = new GoogleAuth({
    credentials: config.credentials,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });
  try {
    const client = await auth.getClient();
    const access = await client.getAccessToken();
    if (!access.token) throw new Error();
    const response = await fetch(
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(config.packageName)}/${path}`,
      {
        method,
        headers: { Authorization: `Bearer ${access.token}`, 'Content-Type': 'application/json' },
        ...(method === 'POST' ? { body: '{}' } : {}),
        signal: AbortSignal.timeout(15_000),
        cache: 'no-store',
      },
    );
    if (!response.ok) throw new Error();
    return response.status === 204 || method === 'POST' ? null : await response.json();
  } catch {
    throw new HttpError(503, 'Google Play subscription verification is temporarily unavailable.');
  }
}

export async function verifyGoogleSubscription(
  purchaseToken: string,
  expectedAccountToken?: string,
) {
  const config = googleConfig();
  await verifyGoogleProductConfiguration();
  const raw = await googleRequest(
    `purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`,
  );
  return googleSubscriptionState(raw, purchaseToken, config, expectedAccountToken);
}

export async function verifyGoogleProductConfiguration(): Promise<'P1M'> {
  const config = googleConfig();
  const raw = await googleRequest(`subscriptions/${encodeURIComponent(config.productId)}`);
  const parsed = z
    .object({
      packageName: z.string(),
      productId: z.string(),
      basePlans: z.array(
        z.object({
          basePlanId: z.string(),
          state: z.string(),
          autoRenewingBasePlanType: z.object({ billingPeriodDuration: z.string() }).optional(),
        }),
      ),
    })
    .safeParse(raw);
  const plan = parsed.success
    ? parsed.data.basePlans.find((candidate) => candidate.basePlanId === config.basePlanId)
    : undefined;
  if (
    !parsed.success ||
    parsed.data.packageName !== config.packageName ||
    parsed.data.productId !== config.productId ||
    !plan ||
    plan.state !== 'ACTIVE' ||
    plan.autoRenewingBasePlanType?.billingPeriodDuration !== 'P1M'
  )
    throw new HttpError(
      503,
      'The configured Google Play product is not an active monthly subscription.',
    );
  return 'P1M';
}

/** Only call after commit_native_billing_state has durably saved the grant. */
export async function acknowledgeGoogleSubscription(purchaseToken: string) {
  const config = googleConfig();
  await googleRequest(
    `purchases/subscriptions/${encodeURIComponent(config.productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`,
    'POST',
  );
}

export async function authenticateGooglePush(request: Request) {
  const config = googleConfig();
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ') || authorization.length > 16_000)
    throw new HttpError(401, 'A verified Google Pub/Sub identity is required.');
  try {
    const ticket = await new OAuth2Client().verifyIdToken({
      idToken: authorization.slice(7),
      audience: config.pushAudience,
    });
    const claims = ticket.getPayload();
    if (
      !claims ||
      claims.email !== config.pushServiceAccount ||
      claims.email_verified !== true ||
      !['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss)
    )
      throw new Error();
  } catch {
    throw new HttpError(401, 'Google Pub/Sub identity could not be verified.');
  }
}
