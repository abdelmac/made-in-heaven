import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_PRIVACY_VERSION,
  ACCOUNT_TERMS_VERSION,
  accountSignupMetadata,
  isOnlineAccountAgeGroup,
} from '../src/lib/account-eligibility';

describe('online account eligibility', () => {
  it.each([undefined, null, '', 'under16', 'adult', '16', 16, true])(
    'does not permit unknown or under-16 declarations (%j)',
    (ageGroup) => {
      expect(isOnlineAccountAgeGroup(ageGroup)).toBe(false);
      expect(accountSignupMetadata(ageGroup, true)).toBeNull();
    },
  );

  it.each(['16-17', '18+'])('requires explicit legal acceptance for %s', (ageGroup) => {
    expect(accountSignupMetadata(ageGroup, false)).toBeNull();
    expect(accountSignupMetadata(ageGroup, true)).toEqual({
      age_group: ageGroup,
      terms_version: ACCOUNT_TERMS_VERSION,
      privacy_version: ACCOUNT_PRIVACY_VERSION,
      legal_accepted: true,
    });
  });

  it('shares the exact legal-version contract without collecting birth dates or client timestamps', () => {
    expect(ACCOUNT_TERMS_VERSION).toBe('2026-10-28');
    expect(ACCOUNT_PRIVACY_VERSION).toBe('2026-10-28');
    expect(Object.keys(accountSignupMetadata('18+', true)!)).toEqual([
      'age_group',
      'terms_version',
      'privacy_version',
      'legal_accepted',
    ]);
  });
});
