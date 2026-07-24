import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { discoverTitles } from '@/lib/tmdb/client';
import { tmdbImage } from '@/lib/tmdb/image';
import { getProfile, regionFor } from '@/lib/profile';
import { packByKey, packSource } from '@/lib/preference/packs';
import { countAnswersBySource } from '@/lib/preference/dnaSignals';

export const dynamic = 'force-dynamic';

/**
 * An OPTIONAL calibration pack (Crime, Anime, Reality, …). Finite by pack size,
 * resumable by answered count, and — crucially — it feeds DNA Confidence ONLY.
 * Pack answers carry source `pack:<key>`, so they never count toward the finite
 * onboarding Quiz Progress. Returns { items, answered, size, complete }.
 */
export async function GET(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

    const url = new URL(request.url);
    const key = url.searchParams.get('key') ?? '';
    const sessionId = url.searchParams.get('session') ?? undefined;
    const pack = packByKey(key);
    if (!pack) return NextResponse.json({ error: 'Unknown pack.' }, { status: 404 });

    const answered = await countAnswersBySource(supabase, user.id, packSource(key), sessionId);
    if (answered >= pack.size) {
      return NextResponse.json({ items: [], answered, size: pack.size, complete: true });
    }

    const profile = await getProfile(supabase, user.id);
    const region = regionFor(profile) || 'US';

    const rows = await discoverTitles(pack.query.mediaType, {
      region,
      genreIds: pack.query.genreIds,
      sortBy: pack.query.sortBy ?? 'popularity.desc',
      minVotes: pack.query.minVotes,
      minYear: pack.query.minYear,
      maxYear: pack.query.maxYear,
      originalLanguage: pack.query.originalLanguage,
      originCountry: pack.query.originCountry,
    }).catch(() => [] as Awaited<ReturnType<typeof discoverTitles>>);

    const { data: existing } = await supabase
      .from('watchlist_items')
      .select('tmdb_id, media_type')
      .eq('user_id', user.id);
    const seen = new Set((existing ?? []).map((r) => `${r.media_type}:${r.tmdb_id}`));

    const dedup = new Set<string>();
    const remaining = Math.max(0, pack.size - answered);
    const items = rows
      .filter((r) => {
        const k = `${r.mediaType}:${r.id}`;
        if (seen.has(k) || dedup.has(k)) return false;
        dedup.add(k);
        return true;
      })
      .slice(0, remaining)
      .map((r) => ({
        id: r.id,
        mediaType: r.mediaType,
        title: r.title,
        year: r.year,
        posterPath: r.posterPath,
        posterUrl: tmdbImage(r.posterPath, 'w342'),
        genre: pack.genres[0] ?? null,
      }));

    return NextResponse.json({ items, answered, size: pack.size, complete: false });
  } catch {
    return NextResponse.json({ error: 'Could not load this pack right now.' }, { status: 500 });
  }
}
