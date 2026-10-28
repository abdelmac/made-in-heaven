import type { Product, Transaction } from '@capgo/native-purchases';
import { describe, expect, it, vi } from 'vitest';
import {
  createNativePurchaseAdapter,
  nativePurchaseError,
  selectNativeMonthlyOffer,
  type NativePurchaseBridge,
  type NativeStoreConfiguration,
  type NativeStorePlatform,
} from '../src/lib/native-purchases';

const workspaceId = '22222222-2222-4222-8222-222222222222';
const accountToken = '33333333-3333-4333-8333-333333333333';
const foreignToken = '44444444-4444-4444-8444-444444444444';
const productId = 'solace.pro.monthly';
const intentId = '55555555-5555-4555-8555-555555555555';

function configuration(platform: NativeStorePlatform = 'ios'): NativeStoreConfiguration {
  return {
    ready: true,
    purchaseAllowed: true,
    platform,
    productId,
    basePlanId: platform === 'android' ? 'monthly' : null,
    billingPeriod: platform === 'android' ? 'P1M' : null,
    appAccountToken: accountToken,
    refreshPending: false,
    pendingPurchaseIntent: null,
    environment: 'sandbox',
    entitlements: { tier: 'free' },
  };
}
function product(platform: NativeStorePlatform = 'ios', overrides: Partial<Product> = {}): Product {
  return {
    identifier: platform === 'ios' ? productId : 'monthly',
    ...(platform === 'android'
      ? { planIdentifier: productId, offerToken: 'fixture-base-offer' }
      : {}),
    title: 'Solace Pro',
    description: 'Les outils Pro dans votre espace personnel.',
    price: 7.28,
    priceString: '$7.28',
    currencyCode: 'USD',
    currencySymbol: '$',
    isFamilyShareable: false,
    subscriptionGroupIdentifier: 'solace-pro',
    subscriptionPeriod: { numberOfUnits: 1, unit: 2, unitString: 'month' },
    introductoryPrice: null,
    discounts: [],
    ...overrides,
  };
}
function transaction(
  platform: NativeStorePlatform = 'ios',
  overrides: Partial<Transaction> = {},
): Transaction {
  return {
    transactionId: '200000012345',
    productIdentifier: productId,
    appAccountToken: accountToken,
    purchaseDate: '2026-10-28T12:00:00Z',
    willCancel: null,
    ...(platform === 'ios'
      ? { jwsRepresentation: 'fixture.signed.transaction', needsFinish: true }
      : {
          purchaseToken: 'fixture-private-purchase-token',
          purchaseState: '1',
          isAcknowledged: false,
        }),
    ...overrides,
  };
}
function fixture(platform: NativeStorePlatform = 'ios') {
  const events: string[] = [];
  const config = configuration(platform);
  let current = true;
  const plugin = {
    configure: vi.fn(async () => {
      events.push('configure');
    }),
    isBillingSupported: vi.fn(async () => ({ isBillingSupported: true })),
    getProducts: vi.fn(async () => ({ products: [product(platform)] })),
    getPurchases: vi.fn(async () => ({ purchases: [] as Transaction[] })),
    getUnfinishedTransactions: vi.fn(async () => ({ transactions: [] as Transaction[] })),
    purchaseProduct: vi.fn(async () => {
      events.push('purchase');
      return transaction(platform);
    }),
    restorePurchases: vi.fn(async () => {
      events.push('restore');
    }),
    finishTransaction: vi.fn(async () => {
      events.push('finish');
    }),
    manageSubscriptions: vi.fn(async () => undefined),
    addListener: vi.fn(async () => ({ remove: vi.fn(async () => undefined) })),
  };
  const respond = async (path: RequestInfo | URL) => {
    if (String(path).endsWith('/intent/release')) {
      events.push('released');
      return Response.json({ released: true });
    }
    if (String(path).endsWith('/intent')) {
      events.push('reserved');
      return Response.json({
        intentId,
        expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      });
    }
    if (String(path).includes('/verify')) {
      events.push('server-verified');
      return Response.json({ verified: true, acknowledged: platform === 'android' });
    }
    return Response.json(config);
  };
  const request = vi.fn(respond);
  const loadPlugin = vi.fn(async () => ({ bridge: plugin as unknown as NativePurchaseBridge }));
  const adapter = createNativePurchaseAdapter({
    platform: () => platform,
    plugin: loadPlugin,
    request,
  });
  const scope = { workspaceId, isCurrent: () => current };
  const offer = selectNativeMonthlyOffer(config, [product(platform)])!;
  return {
    adapter,
    plugin,
    request,
    respond,
    config,
    scope,
    offer,
    events,
    loadPlugin,
    changeAccount: () => {
      current = false;
    },
  };
}

describe('native purchase safety gates', () => {
  it('boxes Capacitor proxies instead of assimilating their synthesized then property', async () => {
    const f = fixture();
    const proxy = new Proxy(f.plugin, {
      get(target, property, receiver) {
        if (property === 'then') throw new Error('Native proxy must never be awaited directly');
        return Reflect.get(target, property, receiver);
      },
    });
    const adapter = createNativePurchaseAdapter({
      platform: () => 'ios',
      request: f.request,
      plugin: async () => ({ bridge: proxy as unknown as NativePurchaseBridge }),
    });
    expect((await adapter.prepare(f.scope)).offer?.priceString).toBe('$7.28');
  });

  it('does not load the SDK web mock or contact billing when no native platform exists', async () => {
    const plugin = vi.fn();
    const request = vi.fn();
    const adapter = createNativePurchaseAdapter({ platform: () => null, plugin, request });
    await expect(adapter.prepare({ workspaceId, isCurrent: () => true })).rejects.toMatchObject({
      issue: 'unavailable',
    });
    await expect(adapter.manage()).rejects.toMatchObject({ issue: 'unavailable' });
    expect(plugin).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it('keeps the paywall unavailable without server readiness or account binding', async () => {
    const f = fixture();
    f.config.ready = false;
    expect((await f.adapter.prepare(f.scope)).offer).toBeNull();
    expect(f.loadPlugin).not.toHaveBeenCalled();
    f.config.ready = true;
    f.config.appAccountToken = null;
    await expect(f.adapter.prepare(f.scope)).rejects.toMatchObject({ issue: 'unavailable' });
    expect(f.loadPlugin).not.toHaveBeenCalled();
  });

  it('fails closed on mismatched platform configuration and malformed responses', async () => {
    const f = fixture('android');
    f.config.platform = 'ios';
    await expect(f.adapter.prepare(f.scope)).rejects.toMatchObject({ issue: 'unavailable' });
    f.request.mockResolvedValueOnce(Response.json({ ready: true }));
    await expect(f.adapter.prepare(f.scope)).rejects.toMatchObject({ issue: 'unavailable' });
    expect(f.plugin.purchaseProduct).not.toHaveBeenCalled();
  });

  it('does not purchase when server entitlements already grant a paid tier', async () => {
    const f = fixture();
    f.config.entitlements.tier = 'pro';
    await expect(f.adapter.purchase(f.scope, f.offer)).rejects.toMatchObject({
      issue: 'verification',
    });
    expect(f.plugin.purchaseProduct).not.toHaveBeenCalled();
  });

  it('blocks new purchases by default when the server has not explicitly allowed them', async () => {
    const f = fixture();
    Reflect.deleteProperty(f.config, 'purchaseAllowed');
    await expect(f.adapter.purchase(f.scope, f.offer)).rejects.toMatchObject({
      issue: 'purchase-blocked',
    });
    expect(f.loadPlugin).not.toHaveBeenCalled();
  });

  it('allows receipt restoration while a pending purchase blocks a new payment sheet', async () => {
    const f = fixture();
    f.config.purchaseAllowed = false;
    await expect(f.adapter.purchase(f.scope, f.offer)).rejects.toMatchObject({
      issue: 'purchase-blocked',
    });
    f.plugin.getPurchases.mockResolvedValueOnce({ purchases: [transaction()] });
    expect(await f.adapter.restore(f.scope)).toMatchObject({ verified: 1 });
    expect(f.plugin.purchaseProduct).not.toHaveBeenCalled();
  });
});

describe('store pricing and plan selection', () => {
  it('keeps the exact localized store price and understands Android base-plan field mapping', () => {
    const offer = selectNativeMonthlyOffer(configuration('android'), [product('android')]);
    expect(offer).toMatchObject({
      productId,
      basePlanId: 'monthly',
      priceString: '$7.28',
      offerToken: 'fixture-base-offer',
    });
    expect(
      selectNativeMonthlyOffer(configuration('android'), [
        product('android', { identifier: productId, planIdentifier: 'monthly' }),
      ]),
    ).toBeNull();
  });

  it.each([
    { subscriptionPeriod: { numberOfUnits: 1, unit: 3, unitString: 'year' as const } },
    { subscriptionPeriod: { numberOfUnits: 3, unit: 2, unitString: 'month' as const } },
    { priceString: '' },
    { price: 0 },
    { introductoryPrice: { priceString: '$0' } as Product['introductoryPrice'] },
  ])('rejects an undisclosed or incompatible catalog offer %j', (overrides) => {
    expect(selectNativeMonthlyOffer(configuration(), [product('ios', overrides)])).toBeNull();
  });

  it('does not substitute a promotional Android offer for the configured monthly base plan', () => {
    expect(
      selectNativeMonthlyOffer(configuration('android'), [
        product('android', { offerId: 'trial' }),
      ]),
    ).toBeNull();
    expect(
      selectNativeMonthlyOffer(configuration('android'), [
        product('android', { identifier: 'yearly' }),
      ]),
    ).toBeNull();
  });

  it('requires the server-verified monthly period when Android omits its catalog period', () => {
    const android = { ...product('android'), subscriptionPeriod: undefined } as unknown as Product;
    expect(selectNativeMonthlyOffer(configuration('android'), [android])?.priceString).toBe(
      '$7.28',
    );
    const config = configuration('android');
    config.billingPeriod = null;
    expect(selectNativeMonthlyOffer(config, [android])).toBeNull();
  });

  it('does not open a payment sheet while existing subscription revalidation is pending', async () => {
    const f = fixture('android');
    f.config.refreshPending = true;
    await expect(f.adapter.purchase(f.scope, f.offer)).rejects.toMatchObject({
      issue: 'verification',
    });
    expect(f.plugin.purchaseProduct).not.toHaveBeenCalled();
  });

  it('requires a fresh catalog match before opening the payment sheet', async () => {
    const f = fixture();
    f.plugin.getProducts.mockResolvedValueOnce({
      products: [product('ios', { price: 9, priceString: '$9' })],
    });
    await expect(f.adapter.purchase(f.scope, f.offer)).rejects.toMatchObject({
      issue: 'offer-changed',
    });
    expect(f.plugin.purchaseProduct).not.toHaveBeenCalled();
  });
});

describe('verified purchase delivery', () => {
  it('obtains an authenticated durable reservation before invoking the native payment sheet', async () => {
    const f = fixture('android');
    await f.adapter.purchase(f.scope, f.offer);
    const calls = f.request.mock.calls as unknown as [string, RequestInit][];
    expect(JSON.parse(String(calls.find(([path]) => path.endsWith('/intent'))![1].body))).toEqual({
      workspaceId,
      platform: 'android',
      productId,
    });
    expect(f.events.indexOf('reserved')).toBeLessThan(f.events.indexOf('purchase'));
  });

  it('does not open the store if a concurrent purchase has already reserved the workspace', async () => {
    const f = fixture();
    f.request.mockImplementation(async (path) =>
      String(path).endsWith('/intent')
        ? Response.json({ error: 'Another purchase is pending' }, { status: 409 })
        : f.respond(path),
    );
    await expect(f.adapter.purchase(f.scope, f.offer)).rejects.toMatchObject({
      issue: 'purchase-blocked',
    });
    expect(f.plugin.purchaseProduct).not.toHaveBeenCalled();
  });

  it('retains an expired reservation without charging again or automatically releasing it', async () => {
    const f = fixture();
    f.request.mockImplementation(async (path) =>
      String(path).endsWith('/intent')
        ? Response.json({ intentId, expiresAt: new Date(Date.now() - 1000).toISOString() })
        : f.respond(path),
    );
    await expect(f.adapter.purchase(f.scope, f.offer)).rejects.toMatchObject({
      issue: 'intent-expired',
    });
    expect(f.plugin.purchaseProduct).not.toHaveBeenCalled();
    expect(f.events).not.toContain('released');
  });

  it('releases only an explicit store cancellation using the exact server reservation', async () => {
    const f = fixture('android');
    f.plugin.purchaseProduct.mockRejectedValueOnce({
      code: 'USER_CANCELED',
      message: 'Purchase is not purchased',
    });
    await expect(f.adapter.purchase(f.scope, f.offer)).rejects.toMatchObject({
      issue: 'cancelled',
    });
    const calls = f.request.mock.calls as unknown as [string, RequestInit][];
    expect(
      JSON.parse(String(calls.find(([path]) => path.endsWith('/intent/release'))![1].body)),
    ).toEqual({ workspaceId, intentId });
    expect(f.events).not.toContain('server-verified');
  });

  it.each([
    'Transaction pending',
    'Network unavailable',
    'A network callback was cancelled; purchase state unknown',
  ])('retains the reservation for an unresolved store result: %s', async (message) => {
    const f = fixture();
    f.plugin.purchaseProduct.mockRejectedValueOnce(new Error(message));
    await expect(f.adapter.purchase(f.scope, f.offer)).rejects.toMatchObject({
      issue: message === 'Transaction pending' ? 'pending' : 'verification',
    });
    expect(f.events).not.toContain('released');
    expect(f.events).not.toContain('server-verified');
  });

  it('does not report a reservation released when cancellation cleanup failed', async () => {
    const f = fixture();
    f.plugin.purchaseProduct.mockRejectedValueOnce(new Error('User cancelled'));
    f.request.mockImplementation(async (path) =>
      String(path).endsWith('/intent/release')
        ? Response.json({ error: 'Retry support' }, { status: 503 })
        : f.respond(path),
    );
    await expect(f.adapter.purchase(f.scope, f.offer)).rejects.toMatchObject({
      issue: 'purchase-blocked',
    });
  });

  it('finishes iOS only after the server confirms persistence, and sends only signed evidence', async () => {
    const f = fixture();
    expect(await f.adapter.purchase(f.scope, f.offer)).toEqual({
      verified: 1,
      pending: false,
      unfinished: false,
    });
    expect(f.plugin.purchaseProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        productIdentifier: productId,
        productType: 'subs',
        appAccountToken: accountToken,
        autoAcknowledgePurchases: false,
        isConsumable: false,
      }),
    );
    expect(f.plugin.purchaseProduct).not.toHaveBeenCalledWith(
      expect.objectContaining({ billingPlanType: expect.anything() }),
    );
    expect(f.events).toEqual(['configure', 'reserved', 'purchase', 'server-verified', 'finish']);
    const post = f.request.mock.calls.find(([path]) => String(path).endsWith('/verify'));
    expect(post).toBeDefined();
    const init = (f.request.mock.calls as unknown as [string, RequestInit][]).find(([path]) =>
      path.endsWith('/verify'),
    )![1];
    expect(JSON.parse(String(init.body))).toEqual({
      workspaceId,
      platform: 'ios',
      productId,
      jwsRepresentation: 'fixture.signed.transaction',
    });
  });

  it('leaves Android acknowledgement entirely on the server after verification', async () => {
    const f = fixture('android');
    expect(await f.adapter.purchase(f.scope, f.offer)).toMatchObject({ verified: 1 });
    expect(f.plugin.purchaseProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        planIdentifier: 'monthly',
        offerToken: 'fixture-base-offer',
        autoAcknowledgePurchases: false,
      }),
    );
    expect(f.plugin.finishTransaction).not.toHaveBeenCalled();
    const init = (f.request.mock.calls as unknown as [string, RequestInit][]).find(([path]) =>
      path.endsWith('/verify'),
    )![1];
    expect(JSON.parse(String(init.body))).toEqual({
      workspaceId,
      platform: 'android',
      productId,
      purchaseToken: 'fixture-private-purchase-token',
    });
  });

  it.each(['ios', 'android'] as const)(
    'does not finish or claim delivery after %s verification fails',
    async (platform) => {
      const f = fixture(platform);
      f.request.mockImplementation(async (path) =>
        String(path).endsWith('/verify')
          ? Response.json({ error: 'fixture-private-purchase-token' }, { status: 503 })
          : f.respond(path),
      );
      await expect(f.adapter.purchase(f.scope, f.offer)).rejects.toMatchObject({
        issue: 'verification',
      });
      expect(f.plugin.finishTransaction).not.toHaveBeenCalled();
    },
  );

  it('does not treat an Android response without confirmed acknowledgement as completed delivery', async () => {
    const f = fixture('android');
    f.request.mockImplementation(async (path) =>
      String(path).endsWith('/verify')
        ? Response.json({ verified: true, acknowledged: false })
        : f.respond(path),
    );
    await expect(f.adapter.purchase(f.scope, f.offer)).rejects.toMatchObject({
      issue: 'verification',
    });
  });

  it('distinguishes a verified purchase needing StoreKit finishing from a failed payment', async () => {
    const f = fixture();
    f.plugin.finishTransaction.mockRejectedValueOnce(new Error('fixture native error'));
    expect(await f.adapter.purchase(f.scope, f.offer)).toEqual({
      verified: 1,
      pending: false,
      unfinished: true,
    });
  });

  it.each([
    ['User cancelled', 'cancelled'],
    ['USER_CANCELED', 'cancelled'],
    ['Transaction pending', 'pending'],
    ['Purchase is pending', 'pending'],
  ])(
    'handles %s without server verification or exposing native messages',
    async (message, issue) => {
      const f = fixture();
      f.plugin.purchaseProduct.mockRejectedValueOnce(new Error(message));
      await expect(f.adapter.purchase(f.scope, f.offer)).rejects.toMatchObject({ issue });
      expect(
        f.request.mock.calls.filter(([path]) => String(path).endsWith('/verify')),
      ).toHaveLength(0);
      expect(f.plugin.finishTransaction).not.toHaveBeenCalled();
      expect(nativePurchaseError(new Error(`${message} fixture-secret`)).message).not.toContain(
        'fixture-secret',
      );
    },
  );

  it('never verifies a pending Android purchase or finishes it locally', async () => {
    const f = fixture('android');
    f.plugin.purchaseProduct.mockResolvedValueOnce(transaction('android', { purchaseState: '2' }));
    expect(await f.adapter.purchase(f.scope, f.offer)).toMatchObject({
      verified: 0,
      pending: true,
    });
    expect(f.events).not.toContain('server-verified');
  });

  it('stops proof submission when the account changes while a store sheet is open', async () => {
    const f = fixture();
    f.plugin.purchaseProduct.mockImplementationOnce(async () => {
      f.changeAccount();
      return transaction();
    });
    await expect(f.adapter.purchase(f.scope, f.offer)).rejects.toMatchObject({
      issue: 'account-changed',
    });
    expect(f.events).not.toContain('server-verified');
    expect(f.plugin.finishTransaction).not.toHaveBeenCalled();
  });
});

describe('restoration and interrupted purchase recovery', () => {
  it('deduplicates unfinished deliveries and ignores purchases belonging to another app account', async () => {
    const f = fixture();
    f.plugin.getPurchases.mockResolvedValueOnce({
      purchases: [
        transaction(),
        transaction('ios', { transactionId: '2000009999', appAccountToken: foreignToken }),
      ],
    });
    f.plugin.getUnfinishedTransactions.mockResolvedValueOnce({ transactions: [transaction()] });
    expect(await f.adapter.restore(f.scope)).toEqual({
      verified: 1,
      pending: false,
      unfinished: false,
    });
    expect(f.events[1]).toBe('restore');
    expect(f.plugin.getPurchases).toHaveBeenCalledWith({
      productType: 'subs',
      appAccountToken: accountToken,
      onlyCurrentEntitlements: true,
    });
    expect(f.plugin.finishTransaction).toHaveBeenCalledTimes(1);
  });

  it('recovers on startup without invoking an interactive store restore or another purchase', async () => {
    const f = fixture();
    f.plugin.getUnfinishedTransactions.mockResolvedValueOnce({ transactions: [transaction()] });
    expect(await f.adapter.recover(f.scope)).toMatchObject({ verified: 1 });
    expect(f.plugin.restorePurchases).not.toHaveBeenCalled();
    expect(f.plugin.purchaseProduct).not.toHaveBeenCalled();
  });

  it('keeps failed recovery retryable without finishing or buying a replacement', async () => {
    const f = fixture();
    f.plugin.getUnfinishedTransactions.mockResolvedValueOnce({ transactions: [transaction()] });
    f.request.mockImplementation(async (path) =>
      String(path).endsWith('/verify') ? Response.json({ verified: false }) : f.respond(path),
    );
    expect(await f.adapter.recover(f.scope)).toEqual({
      verified: 0,
      pending: false,
      unfinished: true,
    });
    expect(f.plugin.finishTransaction).not.toHaveBeenCalled();
    expect(f.plugin.purchaseProduct).not.toHaveBeenCalled();
  });

  it('serializes native operations so a restore cannot race an in-flight purchase', async () => {
    const f = fixture();
    let release: ((value: Transaction) => void) | undefined;
    f.plugin.purchaseProduct.mockImplementationOnce(
      () =>
        new Promise<Transaction>((resolve) => {
          release = resolve;
        }),
    );
    const purchase = f.adapter.purchase(f.scope, f.offer);
    await vi.waitFor(() => expect(release).toBeDefined());
    const restore = f.adapter.restore(f.scope);
    expect(f.plugin.restorePurchases).not.toHaveBeenCalled();
    release!(transaction());
    await purchase;
    await restore;
    expect(f.plugin.restorePurchases).toHaveBeenCalledTimes(1);
  });
});
