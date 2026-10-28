import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
import { LegalDetails } from '../src/components/legal-details';
import { TermsDetails } from '../src/components/terms-details';
import { getLaunchInformation, getPublisherInformation } from '../src/lib/launch-config';

const environment = {
  SOLACE_SELLER_NAME: 'Atelier Boréal',
  SOLACE_SUPPORT_EMAIL: 'assistance@boreal.fr',
  SOLACE_PUBLISHER_NAME: 'Boréal',
  SOLACE_PUBLISHER_COUNTRY: 'France',
};

function props(env: Record<string, string> = environment) {
  return {
    information: getLaunchInformation(env),
    publisher: getPublisherInformation(env),
  };
}

describe('first-party terms and legal information', () => {
  it('uses the configured operator and contact while keeping applicable missing details visible', () => {
    for (const component of [LegalDetails, TermsDetails]) {
      const html = renderToStaticMarkup(createElement(component, props()));
      expect(html).toContain('Atelier Boréal');
      expect(html).toContain('Boréal');
      expect(html).toContain('href="mailto:assistance@boreal.fr"');
    }
    const legal = renderToStaticMarkup(createElement(LegalDetails, props()));
    expect(legal).toContain('Adresse de l’éditeur');
    expect(legal).toContain('Non renseignée');
    expect(legal).toContain('si le statut ou l’activité y est assujetti');
    expect(legal).toContain('n’est pas présumé ici');
  });

  it('does not invent an operator or support destination when configuration is absent or rejected', () => {
    for (const component of [LegalDetails, TermsDetails]) {
      const html = renderToStaticMarkup(
        createElement(component, props({ SOLACE_SUPPORT_EMAIL: 'contact@example.com' })),
      );
      expect(html).not.toContain('mailto:');
      expect(html).not.toContain('contact@example.com');
      expect(html).not.toContain('Atelier Boréal');
      expect(html).toContain('href="/support"');
    }
  });

  it('preserves consumer rights and explains store subscriptions without inventing a price', () => {
    const html = renderToStaticMarkup(createElement(TermsDetails, props()));
    expect(html).toContain('l’achat utilise la boutique');
    expect(html).toContain('ne résilie pas automatiquement');
    expect(html).toContain('suppression immédiate');
    expect(html).toContain('Aucune renonciation générale au droit de rétractation');
    expect(html).toContain('remboursement auquel la loi');
    expect(html).toContain('ni arbitrage obligatoire ni tribunal exclusif');
    expect(html).toContain('href="/account-deletion"');
    expect(html).toContain('href="/privacy"');
    expect(html).not.toContain('€');
    expect(html).not.toContain('3,99');
    expect(html).not.toContain('renoncez à tout');
  });

  it('attributes verified host details without passing a specialized DMCA number as general support', () => {
    const html = renderToStaticMarkup(createElement(LegalDetails, props()));
    expect(html).toContain('Vercel Inc.');
    expect(html).toContain('440 N Barranca Avenue #4133');
    expect(html).toContain('href="https://vercel.com/legal/privacy-notice"');
    expect(html).toContain('téléphone général de l’hébergeur reste à confirmer');
    expect(html).not.toContain('5592887060');
    expect(html).not.toContain('données restent en France');
  });
});
