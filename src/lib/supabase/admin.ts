import 'server-only';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { publicEnv, serverEnv } from '@/lib/env';

/**
 * Privileged Supabase client using the service-role key. SERVER-ONLY.
 * Never import this from client code. Used only for trusted operations such as
 * account deletion. Bypasses RLS, so callers must authorize the request first.
 */
export function createAdminClient() {
  return createSupabaseClient(publicEnv.supabaseUrl(), serverEnv.serviceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
