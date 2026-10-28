export type NativePlatform = 'ios' | 'android';
export type NativeProvider = 'apple' | 'google';
export type NativeEnvironment = 'sandbox' | 'production';
export type NativeSubscriptionStatus =
  'active' | 'grace' | 'canceled' | 'expired' | 'revoked' | 'pending' | 'on_hold' | 'paused';

/** Only server-verified provider responses may produce this record. */
export interface VerifiedNativeSubscription {
  provider: NativeProvider;
  environment: NativeEnvironment;
  appAccountToken: string;
  purchaseReference: string;
  productId: string;
  basePlanId: string | null;
  transactionId: string;
  status: NativeSubscriptionStatus;
  currentPeriodEnd: string;
  acknowledged: boolean;
  revokedTransactionId?: string;
  clearRevokedTransactionId?: string;
  // Google replacement tokens must not create two simultaneous paid grants.
  linkedPurchaseReference?: string;
}

export type NativeVerificationInput =
  | { platform: 'ios'; productId: string; jwsRepresentation: string }
  | { platform: 'android'; productId: string; purchaseToken: string };
