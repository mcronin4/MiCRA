import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware for Next.js App Router.
 * Note: Full session checking is handled client-side via AuthProvider.
 * This middleware primarily handles route-based redirects for auth pages.
 */
export function middleware(req: NextRequest) {
  // Protected routes - client-side auth check will handle actual protection
  // This just ensures the auth pages don't conflict
  const pathname = req.nextUrl.pathname;

  // Allow auth pages and public assets
  if (pathname.startsWith('/signup')) {
    return NextResponse.next();
  }

  // Allow static assets and API routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/backend') ||
    pathname.match(/\.(ico|png|jpg|jpeg|svg|css|js)$/)
  ) {
    return NextResponse.next();
  }

  // For all other routes, let client-side auth handle protection
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
