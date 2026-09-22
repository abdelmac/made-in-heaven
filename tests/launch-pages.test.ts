import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ connection: vi.fn(async () => undefined) }));
import { LaunchInformationPage, launchPageMetadata } from '../src/components/launch-information';

const information = {
  SOLACE_SELLER_NAME: 'Atelier Boréal',
  SOLACE_SELLER_ADDRESS: '42 rue des Aurores, 75000 Paris, France',
  SOLACE_SELLER_REGISTRATION: 'Registre 123456789',
  SOLACE_SUPPORT_EMAIL: 'assistance@boreal.fr',
  SOLACE_LEGAL_NOTICE_URL: 'https://boreal.fr/mentions-legales',
  SOLACE_PRIVACY_POLICY_URL: 'https://boreal.fr/confidentialite',
  SOLACE_TERMS_URL: 'https://boreal.fr/conditions',
};

beforeEach(() => {
  for (const key of Object.keys(information)) vi.stubEnv(key, '');
});
afterEach(() => vi.unstubAllEnvs());

describe('launch information pages', () => {
  it.each(['legal', 'privacy', 'terms', 'support'] as const)(
    'keeps the incomplete %s page honest, unindexed and connected to the app',
    async (page) => {
      expect((await launchPageMetadata(page)).robots).toEqual({ index: false, follow: false });
      const html = renderToStaticMarkup(await LaunchInformationPage({ page }));
      expect(html).toContain('Informations en préparation');
      expect(html).toContain('Cette page est provisoire');
      expect(html).toContain('href="/"');
      expect(html).toContain('Retour à l’application');
      for (const route of ['legal', 'privacy', 'terms', 'support']) {
        expect(html).toContain(`href="/${route}"`);
      }
      expect(html).not.toContain('href="https://');
    },
  );

  it('publishes supplied details and document links when the information is complete', async () => {
    for (const [key, value] of Object.entries(information)) vi.stubEnv(key, value);
    expect((await launchPageMetadata('legal')).robots).toEqual({ index: true, follow: true });
    const html = renderToStaticMarkup(await LaunchInformationPage({ page: 'legal' }));
    expect(html).toContain(information.SOLACE_SELLER_NAME);
    expect(html).toContain(information.SOLACE_SELLER_REGISTRATION);
    expect(html).toContain(information.SOLACE_SUPPORT_EMAIL);
    expect(html).toContain(`href="${information.SOLACE_LEGAL_NOTICE_URL}"`);
    expect(html).not.toContain('Informations en préparation');
  });

  it('does not leak rejected links or contact strings into the rendered page', async () => {
    for (const [key, value] of Object.entries(information)) vi.stubEnv(key, value);
    vi.stubEnv(
      'SOLACE_TERMS_URL',
      'https://user:private-password@boreal.fr/conditions?token=private-token',
    );
    vi.stubEnv('SOLACE_SUPPORT_EMAIL', '<script>bad-contact</script>');
    const html = renderToStaticMarkup(await LaunchInformationPage({ page: 'terms' }));
    expect(html).toContain('Informations en préparation');
    expect(html).toContain('ne sont pas encore publiées');
    expect(html).not.toContain('private-password');
    expect(html).not.toContain('private-token');
    expect(html).not.toContain('bad-contact');
    expect((await launchPageMetadata('terms')).robots).toEqual({ index: false, follow: false });
  });
});
