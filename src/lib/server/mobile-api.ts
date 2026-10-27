// These are the bundled Capacitor WebView origins, not remotely hosted pages.
// Native requests authenticate with a validated access token, never browser cookies.
export const nativeApiOrigins = ['capacitor://localhost', 'https://localhost'] as const;

export function isNativeApiOrigin(origin: string | null): boolean {
  return nativeApiOrigins.some((allowed) => origin === allowed);
}

export function requestBearerToken(requestHeaders: Pick<Headers, 'get'>): string | null {
  const authorization = requestHeaders.get('authorization');
  if (!authorization || authorization.length > 16_384) return null;
  const match = /^Bearer ([A-Za-z0-9._~+/-]+=*)$/i.exec(authorization);
  return match?.[1] || null;
}

const nativeMethods = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']);
const nativeHeaders = new Set([
  'accept',
  'authorization',
  'content-type',
  'x-folia-document-version',
  'x-folia-mood-version',
]);

export function allowsNativePreflight(requestHeaders: Pick<Headers, 'get'>): boolean {
  const method = requestHeaders.get('access-control-request-method');
  if (!method || !nativeMethods.has(method)) return false;
  const requestedHeaders = requestHeaders.get('access-control-request-headers');
  return (
    !requestedHeaders ||
    requestedHeaders.split(',').every((header) => nativeHeaders.has(header.trim().toLowerCase()))
  );
}

export function nativeCorsHeaders(origin: string, preflight = false): Headers {
  const result = new Headers({
    'Access-Control-Allow-Origin': origin,
    Vary: 'Origin',
    'Cache-Control': 'no-store',
  });
  if (preflight) {
    result.set('Access-Control-Allow-Methods', [...nativeMethods].join(', '));
    result.set('Access-Control-Allow-Headers', [...nativeHeaders].join(', '));
    result.set('Access-Control-Max-Age', '600');
    result.set('Vary', 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
  }
  return result;
}
