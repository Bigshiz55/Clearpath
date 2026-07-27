import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * WHAT THE USER HAS ACTUALLY WATCHED, for the titles on their R docket.
 *
 * The one part of a re-Verd1ct the client cannot work out for itself: when they
 * last saw it, what they scored it, and whether they finished it. Everything
 * else the ruling needs (runtime, availability, the general verdict) already
 * comes from quicklook.
 *
 * Scoped to the caller's own rows by their verified user id AND by RLS — never
 * by a client-supplied id. It returns only rows for the keys asked about, so it
 * is not an export of somebody's viewing history.
 *
 * Missing is missing: a title with no `watched_at` comes back with
 * `lastWatchedAt: null`, and the engine treats that as genuinely unknown rather
 * than guessing "a long time ago".
 */
export interface RewatchHistoryRow {
  key: string;
  lastWatchedAt: number | null;
  timesWatched: number;
  /** 0..100, from the stored 1–10. Null when they never rated it. */
  userRating: number | null;
  finished: boolean | null;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as { keys?: unknown } | null;
    const keys = Array.isArray(body?.keys)
      ? (body!.keys as unknown[]).filter((k): k is string => typeof k === 'string').slice(0, 24)
      : [];
    if (keys.length === 0) return NextResponse.json({ rows: [] });

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ rows: [] });

    const wanted = new Set(keys);
    const ids = keys
      .map((k) => Number(k.split(':')[1]))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (ids.length === 0) return NextResponse.json({ rows: [] });

    const { data, error } = await supabase
      .from('watchlist_items')
      .select('tmdb_id, media_type, status, rating, watched_at')
      .eq('user_id', user.id)
      .in('tmdb_id', ids)
      .limit(200);
    if (error || !data) return NextResponse.json({ rows: [] });

    const rows: RewatchHistoryRow[] = [];
    for (const r of data) {
      const key = `${r.media_type}:${r.tmdb_id}`;
      if (!wanted.has(key)) continue;
      const watchedAt = r.watched_at ? Date.parse(r.watched_at as string) : NaN;
      const status = r.status as string | null;
      rows.push({
        key,
        lastWatchedAt: Number.isFinite(watchedAt) ? watchedAt : null,
        // The schema records one row per title, so a finished title counts once.
        // It is not a play count and must not pretend to be one.
        timesWatched: status === 'watched' ? 1 : 0,
        userRating: typeof r.rating === 'number' ? r.rating * 10 : null,
        finished: status === 'watched' ? true : status === 'dropped' ? false : null,
      });
    }

    return NextResponse.json({ rows });
  } catch {
    return NextResponse.json({ rows: [] });
  }
}
