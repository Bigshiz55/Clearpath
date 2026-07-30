import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface PackActivitySummary {
  /** Rows in `user_seen` — programmes and Cases marked seen across every Pack. */
  seenCount: number;
  /** Rows in `user_tracking` — people, Cases, franchises, and Packs followed. */
  followingCount: number;
}

/**
 * A single READ-only summary of a user's Pack activity for the main profile
 * page. Deliberately just two counts, not a merge with the main TMDB-keyed
 * watchlist: Pack content (tv_programmes/cases) has no reliable id bridge to
 * TMDB, so this stays its own honest number rather than forcing a join that
 * would either miss rows or double-count.
 */
export async function getPackActivitySummary(supabase: SupabaseClient, userId: string): Promise<PackActivitySummary> {
  if (!userId) return { seenCount: 0, followingCount: 0 };
  const [seen, tracking] = await Promise.all([
    supabase.from('user_seen').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('user_tracking').select('id', { count: 'exact', head: true }).eq('user_id', userId),
  ]);
  return { seenCount: seen.count ?? 0, followingCount: tracking.count ?? 0 };
}
