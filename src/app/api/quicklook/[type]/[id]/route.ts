import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSharedTitleData } from '@/lib/titleData';
import { computeGeneralScore } from '@/lib/scoring/general';
import type { TileRatings } from '@/lib/ratings';
import { streamingNames } from '@/lib/services';
import { getProfile, regionFor } from '@/lib/profile';
import { tmdbImage } from '@/lib/tmdb/image';
import type { MediaType } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * A compact "quick look" payload for the wall's pop-open modal — enough to feel
 * like a bigger screen (backdrop, trailer, synopsis, ratings, where-to-watch)
 * without loading the full personalized verdict. User-agnostic and cheap: it
 * rides the same 12h shared-title cache as the title page.
 */
export async function GET(req: Request, { params }: { params: { type: string; id: string } }) {
  const mediaType: MediaType = params.type === 'tv' ? 'tv' : 'movie';
  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Bad id' }, { status: 400 });

  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const region = regionFor(user ? await getProfile(supabase, user.id) : null);

    const { meta, providers } = await getSharedTitleData(mediaType, id, region);
    const general = computeGeneralScore(meta, providers);
    // Build ratings straight from the metadata so every card shows what we have:
    // TMDB audience is always present; IMDb/RT/Metacritic fill in when available.
    const ratings: TileRatings = {
      standardScore: general.standardScore ?? general.score,
      audience: meta.voteAverage != null ? Math.round(meta.voteAverage * 10) : null,
      rtAudience: meta.rtAudience ?? null,
      tomatometer: meta.rottenTomatoes ?? null,
      imdb: meta.imdbRating ?? null,
      metacritic: meta.metascore ?? null,
    };
    const where = providers ? streamingNames(providers.options).slice(0, 4) : [];

    const runtime =
      mediaType === 'movie'
        ? meta.runtimeMinutes
          ? `${Math.floor(meta.runtimeMinutes / 60)}h ${meta.runtimeMinutes % 60}m`
          : null
        : meta.numberOfSeasons
          ? `${meta.numberOfSeasons} season${meta.numberOfSeasons === 1 ? '' : 's'}`
          : null;

    return NextResponse.json({
      id,
      mediaType,
      title: meta.title,
      year: meta.year,
      overview: meta.overview || null,
      backdropUrl: tmdbImage(meta.backdropPath, 'w780'),
      posterUrl: tmdbImage(meta.posterPath, 'w342'),
      trailerUrl: meta.trailerUrl,
      genres: meta.genres.slice(0, 4),
      contentRating: meta.contentRating,
      status: meta.status ?? null,
      runtime,
      score: general.score,
      standardScore: general.standardScore ?? general.score,
      ratings,
      where,
    });
  } catch {
    return NextResponse.json({ error: 'Could not load this title.' }, { status: 500 });
  }
}
