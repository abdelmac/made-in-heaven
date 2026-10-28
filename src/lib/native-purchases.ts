import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import type {
  NativePurchasesPlugin,
  Product,
  Transaction,
  PURCHASE_TYPE,
} from '@capgo/native-purchases';
import { z } from 'zod';
import { appFetch } from './app-fetch';
import { isNativeApp } from './mobile-platform';

export type NativeStorePlatform = 'ios' | 'android';
export type NativePurchaseScope = { workspaceId: string; isCurrent: () => boolean };
export type NativePurchaseIssue =
  | 'unavailable'
  | 'cancelled'
  | 'pending'
  | 'verification'
  | 'account-changed'
  | 'offer-changed'
  | 'purchase-blocked'
  | 'intent-expired'
  | 'store';

const messages: Record<NativePurchaseIssue, string> = {
  unavailable:
    'Les achats dans la boutique ne sont pas encore disponibles pour ce compte ou cet appareil.',
  cancelled: 'Achat annulé. Aucun nouvel accès n’a été activé.',
  pending:
    'La boutique attend la confirmation du paiement. Votre accès sera vérifié à son retour ; ne rachetez pas l’abonnement.',
  verification:
    'L’achat reste à vérifier. Utilisez « Restaurer mes achats » pour réessayer sans payer de nouveau.',
  'account-changed':
    'Le compte ou l’espace a changé. Revenez dans votre espace personnel pour vérifier vos achats.',
  'offer-changed': 'L’offre de la boutique a changé. Actualisez-la avant de confirmer un achat.',
  'purchase-blocked':
    'Un abonnement ou une commande reste à vérifier pour ce compte. Vérifiez votre abonnement existant ou contactez l’assistance avant un nouvel achat.',
  'intent-expired':
    'Le délai de confirmation de cette tentative d’achat est dépassé. Un nouvel achat reste bloqué pour éviter une double facturation. Restaurez vos achats ou contactez l’assistance.',
  store:
    'La boutique n’a pas pu terminer cette opération. Vérifiez votre connexion, puis réessayez.',
};

export class NativePurchaseError extends Error {
  constructor(public readonly issue: NativePurchaseIssue) {
    super(messages[issue]);
  }
}

/** Never surface native/provider errors that might contain a purchase token or receipt. */
export function nativePurchaseError(error: unknown): NativePurchaseError {
  if (error instanceof NativePurchaseError) return error;
  const value =
    error && typeof error === 'object' ? (error as { code?: unknown; message?: unknown }) : {};
  const code = `${typeof value.code === 'string' ? value.code : ''} ${typeof value.message === 'string' ? value.message : ''}`;
  if (/cancelled|canceled|USER_CANCEL/i.test(code)) return new NativePurchaseError('cancelled');
  if (/pending/i.test(code)) return new NativePurchaseError('pending');
  if (/ITEM_ALREADY_OWNED|already owned/i.test(code))
    return new NativePurchaseError('verification');
  return new NativePurchaseError('store');
}

function explicitStoreCancellation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { code?: unknown; message?: unknown };
  // Exact signals emitted by NativePurchases 8.9.6: StoreKit's "User cancelled"
  // and Play Billing's USER_CANCELED code. Ambiguous failures retain the fence.
  return (
    value.code === 'USER_CANCELED' ||
    value.code === 'USER_CANCELLED' ||
    (typeof value.message === 'string' &&
      /^(?:User cancel(?:led|ed)|USER_CANCEL(?:ED|LED))$/.test(value.message))
  );
}

const intentSchema = z.object({
  intentId: z.uuid(),
  expiresAt: z.string().refine((value) => Number.isFinite(Date.parse(value))),
});
const configurationSchema = z.object({
  ready: z.boolean(),
  purchaseAllowed: z.boolean().default(false),
  platform: z.enum(['ios', 'android']),
  productId: z.string().min(1).max(255).nullable(),
  basePlanId: z.string().min(1).max(255).nullable(),
  billingPeriod: z.literal('P1M').nullable(),
  appAccountToken: z.uuid().nullable(),
  environment: z.enum(['sandbox', 'production']),
  refreshPending: z.boolean().default(false),
  reason: z.string().nullable().optional(),
  pendingPurchaseIntent: intentSchema
    .extend({ platform: z.enum(['ios', 'android']) })
    .nullable()
    .default(null),
  entitlements: z.object({ tier: z.enum(['free', 'pro', 'team']) }).passthrough(),
});

export type NativeStoreConfiguration = z.infer<typeof configurationSchema>;
export type NativeStoreOffer = {
  productId: string;
  basePlanId: string | null;
  offerToken?: string;
  title: string;
  description: string;
  priceString: string;
  price: number;
};
export type NativePurchaseRecovery = { verified: number; pending: boolean; unfinished: boolean };
export type NativePurchasePreparation = {
  configuration: NativeStoreConfiguration;
  offer: NativeStoreOffer | null;
  recovery: NativePurchaseRecovery;
};

export function nativeStorePlatform(): NativeStorePlatform | null {
  if (!isNativeApp()) return null;
  const platform = Capacitor.getPlatform();
  return platform === 'ios' || platform === 'android' ? platform : null;
}

/** Only a standard, one-month base plan is offered; trials/commitments need separate disclosures. */
export function selectNativeMonthlyOffer(
  configuration: NativeStoreConfiguration,
  products: Product[],
): NativeStoreOffer | null {
  if (!configuration.ready || !configuration.productId || !configuration.appAccountToken)
    return null;
  const product = products.find((candidate) => {
    const matches =
      configuration.platform === 'ios'
        ? candidate.identifier === configuration.productId
        : candidate.planIdentifier === configuration.productId &&
          candidate.identifier === configuration.basePlanId &&
          !candidate.offerId;
    const period = candidate.subscriptionPeriod;
    const monthlyPeriod =
      period?.numberOfUnits === 1 &&
      (period.unitString === 'month' || (!period.unitString && period.unit === 2));
    // The Android 8.9.6 bridge omits subscriptionPeriod. Its selected base plan
    // must therefore have been verified as P1M by the server's Google catalog query.
    const monthly =
      configuration.platform === 'android'
        ? configuration.billingPeriod === 'P1M' && (!period || monthlyPeriod)
        : monthlyPeriod;
    return (
      matches &&
      monthly &&
      !candidate.introductoryPrice &&
      candidate.title?.trim() &&
      candidate.priceString?.trim() &&
      Number.isFinite(candidate.price) &&
      candidate.price > 0 &&
      (configuration.platform !== 'android' || Boolean(candidate.offerToken))
    );
  });
  if (!product) return null;
  return {
    productId: configuration.productId,
    basePlanId: configuration.basePlanId,
    offerToken: product.offerToken,
    title: product.title,
    description: product.description,
    priceString: product.priceString,
    price: product.price,
  };
}

export type NativePurchaseBridge = Pick<
  NativePurchasesPlugin,
  | 'configure'
  | 'getProducts'
  | 'isBillingSupported'
  | 'purchaseProduct'
  | 'getPurchases'
  | 'getUnfinishedTransactions'
  | 'restorePurchases'
  | 'finishTransaction'
  | 'manageSubscriptions'
  | 'addListener'
>;
type Dependencies = {
  platform: () => NativeStorePlatform | null;
  plugin: () => Promise<{ bridge: NativePurchaseBridge }>;
  request: typeof appFetch;
};

/** Injectable bridge for tests; receipt material stays in this operation's memory only. */
export function createNativePurchaseAdapter(dependencies: Dependencies) {
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(operation: () => Promise<T>): Promise<T> => {
    const pending = queue.catch(() => undefined).then(operation);
    queue = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending.catch((error) => {
      throw nativePurchaseError(error);
    });
  };
  const assertScope = (scope: NativePurchaseScope) => {
    if (!scope.isCurrent()) throw new NativePurchaseError('account-changed');
  };
  const readConfiguration = async (scope: NativePurchaseScope) => {
    assertScope(scope);
    const platform = dependencies.platform();
    if (!platform) throw new NativePurchaseError('unavailable');
    const response = await dependencies
      .request(
        `/api/billing/native?workspaceId=${encodeURIComponent(scope.workspaceId)}&platform=${platform}`,
        { cache: 'no-store' },
      )
      .catch(() => {
        throw new NativePurchaseError('unavailable');
      });
    assertScope(scope);
    const parsed = configurationSchema.safeParse(await response.json().catch(() => null));
    if (!response.ok || !parsed.success || parsed.data.platform !== platform)
      throw new NativePurchaseError('unavailable');
    return parsed.data;
  };
  const connect = async (scope: NativePurchaseScope, configuration: NativeStoreConfiguration) => {
    assertScope(scope);
    if (
      !configuration.ready ||
      !configuration.productId ||
      !configuration.appAccountToken ||
      (configuration.platform === 'android' && !configuration.basePlanId)
    )
      throw new NativePurchaseError('unavailable');
    const { bridge: plugin } = await dependencies.plugin();
    await plugin.configure({ autoFinishTransactions: false });
    assertScope(scope);
    if (!(await plugin.isBillingSupported()).isBillingSupported)
      throw new NativePurchaseError('unavailable');
    assertScope(scope);
    // Capacitor synthesizes a `then` member on native plugin proxies. Returning
    // the raw proxy from an async function would accidentally assimilate it.
    return { bridge: plugin };
  };
  const matching = (transaction: Transaction, configuration: NativeStoreConfiguration) =>
    transaction.productIdentifier === configuration.productId &&
    transaction.appAccountToken?.toLowerCase() === configuration.appAccountToken?.toLowerCase();

  const reserve = async (scope: NativePurchaseScope, configuration: NativeStoreConfiguration) => {
    assertScope(scope);
    const response = await dependencies
      .request('/api/billing/native/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: scope.workspaceId,
          platform: configuration.platform,
          productId: configuration.productId,
        }),
      })
      .catch(() => {
        throw new NativePurchaseError('purchase-blocked');
      });
    assertScope(scope);
    const parsed = intentSchema.safeParse(await response.json().catch(() => null));
    if (!response.ok || !parsed.success) throw new NativePurchaseError('purchase-blocked');
    if (Date.parse(parsed.data.expiresAt) <= Date.now())
      throw new NativePurchaseError('intent-expired');
    return parsed.data;
  };
  const releaseCancelled = async (scope: NativePurchaseScope, intentId: string) => {
    assertScope(scope);
    const response = await dependencies
      .request('/api/billing/native/intent/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: scope.workspaceId, intentId }),
      })
      .catch(() => {
        throw new NativePurchaseError('purchase-blocked');
      });
    assertScope(scope);
    const body = (await response.json().catch(() => null)) as { released?: boolean } | null;
    if (!response.ok || body?.released !== true) throw new NativePurchaseError('purchase-blocked');
  };

  const deliver = async (
    scope: NativePurchaseScope,
    configuration: NativeStoreConfiguration,
    plugin: NativePurchaseBridge,
    transaction: Transaction,
  ): Promise<NativePurchaseRecovery> => {
    assertScope(scope);
    if (!matching(transaction, configuration)) throw new NativePurchaseError('account-changed');
    if (configuration.platform === 'android' && transaction.purchaseState !== '1')
      return { verified: 0, pending: true, unfinished: false };
    const evidence =
      configuration.platform === 'ios' ? transaction.jwsRepresentation : transaction.purchaseToken;
    if (!evidence || (configuration.platform === 'ios' && !/^\d+$/.test(transaction.transactionId)))
      throw new NativePurchaseError('verification');
    const response = await dependencies
      .request('/api/billing/native/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: scope.workspaceId,
          platform: configuration.platform,
          productId: configuration.productId,
          ...(configuration.platform === 'ios'
            ? { jwsRepresentation: evidence }
            : { purchaseToken: evidence }),
        }),
      })
      .catch(() => {
        throw new NativePurchaseError('verification');
      });
    assertScope(scope);
    const body = (await response.json().catch(() => null)) as {
      verified?: boolean;
      acknowledged?: boolean;
    } | null;
    if (
      !response.ok ||
      body?.verified !== true ||
      (configuration.platform === 'android' && body.acknowledged !== true)
    )
      throw new NativePurchaseError('verification');
    // Android acknowledgment belongs to the server, after durable persistence.
    // StoreKit finishing is safe only after the server confirms this delivery.
    let unfinished = false;
    if (configuration.platform === 'ios') {
      assertScope(scope);
      try {
        await plugin.finishTransaction({ transactionId: transaction.transactionId });
      } catch {
        unfinished = true;
      }
    }
    return { verified: 1, pending: false, unfinished };
  };
  const recover = async (
    scope: NativePurchaseScope,
    configuration: NativeStoreConfiguration,
    plugin: NativePurchaseBridge,
    explicit: boolean,
  ) => {
    if (explicit) {
      assertScope(scope);
      await plugin.restorePurchases();
    }
    assertScope(scope);
    const { purchases } = await plugin.getPurchases({
      productType: 'subs' as PURCHASE_TYPE,
      appAccountToken: configuration.appAccountToken!,
      onlyCurrentEntitlements: true,
    });
    assertScope(scope);
    const { transactions } = await plugin.getUnfinishedTransactions();
    const seen = new Set<string>();
    const result: NativePurchaseRecovery = { verified: 0, pending: false, unfinished: false };
    for (const transaction of [...purchases, ...transactions]) {
      assertScope(scope);
      if (!matching(transaction, configuration)) continue;
      const id =
        configuration.platform === 'ios' ? transaction.transactionId : transaction.purchaseToken;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      try {
        const delivery = await deliver(scope, configuration, plugin, transaction);
        result.verified += delivery.verified;
        result.pending ||= delivery.pending;
        result.unfinished ||= delivery.unfinished;
      } catch (error) {
        if (error instanceof NativePurchaseError && error.issue === 'account-changed') throw error;
        result.unfinished = true;
      }
    }
    return result;
  };
  const products = async (
    plugin: NativePurchaseBridge,
    configuration: NativeStoreConfiguration,
  ) => {
    const result = await plugin.getProducts({
      productIdentifiers: [configuration.productId!],
      productType: 'subs' as PURCHASE_TYPE,
    });
    return selectNativeMonthlyOffer(configuration, result.products);
  };

  return {
    prepare: (scope: NativePurchaseScope) =>
      serial(async (): Promise<NativePurchasePreparation> => {
        const configuration = await readConfiguration(scope);
        if (!configuration.ready)
          return {
            configuration,
            offer: null,
            recovery: { verified: 0, pending: false, unfinished: false },
          };
        const { bridge: plugin } = await connect(scope, configuration);
        const recovery = await recover(scope, configuration, plugin, false);
        const offer = await products(plugin, configuration);
        assertScope(scope);
        return { configuration, offer, recovery };
      }),
    purchase: (scope: NativePurchaseScope, displayed: NativeStoreOffer) =>
      serial(async () => {
        const configuration = await readConfiguration(scope);
        if (configuration.reason === 'launch_review_required')
          throw new NativePurchaseError('unavailable');
        if (configuration.pendingPurchaseIntent)
          throw new NativePurchaseError(
            Date.parse(configuration.pendingPurchaseIntent.expiresAt) <= Date.now()
              ? 'intent-expired'
              : 'purchase-blocked',
          );
        if (!configuration.purchaseAllowed) throw new NativePurchaseError('purchase-blocked');
        if (configuration.entitlements.tier !== 'free' || configuration.refreshPending)
          throw new NativePurchaseError('verification');
        const { bridge: plugin } = await connect(scope, configuration);
        const current = await products(plugin, configuration);
        if (
          !current ||
          current.productId !== displayed.productId ||
          current.basePlanId !== displayed.basePlanId ||
          current.offerToken !== displayed.offerToken ||
          current.price !== displayed.price ||
          current.priceString !== displayed.priceString
        )
          throw new NativePurchaseError('offer-changed');
        // Recheck recovery immediately before opening a second payment sheet.
        const previous = await recover(scope, configuration, plugin, false);
        if (previous.pending || previous.unfinished) throw new NativePurchaseError('verification');
        if (previous.verified) return previous;
        // The durable reservation fences other devices, stores and web checkout.
        // An unresolved/expired attempt never silently unlocks another charge.
        const intent = await reserve(scope, configuration);
        assertScope(scope);
        let transaction: Transaction;
        try {
          transaction = await plugin.purchaseProduct({
            productIdentifier: current.productId,
            productType: 'subs' as PURCHASE_TYPE,
            ...(configuration.platform === 'android'
              ? { planIdentifier: current.basePlanId!, offerToken: current.offerToken }
              : {}),
            appAccountToken: configuration.appAccountToken!,
            isConsumable: false,
            autoAcknowledgePurchases: false,
          });
        } catch (error) {
          const issue = nativePurchaseError(error);
          // Only an explicit native user cancellation is safe to release. Pending,
          // unknown store errors and failed verification must retain the fence.
          if (explicitStoreCancellation(error)) {
            await releaseCancelled(scope, intent.intentId);
            throw new NativePurchaseError('cancelled');
          }
          if (issue.issue === 'pending' || issue.issue === 'account-changed') throw issue;
          throw new NativePurchaseError('verification');
        }
        return deliver(scope, configuration, plugin, transaction);
      }),
    restore: (scope: NativePurchaseScope) =>
      serial(async () => {
        const configuration = await readConfiguration(scope);
        return recover(scope, configuration, (await connect(scope, configuration)).bridge, true);
      }),
    recover: (scope: NativePurchaseScope) =>
      serial(async () => {
        const configuration = await readConfiguration(scope);
        if (!configuration.ready) return { verified: 0, pending: false, unfinished: false };
        return recover(scope, configuration, (await connect(scope, configuration)).bridge, false);
      }),
    manage: () =>
      serial(async () => {
        if (!dependencies.platform()) throw new NativePurchaseError('unavailable');
        await (await dependencies.plugin()).bridge.manageSubscriptions();
      }),
    observe: (scope: NativePurchaseScope, onRecovery: (result: NativePurchaseRecovery) => void) =>
      serial(async (): Promise<PluginListenerHandle | null> => {
        const configuration = await readConfiguration(scope);
        if (!configuration.ready || configuration.platform !== 'ios') return null;
        const { bridge: plugin } = await connect(scope, configuration);
        return plugin.addListener('transactionUpdated', (transaction) => {
          if (!scope.isCurrent() || !matching(transaction, configuration)) return;
          void serial(async () => {
            const latest = await readConfiguration(scope);
            if (!latest.ready || !matching(transaction, latest)) return;
            onRecovery(await deliver(scope, latest, plugin, transaction));
          }).catch(() => {
            if (scope.isCurrent()) onRecovery({ verified: 0, pending: false, unfinished: true });
          });
        });
      }),
  };
}

let plugin: Promise<{ bridge: NativePurchaseBridge }> | undefined;
export const nativePurchases = createNativePurchaseAdapter({
  platform: nativeStorePlatform,
  request: appFetch,
  plugin: () => {
    if (!nativeStorePlatform() || !Capacitor.isPluginAvailable('NativePurchases'))
      return Promise.reject(new NativePurchaseError('unavailable'));
    // This guarded import never instantiates the package's permissive web mock.
    plugin ??= import('@capgo/native-purchases').then((module) => ({
      bridge: module.NativePurchases,
    }));
    return plugin;
  },
});
