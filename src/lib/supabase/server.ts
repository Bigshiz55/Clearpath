import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { publicEnv } from '@/lib/env';

/**
 * Server Supabase client bound to the request's cookies. Use this in Server
 * Components, Route Handlers, and Server Actions. Always verify identity with
 * `supabase.auth.getUser()` (which revalidates the token) rather than trusting
 * a stored session.
 */
export function createClient() {
  const cookieStore = cookies();
  return createServerClient(
    publicEnv.supabaseUrl(),
    publicEnv.supabasePublishableKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // `set` is a no-op in Server Components; session refresh happens in
            // middleware. Safe to ignore here.
          }
        },
      },
    },
  );
}

/** Convenience: return the verified current user or null. */
export async function getCurrentUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
