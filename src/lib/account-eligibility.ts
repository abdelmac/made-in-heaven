/** Self-declared online eligibility, never a verified date of birth. */
export const ACCOUNT_TERMS_VERSION = '2026-10-28';
export const ACCOUNT_PRIVACY_VERSION = '2026-10-28';

export type AccountAgeGroup = 'under16' | '16-17' | '18+';
export type OnlineAccountAgeGroup = Exclude<AccountAgeGroup, 'under16'>;

export function isOnlineAccountAgeGroup(value: unknown): value is OnlineAccountAgeGroup {
  return value === '16-17' || value === '18+';
}

export function accountSignupMetadata(ageGroup: unknown, legalAccepted: boolean) {
  if (!isOnlineAccountAgeGroup(ageGroup) || !legalAccepted) return null;
  return {
    age_group: ageGroup,
    terms_version: ACCOUNT_TERMS_VERSION,
    privacy_version: ACCOUNT_PRIVACY_VERSION,
    legal_accepted: true as const,
  };
}
