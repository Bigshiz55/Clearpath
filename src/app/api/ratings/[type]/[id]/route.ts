import { NextResponse } from 'next/server';
import { getScoringData } from '@/lib/titleData';
import { computeGeneralScore } from '@/lib/scoring/general';
import { EMPTY_TILE_RATINGS, type TileRatings } from '@/lib/ratings';

export const runtime = 'nodejs';

/**
 * Public tile ratings for a title (Tomatometer, audience, IMDb, Metacritic, our
 * Standard Score). Built from the shared 12h-cached title hydration, so a whole
 * grid of cards collapses to at most one hydration per title. Returns empty
 * ratings (never an error) so a card never breaks on a miss.
 */
export async function GET(_req: Request, { params }: { params: { type: string; id: string } }) {
  const mediaType = params.type === 'tv' ? 'tv' : 'movie';
  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ ratings: EMPTY_TILE_RATINGS });
  }
  try {
    const { meta, providers } = await getScoringData(mediaType, id, 'US');
    const general = computeGeneralScore(meta, providers);
    // Build straight from metadata so every card reliably gets the verdict
    // (standardScore) and the real critic scores + Popcorn when available.
    const ratings: TileRatings = {
      standardScore: general.standardScore ?? general.score,
      audience: meta.voteAverage != null ? Math.round(meta.voteAverage * 10) : null,
      rtAudience: meta.rtAudience ?? null,
      tomatometer: meta.rottenTomatoes ?? null,
      imdb: meta.imdbRating ?? null,
      metacritic: meta.metascore ?? null,
    };
    return NextResponse.json(
      { ratings },
      { headers: { 'Cache-Control': 'public, s-maxage=43200, stale-while-revalidate=86400' } },
    );
  } catch {
    return NextResponse.json({ ratings: EMPTY_TILE_RATINGS });
  }
}
