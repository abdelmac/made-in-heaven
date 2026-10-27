import { NextResponse } from 'next/server';
import { handleApiError } from './http';
import { allowsNativePreflight, isNativeApiOrigin, nativeCorsHeaders } from './mobile-api';

/** Route-owned CORS works even when a hosting adapter does not execute Proxy. */
export function nativeApiOptions(request: Request): Response {
  const origin = request.headers.get('origin');
  if (!isNativeApiOrigin(origin) || !allowsNativePreflight(request.headers))
    return new NextResponse(null, { status: 403 });
  return new NextResponse(null, { status: 204, headers: nativeCorsHeaders(origin!, true) });
}

export function withNativeApiCors<Args extends unknown[]>(
  handler: (...args: Args) => Response | Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args) => {
    // Keep existing zero-argument GET calls usable in server unit tests. Next
    // supplies the actual Request at runtime regardless of the handler's arity.
    const request: unknown = args[0];
    const origin = request instanceof Request ? request.headers.get('origin') : null;
    const native = isNativeApiOrigin(origin);
    let response: Response;
    try {
      response = await handler(...args);
    } catch (error) {
      if (!native) throw error;
      response = handleApiError(error);
    }
    if (!native) return response;

    const headers = new Headers(response.headers);
    const vary = headers.get('vary');
    nativeCorsHeaders(origin!).forEach((value, name) => {
      if (name !== 'vary') headers.set(name, value);
    });
    headers.set('Vary', vary ? `${vary}, Origin` : 'Origin');
    headers.delete('Access-Control-Allow-Credentials');
    headers.delete('Set-Cookie');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}
