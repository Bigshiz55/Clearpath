'use client';

import { createBrowserClient } from '@supabase/ssr';
import { supabasePublicConfig } from '@/lib/env';

/**
 * Browser Supabase client. Returns null until Supabase is configured, so UI can
 * render an unauthenticated experience during Phases 1–4 without crashing.
 * Auth and persistence are wired up in Phase 5.
 */
export function getBrowserSupabase() {
  const config = supabasePublicConfig();
  if (!config) return null;
  return createBrowserClient(config.url, config.anonKey);
}
