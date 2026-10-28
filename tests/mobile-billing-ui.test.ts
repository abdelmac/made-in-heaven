import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BillingTier } from '../src/lib/billing/config';

const mocks = vi.hoisted(() => ({
  mobile: true,
  store: {
    user: null as { id: string } | null,
    workspaceId: '11111111-1111-4111-8111-111111111111',
    isCloud: false,
    entitlements: null as { tier: BillingTier } | null,
    currentWorkspace: { name: 'Mon espace', kind: 'personal', role: 'owner' },
    workspaces: [],
  },
}));

vi.mock('../src/components/app-context', () => ({
  useApp: () => ({ store: mocks.store, notify: vi.fn(), navigate: vi.fn(), openAccount: vi.fn() }),
}));
vi.mock('@/lib/mobile-platform', () => ({
  isMobileBuild: () => mocks.mobile,
  isNativeApp: () => false,
  appApiOrigin: () => 'https://www.solace-pomodoro.com',
}));
vi.mock('@/lib/app-fetch', () => ({ appFetch: vi.fn() }));
vi.mock('@/lib/mobile-files', () => ({ openExternalUrl: vi.fn() }));

import { BillingPage } from '../src/components/workspaces';

afterEach(() => {
  mocks.mobile = true;
  mocks.store.user = null;
  mocks.store.isCloud = false;
  mocks.store.entitlements = null;
});

describe('mobile billing presentation without a configured native store', () => {
  it('provides a useful local account screen without advertising web checkout or pricing', () => {
    const html = renderToStaticMarkup(createElement(BillingPage));
    expect(html).toContain('Espace local');
    expect(html).toContain('Votre espace local reste disponible sans abonnement');
    expect(html).toContain('Se connecter');
    expect(html).toContain('Personnaliser mon espace');
    expect(html).not.toContain('pricing-card');
    expect(html).not.toContain('Gérer l’abonnement');
    expect(html).not.toContain('Choisir Pro');
    expect(html).not.toContain('stripe.com');
    expect(html).not.toContain('href=');
  });

  it('shows the account entitlement without creating mobile purchase or portal actions', () => {
    mocks.store.user = { id: 'account-id' };
    mocks.store.isCloud = true;
    mocks.store.entitlements = { tier: 'pro' };
    const html = renderToStaticMarkup(createElement(BillingPage));
    expect(html).toContain('>Pro<');
    expect(html).toContain('Actualiser mon accès');
    expect(html).not.toContain('Gérer l’abonnement');
    expect(html).not.toContain('pricing-card');
    expect(html).not.toContain('stripe.com');
  });

  it('does not claim a free plan while connected entitlement verification is pending', () => {
    mocks.store.user = { id: 'account-id' };
    mocks.store.isCloud = true;
    const html = renderToStaticMarkup(createElement(BillingPage));
    expect(html).toContain('Vérification de votre accès');
    expect(html).not.toContain('>Free<');
    expect(html).not.toContain('>Gratuit<');
  });

  it('preserves the existing web pricing presentation', () => {
    mocks.mobile = false;
    const html = renderToStaticMarkup(createElement(BillingPage));
    expect(html.match(/class="pricing-card/g)).toHaveLength(3);
    expect(html).not.toContain('cette version mobile');
  });
});
