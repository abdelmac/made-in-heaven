import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
import { getLaunchInformation, launchInformationReady } from '../src/lib/launch-config';

// Synthetic data for format validation only; never used as public application defaults.
const configured = () => ({
  SOLACE_SELLER_NAME: 'Atelier Boréal',
  SOLACE_SELLER_ADDRESS: '42 rue des Aurores, 75000 Paris, France',
  SOLACE_SELLER_REGISTRATION: 'Registre 123456789',
  SOLACE_SUPPORT_EMAIL: 'assistance@boreal.fr',
  SOLACE_LEGAL_NOTICE_URL: 'https://boreal.fr/mentions-legales',
  SOLACE_PRIVACY_POLICY_URL: 'https://boreal.fr/confidentialite',
  SOLACE_TERMS_URL: 'https://boreal.fr/conditions',
});

afterEach(() => vi.unstubAllEnvs());

describe('public launch information', () => {
  it('requires every public field before marking the information ready', () => {
    expect(launchInformationReady({})).toBe(false);
    expect(launchInformationReady(configured())).toBe(true);
    for (const key of Object.keys(configured())) {
      expect(launchInformationReady({ ...configured(), [key]: '' })).toBe(false);
      expect(launchInformationReady({ ...configured(), [key]: '   ' })).toBe(false);
    }
  });

  it('reads environment values on each invocation and only returns public fields', () => {
    for (const [key, value] of Object.entries(configured())) vi.stubEnv(key, value);
    expect(launchInformationReady()).toBe(true);
    vi.stubEnv('SOLACE_SUPPORT_EMAIL', '');
    expect(launchInformationReady()).toBe(false);
    expect(getLaunchInformation({ ...configured(), STRIPE_SECRET_KEY: 'do-not-expose' })).toEqual({
      sellerName: 'Atelier Boréal',
      sellerAddress: '42 rue des Aurores, 75000 Paris, France',
      sellerRegistration: 'Registre 123456789',
      supportEmail: 'assistance@boreal.fr',
      legalNoticeUrl: 'https://boreal.fr/mentions-legales',
      privacyPolicyUrl: 'https://boreal.fr/confidentialite',
      termsUrl: 'https://boreal.fr/conditions',
      ready: true,
    });
  });

  it.each([
    'À compléter',
    'TODO',
    '[raison sociale]',
    'Votre société',
    'Example LLC',
    'n/a',
    '<name>',
    'Nom\u202E',
  ])('rejects placeholder or unsafe seller values: %s', (value) => {
    const result = getLaunchInformation({ ...configured(), SOLACE_SELLER_NAME: value });
    expect(result.sellerName).toBeNull();
    expect(result.ready).toBe(false);
  });

  it.each([
    'javascript:alert(1)',
    'http://boreal.fr/conditions',
    '//boreal.fr/conditions',
    'https://user:password@boreal.fr/conditions',
    'https://boreal.fr/conditions?token=secret',
    'https://boreal.fr/conditions?',
    'https://boreal.fr/conditions#secret',
    'https://boreal.fr:8443/conditions',
    'https://example.com/conditions',
    'https://docs.example.org/conditions',
    'https://boreal.invalid/conditions',
    'https://boreal.test/conditions',
    'https://localhost/conditions',
    'https://localhost.local/conditions',
    'https://127.0.0.1/conditions',
    'https://2130706433/conditions',
    'https://[::1]/conditions',
    'https://boreal.fr\\@untrusted.fr/conditions',
    'https://boreal.fr/terms\n',
    'https://boreal.fr/conditions%0a',
    'https://boreal.fr/%54%4f%44%4f',
    'https://boreal.fr/%broken',
  ])('does not publish an unsafe or placeholder document URL: %s', (value) => {
    const result = getLaunchInformation({ ...configured(), SOLACE_TERMS_URL: value });
    expect(result.termsUrl).toBeNull();
    expect(result.ready).toBe(false);
  });

  it.each([
    'assistance@example.com',
    'assistance@boreal.invalid',
    'assistance@localhost',
    'assistance@127.0.0.1',
    'mailto:assistance@boreal.fr',
    'assistance@boreal.fr?subject=hello',
    'assistance@boreal.fr\r\nBcc:other@boreal.fr',
    '.assistance@boreal.fr',
    'assistance..client@boreal.fr',
  ])('does not publish malformed or placeholder contact values: %s', (value) => {
    const result = getLaunchInformation({ ...configured(), SOLACE_SUPPORT_EMAIL: value });
    expect(result.supportEmail).toBeNull();
    expect(result.ready).toBe(false);
  });

  it('normalizes surrounding whitespace and public URL and email hostnames', () => {
    const result = getLaunchInformation({
      ...configured(),
      SOLACE_SELLER_NAME: '  Atelier Boréal  ',
      SOLACE_SUPPORT_EMAIL: ' Assistance@BOREAL.FR ',
      SOLACE_LEGAL_NOTICE_URL: ' HTTPS://BOREAL.FR/mentions-legales ',
    });
    expect(result.sellerName).toBe('Atelier Boréal');
    expect(result.supportEmail).toBe('Assistance@boreal.fr');
    expect(result.legalNoticeUrl).toBe('https://boreal.fr/mentions-legales');
    expect(result.ready).toBe(true);
  });

  it('keeps valid fields available when another field is absent', () => {
    const result = getLaunchInformation({ ...configured(), SOLACE_PRIVACY_POLICY_URL: undefined });
    expect(result.ready).toBe(false);
    expect(result.privacyPolicyUrl).toBeNull();
    expect(result.sellerName).toBe('Atelier Boréal');
    expect(result.supportEmail).toBe('assistance@boreal.fr');
  });
});
