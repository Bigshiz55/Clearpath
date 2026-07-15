import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { publicEnv } from '@/lib/env';

const PROTECTED_PREFIXES = ['/app'];

/**
 * Refreshes the Supabase session cookie on every request and guards protected
 * routes. Returns a response that carries any refreshed cookies.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));

  let supabaseUrl: string;
  let supabaseKey: string;
  try {
    supabaseUrl = publicEnv.supabaseUrl();
    supabaseKey = publicEnv.supabasePublishableKey();
  } catch {
    // Auth not configured (e.g. preview build with no env). Protected app
    // routes cannot verify a user, so send them to login rather than letting
    // a server component throw. Public routes render normally.
    if (isProtected) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = '/login';
      redirectUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(redirectUrl);
    }
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isProtected && !user) {
    // No account required: mint an anonymous "guest" session on the fly so
    // anyone with the link can use the app. Requires "Anonymous sign-ins"
    // enabled in Supabase; if it's disabled, fall back to the login page.
    const { error } = await supabase.auth.signInAnonymously();
    if (error) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = '/login';
      redirectUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(redirectUrl);
    }
  }

  return response;
}
