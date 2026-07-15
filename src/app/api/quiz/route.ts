import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getPopular } from '@/lib/tmdb/client';
import { tmdbImage } from '@/lib/tmdb/image';
import { getProfile, regionFor } from '@/lib/profile';

export const dynamic = 'force-dynamic';

/** A shuffled set of popular titles to rate, excluding ones already rated/saved. */
export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

    const profile = await getProfile(supabase, user.id);
    const region = regionFor(profile);

    const [m1, m2, t1, t2] = await Promise.all([
      getPopular('movie', region, 1),
      getPopular('movie', region, 2),
      getPopular('tv', region, 1),
      getPopular('tv', region, 2),
    ]);

    const { data: existing } = await supabase
      .from('watchlist_items')
      .select('tmdb_id, media_type')
      .eq('user_id', user.id);
    const seen = new Set((existing ?? []).map((r) => `${r.media_type}-${r.tmdb_id}`));

    const pool = [...m1, ...t1, ...m2, ...t2].filter(
      (d) => !seen.has(`${d.mediaType}-${d.id}`),
    );

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
