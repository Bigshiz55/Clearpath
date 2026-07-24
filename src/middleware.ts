import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

/** Canonical PascalCase founder routes — any case variant redirects here. */
const FOUNDER_CANONICAL: Record<string, string> = {
  testscott: '/TestScott',
  testheather: '/TestHeather',
  testamy: '/TestAmy',
};

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const key = path.replace(/^\/+/, '').toLowerCase();
  const canonical = FOUNDER_CANONICAL[key];
  if (canonical && path !== canonical) {
    const url = request.nextUrl.clone();
    url.pathname = canonical;
    return NextResponse.redirect(url);
  }
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static assets and image files so the
     * session refreshes on navigations but not on every asset fetch.
     */
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
