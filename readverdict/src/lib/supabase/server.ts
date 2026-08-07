import 'server-only';

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabasePublicConfig } from '@/lib/env';

/**
 * Server-side Supabase client bound to the request cookie store. Returns null
 * until Supabase is configured. When it lands (Phase 5), identity MUST be
 * verified with `supabase.auth.getUser()` — never trust `getSession()` alone.
 */
export function getServerSupabase() {
  const config = supabasePublicConfig();
  if (!config) return null;

  const cookieStore = cookies();
  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(
        cookiesToSet: { name: string; value: string; options: CookieOptions }[],
      ) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set({ name, value, ...options });
          });
        } catch {
          // `set` throws in Server Components; the middleware refreshes sessions.
        }
      },
    },
  });
}
