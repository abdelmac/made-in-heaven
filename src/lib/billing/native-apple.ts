import 'server-only';
import {
  AppStoreServerAPIClient,
  Environment,
  SignedDataVerifier,
  type JWSTransactionDecodedPayload,
  type JWSRenewalInfoDecodedPayload,
} from '@apple/app-store-server-library';
import { HttpError } from '@/lib/server/http';
import { appleConfig } from './native-config';
import type { VerifiedNativeSubscription } from './native-types';

export function appleServices() {
  const config = appleConfig();
  const environment =
    config.environment === 'production' ? Environment.PRODUCTION : Environment.SANDBOX;
  return {
    config,
    environment,
    verifier: new SignedDataVerifier(
      config.roots,
      true,
      environment,
      config.bundleId,
      config.appAppleId,
    ),
    api: new AppStoreServerAPIClient(
      config.privateKey,
      config.keyId,
      config.issuerId,
      config.bundleId,
      environment,
    ),
  };
}

export function validateAppleTransaction(
  transaction: JWSTransactionDecodedPayload,
  config: Pick<ReturnType<typeof appleConfig>, 'bundleId' | 'productId' | 'environment'>,
) {
  const environment =
    config.environment === 'production' ? Environment.PRODUCTION : Environment.SANDBOX;
  if (
    transaction.bundleId !== config.bundleId ||
    transaction.productId !== config.productId ||
    transaction.environment !== environment ||
    transaction.type !== 'Auto-Renewable Subscription' ||
    transaction.inAppOwnershipType !== 'PURCHASED' ||
    !transaction.originalTransactionId ||
    !transaction.transactionId ||
    !transaction.appAccountToken ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      transaction.appAccountToken,
    ) ||
    !Number.isFinite(transaction.expiresDate) ||
    !Number.isFinite(transaction.signedDate)
  )
    throw new HttpError(400, 'This Apple subscription cannot be verified for Solace.');
  return transaction;
}

export function appleSubscriptionState(
  transaction: JWSTransactionDecodedPayload,
  renewal: JWSRenewalInfoDecodedPayload,
  status: number,
  config: Pick<ReturnType<typeof appleConfig>, 'bundleId' | 'productId' | 'environment'>,
  now = Date.now(),
): VerifiedNativeSubscription {
  validateAppleTransaction(transaction, config);
  if (
    renewal.originalTransactionId !== transaction.originalTransactionId ||
    renewal.productId !== config.productId ||
    renewal.environment !== transaction.environment
  )
    throw new HttpError(400, 'Apple renewal identity does not match this purchase.');
  let end = transaction.expiresDate!;
  let state: VerifiedNativeSubscription['status'];
  if (status === 5 || transaction.revocationDate !== undefined || transaction.isUpgraded) {
    state = 'revoked';
    end = Math.min(now, transaction.revocationDate ?? now);
  } else if (
    status === 4 &&
    Number.isFinite(renewal.gracePeriodExpiresDate) &&
    renewal.gracePeriodExpiresDate! > now
  ) {
    state = 'grace';
    end = renewal.gracePeriodExpiresDate!;
  } else if (status === 1 && end > now) {
    state = renewal.autoRenewStatus === 0 ? 'canceled' : 'active';
  } else if ([1, 2, 3, 4].includes(status)) {
    state = 'expired';
    end = Math.min(end, now);
  } else throw new HttpError(400, 'Apple subscription status is unsupported.');
  return {
    provider: 'apple',
    environment: config.environment,
    appAccountToken: transaction.appAccountToken!.toLowerCase(),
    purchaseReference: transaction.originalTransactionId!,
    productId: config.productId,
    basePlanId: null,
    transactionId: transaction.transactionId!,
    status: state,
    currentPeriodEnd: new Date(end).toISOString(),
    acknowledged: true,
  };
}

/** Re-query Apple, rather than treating a valid but old client JWS as current. */
export async function verifyAppleSubscription(reference: string, expectedAccountToken: string) {
  const { config, api, verifier, environment } = appleServices();
  let response;
  try {
    response = await api.getAllSubscriptionStatuses(reference);
  } catch {
    throw new HttpError(503, 'Apple subscription status is temporarily unavailable.');
  }
  if (
    response.environment !== environment ||
    response.bundleId !== config.bundleId ||
    response.appAppleId !== config.appAppleId
  )
    throw new HttpError(400, 'Apple server returned another app or environment.');
  const matches: {
    transaction: JWSTransactionDecodedPayload;
    renewal: JWSRenewalInfoDecodedPayload;
    status: number;
  }[] = [];
  for (const group of response.data ?? []) {
    for (const item of group.lastTransactions ?? []) {
      if (!item.signedTransactionInfo || !item.signedRenewalInfo || item.status === undefined)
        continue;
      let transaction, renewal;
      try {
        transaction = await verifier.verifyAndDecodeTransaction(item.signedTransactionInfo);
        renewal = await verifier.verifyAndDecodeRenewalInfo(item.signedRenewalInfo);
      } catch {
        throw new HttpError(400, 'Apple signed subscription information is invalid.');
      }
      if (
        transaction.originalTransactionId !== reference ||
        transaction.productId !== config.productId
      )
        continue;
      validateAppleTransaction(transaction, config);
      if (transaction.appAccountToken?.toLowerCase() !== expectedAccountToken.toLowerCase())
        throw new HttpError(409, 'This purchase belongs to another Solace account.');
      matches.push({ transaction, renewal, status: item.status });
    }
  }
  const latest = matches.sort(
    (a, b) => (b.transaction.signedDate ?? 0) - (a.transaction.signedDate ?? 0),
  )[0];
  if (!latest) throw new HttpError(400, 'Apple did not return this configured subscription.');
  return appleSubscriptionState(latest.transaction, latest.renewal, latest.status, config);
}

export async function decodeApplePurchase(jws: string) {
  const { config, verifier } = appleServices();
  try {
    return validateAppleTransaction(await verifier.verifyAndDecodeTransaction(jws), config);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'The Apple purchase signature is invalid.');
  }
}
