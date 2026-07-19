import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getPopular, discoverTitles } from '@/lib/tmdb/client';
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

    // Each round mixes two sources, both randomized so selections differ every
    // play: (1) current popular titles, and (2) acclaimed CLASSICS from a random
    // older era — old movies & TV are great taste signal, so we throw them in to
    // fine-tune the DNA, not just chart-toppers.
    const MAX_PAGE = 10;
    const start = 1 + Math.floor(Math.random() * MAX_PAGE);
    const pageOf = (n: number) => ((start + n - 1) % MAX_PAGE) + 1; // wrap within 1..MAX_PAGE
    const popPages = [pageOf(0), pageOf(1)];

    const ERAS: readonly [number, number][] = [[1970, 1990], [1985, 2000], [1995, 2010], [2005, 2016]];
    const era = ERAS[Math.floor(Math.random() * ERAS.length)]!;
    const classicPage = 1 + Math.floor(Math.random() * 3);

    const [popMovies, popTv, classicMovies, classicTv] = await Promise.all([
      Promise.all(popPages.map((p) => getPopular('movie', region, p))).then((a) => a.flat()),
      Promise.all(popPages.map((p) => getPopular('tv', region, p))).then((a) => a.flat()),
      discoverTitles('movie', { region, sortBy: 'vote_average.desc', minVotes: 1200, minYear: era[0], maxYear: era[1], page: classicPage }),
      discoverTitles('tv', { region, sortBy: 'vote_average.desc', minVotes: 300, minYear: era[0], maxYear: era[1], page: classicPage }),
    ]);
    const pools = [popMovies, popTv, classicMovies, classicTv];

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
