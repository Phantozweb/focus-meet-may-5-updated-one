import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// COOP/COEP headers for SharedArrayBuffer support
// These headers enable cross-origin isolation which is required for:
// - SharedArrayBuffer (multi-threading with Web Workers)
// - Higher-resolution timers (performance.now() with microsecond precision)
// - Advanced WebAssembly features (SharedArrayBuffer-backed memory)
//
// Cross-Origin-Opener-Policy: same-origin
//   Ensures the browsing context is only shared with same-origin documents
//
// Cross-Origin-Embedder-Policy: require-corp
//   Requires all subresources to opt-in to being embedded
//
// Cross-Origin-Resource-Policy: cross-origin
//   Allows cross-origin access to resources (needed for CDN assets, APIs, etc.)

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  response.headers.set('Cross-Origin-Resource-Policy', 'cross-origin');

  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
