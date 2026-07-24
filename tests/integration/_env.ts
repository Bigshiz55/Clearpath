/**
 * Integration-test environment gate. Reads the credentials the real-service tests
 * need; when a group's vars are absent, those tests SKIP (never fail). This is what
 * lets the suite run in CI only when secrets are provided.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const ENV = {
  tmdb: process.env.TMDB_API_KEY ?? '',
  supaUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supaAnon: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
  service: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
};

export const hasTmdb = ENV.tmdb.length > 0;
export const hasSupabase = ENV.supaUrl.length > 0 && ENV.supaAnon.length > 0;

/** Anonymous (publishable-key) Supabase client — the same access a guest browser has. */
export function anonClient(): SupabaseClient {
  return createClient(ENV.supaUrl, ENV.supaAnon, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** A stable-ish unique suffix without Math.random reliance across the suite. */
export function uniq(prefix: string): string {
  return `${prefix}_${process.pid}_${Date.now().toString(36)}`;
}

// Surface, once, why a group is skipped — so a CI log makes the gap obvious.
if (!hasTmdb) console.warn('[integration] SKIP TMDB tests — TMDB_API_KEY not set');
if (!hasSupabase) console.warn('[integration] SKIP Supabase/Court tests — NEXT_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY not set');
