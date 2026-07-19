import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getPopular } from '@/lib/tmdb/client';
import { tmdbImage } from '@/lib/tmdb/image';
import { getProfile, regionFor } from '@/lib/profile';

export const dynamic = 'force-dynamic';

/**
 * A shuffled set of popular titles to rate, excluding ones already rated/saved.
 *
 * The quiz is meant to be replayed endlessly and show *different* titles each
 * time, with every rating building the user's DNA. So we (a) exclude everything
 * they've already rated/saved (those became DNA signal — no point re-asking),
 * and (b) draw from a randomized span of popularity pages each play, so a fresh
 * mix surfaces every round instead of the same top-of-the-charts titles.
 */
export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

    const profile = await getProfile(supabase, user.id);
    const region = regionFor(profile);

    // Random page window (1..MAX) so each replay pulls a different slice of the
    // catalog. Three consecutive pages per media type keeps the pool big enough
    // that a fresh 24 remain even after many rounds of exclusions.
    const MAX_PAGE = 12;
    const start = 1 + Math.floor(Math.random() * MAX_PAGE);
    const pageOf = (n: number) => ((start + n - 1) % MAX_PAGE) + 1; // wrap within 1..MAX_PAGE
    const pages = [pageOf(0), pageOf(1), pageOf(2)];

    const pools = await Promise.all([
      ...pages.map((p) => getPopular('movie', region, p)),
      ...pages.map((p) => getPopular('tv', region, p)),
    ]);

    const { data: existing } = await supabase
      .from('watchlist_items')
      .select('tmdb_id, media_type')
      .eq('user_id', user.id);
    const seen = new Set((existing ?? []).map((r) => `${r.media_type}-${r.tmdb_id}`));

    const pool = pools.flat().filter((d) => !seen.has(`${d.mediaType}-${d.id}`));

    // Dedupe.
    const dedupKeys = new Set<string>();
    const uniq = pool.filter((d) => {
      const k = `${d.mediaType}-${d.id}`;
      if (dedupKeys.has(k)) return false;
      dedupKeys.add(k);
      return true;
    });

    // Shuffle (Fisher–Yates).
    for (let i = uniq.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [uniq[i], uniq[j]] = [uniq[j]!, uniq[i]!];
    }

    const items = uniq.slice(0, 24).map((d) => ({
      id: d.id,
      mediaType: d.mediaType,
      title: d.title,
      year: d.year,
      posterPath: d.posterPath,
      posterUrl: tmdbImage(d.posterPath, 'w342'),
    }));

    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ error: 'Could not load the quiz right now.' }, { status: 500 });
  }
}
