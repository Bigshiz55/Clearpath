import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Behavioral watch stats mined from data we already store on `watchlist_items`
 * (status, rating, added_at, watched_at, priority) — no external API. Feeds the
 * "Your Watch DNA" profile. Read-only and best-effort.
 */
export interface WatchStats {
  rated: number; // titles given a 1–10
  finished: number; // status = watched
  abandoned: number; // status = dropped / paused
  finishRate: number | null; // finished / (finished + abandoned), 0..1
  favorites: number; // priority > 0
  avgDaysToWatch: number | null; // added_at → watched_at, average days
  tracked: number; // total rows
}

const DAY = 86_400_000;

export async function getWatchStats(supabase: SupabaseClient, userId: string): Promise<WatchStats> {
  const empty: WatchStats = { rated: 0, finished: 0, abandoned: 0, finishRate: null, favorites: 0, avgDaysToWatch: null, tracked: 0 };
  if (!userId) return empty;
  const { data, error } = await supabase
    .from('watchlist_items')
    .select('status, rating, priority, added_at, watched_at')
    .eq('user_id', userId)
    .limit(2000);
  if (error || !data) return empty;

  let rated = 0, finished = 0, abandoned = 0, favorites = 0;
  let dwellSum = 0, dwellN = 0;
  for (const r of data) {
    if (typeof r.rating === 'number') rated += 1;
    if (r.status === 'watched') finished += 1;
    if (r.status === 'dropped' || r.status === 'paused') abandoned += 1;
    if (typeof r.priority === 'number' && r.priority > 0) favorites += 1;
    if (r.watched_at && r.added_at) {
      const d = (Date.parse(r.watched_at as string) - Date.parse(r.added_at as string)) / DAY;
      if (Number.isFinite(d) && d >= 0) { dwellSum += d; dwellN += 1; }
    }
  }
  const started = finished + abandoned;
  return {
    rated,
    finished,
    abandoned,
    finishRate: started > 0 ? finished / started : null,
    favorites,
    avgDaysToWatch: dwellN > 0 ? dwellSum / dwellN : null,
    tracked: data.length,
  };
}
