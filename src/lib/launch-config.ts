import 'server-only';

type LaunchEnvironment = Readonly<Record<string, string | undefined>>;

export type LaunchInformation = {
  sellerName: string | null;
  sellerAddress: string | null;
  sellerRegistration: string | null;
  supportEmail: string | null;
  legalNoticeUrl: string | null;
  privacyPolicyUrl: string | null;
  termsUrl: string | null;
  ready: boolean;
};

const placeholder =
  /(?:^|[^a-z0-9])(?:todo|tbd|placeholder|example|exemple|sample|dummy|fixture|changeme|change-me|replace-me|your-company|your-domain|votre-societe|votre-domaine|a-completer|a-renseigner|a-definir)(?:$|[^a-z0-9])/;

function isPlaceholder(value: string): boolean {
  const normalized = value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, '-');
  return (
    placeholder.test(normalized) || /^(?:n\/?a|none|null|undefined|test|xxx+|-+)$/.test(normalized)
  );
}

function publicText(value: string | undefined, maximum: number): string | null {
  const trimmed = value?.trim();
  if (
    !trimmed ||
    trimmed.length < 2 ||
    trimmed.length > maximum ||
    /[\p{Cc}\p{Cf}<>\[\]{}]/u.test(value ?? '') ||
    isPlaceholder(trimmed)
  ) {
    return null;
  }
  return trimmed;
}

function publicHostname(value: string): boolean {
  const hostname = value.toLowerCase();
  const labels = hostname.split('.');
  return (
    hostname.length <= 253 &&
    labels.length >= 2 &&
    labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) &&
    /^[a-z]{2,63}$/.test(labels.at(-1) ?? '') &&
    !/(?:^|\.)(?:localhost|local|internal|invalid|test|example)$/.test(hostname) &&
    !/(?:^|\.)example\.(?:com|net|org)$/.test(hostname) &&
    !isPlaceholder(hostname)
  );
}

function publicEmail(value: string | undefined): string | null {
  const email = publicText(value, 254);
  if (!email) return null;
  const match = /^([a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]{1,64})@([^@]+)$/.exec(email);
  if (
    !match ||
    match[1].startsWith('.') ||
    match[1].endsWith('.') ||
    match[1].includes('..') ||
    !publicHostname(match[2])
  ) {
    return null;
  }
  return `${match[1]}@${match[2].toLowerCase()}`;
}

function publicDocumentUrl(value: string | undefined): string | null {
  const candidate = publicText(value, 2048);
  if (!candidate || !/^https:\/\//i.test(candidate) || /[\s\\]/u.test(candidate)) return null;
  try {
    const url = new URL(candidate);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      candidate.includes('?') ||
      candidate.includes('#') ||
      !publicHostname(url.hostname) ||
      /[\p{Cc}\p{Cf}]/u.test(decodeURIComponent(url.pathname)) ||
      isPlaceholder(decodeURIComponent(url.pathname))
    ) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

/** Public launch information only; no credentials or provider settings are read here. */
export function getLaunchInformation(env: LaunchEnvironment = process.env): LaunchInformation {
  const information = {
    sellerName: publicText(env.SOLACE_SELLER_NAME, 200),
    sellerAddress: publicText(env.SOLACE_SELLER_ADDRESS, 500),
    sellerRegistration: publicText(env.SOLACE_SELLER_REGISTRATION, 240),
    supportEmail: publicEmail(env.SOLACE_SUPPORT_EMAIL),
    legalNoticeUrl: publicDocumentUrl(env.SOLACE_LEGAL_NOTICE_URL),
    privacyPolicyUrl: publicDocumentUrl(env.SOLACE_PRIVACY_POLICY_URL),
    termsUrl: publicDocumentUrl(env.SOLACE_TERMS_URL),
  };
  return { ...information, ready: Object.values(information).every((value) => value !== null) };
}

/** A configuration gate, not a verification of the seller or of legal compliance. */
export function launchInformationReady(env: LaunchEnvironment = process.env): boolean {
  return getLaunchInformation(env).ready;
}
