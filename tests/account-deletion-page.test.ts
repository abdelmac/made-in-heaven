import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ connection: vi.fn(async () => undefined) }));
import AccountDeletionPage, { generateMetadata } from '../src/app/account-deletion/page';

const publicInformation = {
  SOLACE_SELLER_NAME: 'Atelier Boréal',
  SOLACE_SELLER_ADDRESS: '42 rue des Aurores, 75000 Paris, France',
  SOLACE_SELLER_REGISTRATION: 'Registre 123456789',
  SOLACE_SUPPORT_EMAIL: 'assistance@boreal.fr',
  SOLACE_LEGAL_NOTICE_URL: 'https://boreal.fr/mentions-legales',
  SOLACE_PRIVACY_POLICY_URL: 'https://boreal.fr/confidentialite',
  SOLACE_TERMS_URL: 'https://boreal.fr/conditions',
};

beforeEach(() => {
  for (const key of Object.keys(publicInformation)) vi.stubEnv(key, '');
});
afterEach(() => vi.unstubAllEnvs());

describe('public account deletion page', () => {
  it('provides a browser deletion path without an account or launch configuration', async () => {
    const html = renderToStaticMarkup(await AccountDeletionPage());
    expect(html).toContain('<h1>Supprimer votre compte Solace</h1>');
    expect(html).toContain('href="/?account=delete"');
    expect(html).toContain('Aucune installation n’est requise');
    expect(html).toContain('<code>DELETE</code>');
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/support"');
    expect(html).toContain('durées de conservation ne sont pas');
    expect(html).not.toContain('mailto:');
    expect(html).not.toContain('<form');
    expect((await generateMetadata()).robots).toEqual({ index: false, follow: false });
  });

  it('explains billing, ownership, recent sign-in and the limits of deletion', async () => {
    const html = renderToStaticMarkup(await AccountDeletionPage());
    expect(html).toContain('transférez-en la propriété');
    expect(html).toContain('résiliés lors de la');
    expect(html).toContain('moins de dix minutes');
    expect(html).toContain('votre espace personnel');
    expect(html).toContain('événements attribués à votre compte sont retirés');
    expect(html).toContain('Les contenus d’autres membres sont conservés');
    expect(html).toContain('Stripe');
    expect(html).toContain('copies sur d’autres appareils');
    expect(html).not.toContain('anonymisées');
    expect(html).not.toContain('sous 30 jours');
  });

  it('offers support using only a valid configured public email', async () => {
    for (const [key, value] of Object.entries(publicInformation)) vi.stubEnv(key, value);
    const html = renderToStaticMarkup(await AccountDeletionPage());
    expect(html).toContain('href="mailto:assistance@boreal.fr?subject=');
    expect(html).toContain('N’envoyez');
    expect((await generateMetadata()).robots).toEqual({ index: true, follow: true });
  });

  it('does not render rejected contact values as deletion request destinations', async () => {
    vi.stubEnv('SOLACE_SUPPORT_EMAIL', 'support@example.com');
    const html = renderToStaticMarkup(await AccountDeletionPage());
    expect(html).not.toContain('mailto:');
    expect(html).not.toContain('support@example.com');
    expect(html).toContain('contact du support n’est pas encore publiée');
    expect(html).toContain('href="/?account=delete"');
  });
});
