import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { discoverTitles } from '@/lib/tmdb/client';
import { tmdbImage } from '@/lib/tmdb/image';
import { getProfile, regionFor, getMyServices } from '@/lib/profile';
import { moodByKey } from '@/lib/moods';
import type { MediaType } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const mood = moodByKey(url.searchParams.get('mood') ?? '');
    if (!mood) return NextResponse.json({ error: 'Unknown mood.' }, { status: 400 });
    const mineOnly = url.searchParams.get('mine') === '1';

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

    const [profile, services, wl, verdicts] = await Promise.all([
      getProfile(supabase, user.id),
      mineOnly ? getMyServices(supabase, user.id) : Promise.resolve<number[]>([]),
      supabase.from('watchlist_items').select('tmdb_id, media_type').eq('user_id', user.id),
      supabase.from('verdicts').select('tmdb_id, media_type').eq('user_id', user.id),
    ]);
    const region = regionFor(profile);

    const exclude = new Set<string>();
    for (const r of wl.data ?? []) exclude.add(`${r.media_type}-${r.tmdb_id}`);
    for (const r of verdicts.data ?? []) exclude.add(`${r.media_type}-${r.tmdb_id}`);

    const providerIds = mineOnly && services.length > 0 ? services : undefined;
    const minVotes = mood.tone === 'light' ? 150 : 250;
    const minRating = mood.tone === 'heavy' ? 6.8 : 6.2;

    const [movies, tv] = await Promise.all([
      discoverTitles('movie', { genreIds: mood.genres, providerIds, region, minVotes, minRating, sortBy: 'popularity.desc' }),
      discoverTitles('tv', { genreIds: mood.genres, providerIds, region, minVotes: Math.round(minVotes / 2), minRating, sortBy: 'popularity.desc' }),
    ]);

    // Interleave movie/tv, drop excluded + dupes.
    const seen = new Set<string>();
    const pool: { id: number; mediaType: MediaType; title: string; year: number | null; posterPath: string | null }[] = [];
    const max = Math.max(movies.length, tv.length);
    for (let i = 0; i < max; i++) {
      for (const arr of [movies, tv]) {
        const t = arr[i];
        if (!t) continue;
        const key = `${t.mediaType}-${t.id}`;
        if (exclude.has(key) || seen.has(key)) continue;
        seen.add(key);
        pool.push({ id: t.id, mediaType: t.mediaType, title: t.title, year: t.year, posterPath: t.posterPath });
      }
    }

    return NextResponse.json({
      mood: mood.key,
      picks: pool.slice(0, 18).map((t) => ({
        ...t,
        posterUrl: tmdbImage(t.posterPath, 'w342'),
      })),
    });
  } catch {
    return NextResponse.json({ error: 'Could not load picks right now.' }, { status: 500 });
  }
}
