import { NextResponse, type NextRequest } from 'next/server';
import {
  allowsNativePreflight,
  isNativeApiOrigin,
  nativeCorsHeaders,
} from '@/lib/server/mobile-api';

export function proxy(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!isNativeApiOrigin(origin)) {
    // Existing browser requests keep their same-origin cookie/CSRF policy.
    if (request.method === 'OPTIONS') return new NextResponse(null, { status: 403 });
    return NextResponse.next();
  }

  if (request.method === 'OPTIONS') {
    if (!allowsNativePreflight(request.headers)) return new NextResponse(null, { status: 403 });
    return new NextResponse(null, {
      status: 204,
      headers: nativeCorsHeaders(origin!, true),
    });
  }

  const forwarded = new Headers(request.headers);
  forwarded.delete('cookie');
  const response = NextResponse.next({ request: { headers: forwarded } });
  nativeCorsHeaders(origin!).forEach((value, name) => response.headers.set(name, value));
  return response;
}

export const config = { matcher: '/api/:path*' };
