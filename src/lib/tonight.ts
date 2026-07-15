import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MediaType } from '@/lib/types';

export interface TonightPick {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  year: number | null;
  posterPath: string | null;
  personalScore: number;
  primaryCall: string | null;
  reason: string | null;
}
export interface WatchingItem {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  posterPath: string | null;
}
export interface UnratedItem {
  itemId: string;
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  year: number | null;
  posterPath: string | null;
}

export interface Tonight {
  fresh: boolean;
  topPick: TonightPick | null;
  continueWatching: WatchingItem[];
  unrated: UnratedItem[];
  listCount: number;
  watchedThisMonth: number;
}

interface WlRow {
  id: string;
  tmdb_id: number;
  media_type: MediaType;
  title: string;
  year: number | null;
  poster_path: string | null;
  status: string;
  rating: number | null;
  watched_at: string | null;
}

/**
 * A cheap, DB-only snapshot for the "Tonight" home surface — one best pick,
 * what you're mid-watch on, what you finished but haven't rated, and light
 * counts. No TMDB fan-out, so it's fast on the landing page.
 */
export async function getTonight(
  supabase: SupabaseClient,
  userId: string,
  now: Date,
): Promise<Tonight> {
  if (!userId) {
    return { fresh: true, topPick: null, continueWatching: [], unrated: [], listCount: 0, watchedThisMonth: 0 };
  }
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);

  const [wlRes, digestRes, verdictCountRes] = await Promise.all([
    supabase
      .from('watchlist_items')
      .select('id, tmdb_id, media_type, title, year, poster_path, status, rating, watched_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(200),
    supabase
      .from('digest_items')
      .select('tmdb_id, media_type, title, year, poster_path, personal_score, primary_call, reason')
      .eq('dismissed', false)
      .order('personal_score', { ascending: false })
      .limit(1),
    supabase.from('verdicts').select('id', { count: 'exact', head: true }).eq('user_id', userId),
  ]);

  const rows = (wlRes.data as WlRow[] | null) ?? [];
  const continueWatching = rows
    .filter((r) => r.status === 'watching')
    .slice(0, 4)
    .map((r) => ({ tmdbId: r.tmdb_id, mediaType: r.media_type, title: r.title, posterPath: r.poster_path }));
  const unrated = rows
    .filter((r) => r.status === 'watched' && r.rating == null)
    .slice(0, 6)
    .map((r) => ({
      itemId: r.id,
      tmdbId: r.tmdb_id,
      mediaType: r.media_type,
      title: r.title,
      year: r.year,
      posterPath: r.poster_path,
    }));
  const listCount = rows.filter((r) => r.status === 'strict' || r.status === 'possible').length;
  const watchedThisMonth = rows.filter((r) => r.status === 'watched' && r.watched_at && Date.parse(r.watched_at) >= monthStart).length;

  const d = (digestRes.data as Array<Record<string, unknown>> | null)?.[0];
  const topPick: TonightPick | null = d
    ? {
        tmdbId: Number(d.tmdb_id),
        mediaType: d.media_type as MediaType,
        title: d.title as string,
        year: (d.year as number | null) ?? null,
        posterPath: (d.poster_path as string | null) ?? null,
        personalScore: Number(d.personal_score),
        primaryCall: (d.primary_call as string | null) ?? null,
        reason: (d.reason as string | null) ?? null,
      }
    : null;

  const verdictCount = verdictCountRes.count ?? 0;
  const fresh = rows.length === 0 && verdictCount === 0;

  return { fresh, topPick, continueWatching, unrated, listCount, watchedThisMonth };
}
