import { NextResponse } from 'next/server';
import { getScoringData } from '@/lib/titleData';
import { computeGeneralScore } from '@/lib/scoring/general';
import { EMPTY_TILE_RATINGS, type TileRatings } from '@/lib/ratings';
import { getCardAvailability, type CardAvailability } from '@/lib/watchmode/cardAvailability';
import { createClient } from '@/lib/supabase/server';
import { getProfile, regionFor } from '@/lib/profile';

export const runtime = 'nodejs';

const EMPTY_AVAILABILITY: CardAvailability = { status: 'checking', sources: [], checkedAt: null };

/**
 * The viewer's own region when signed in, else the 'US' default — same rule
 * as every other availability lookup (`regionFor`). This used to be hardcoded
 * to 'US' for every card everywhere, so a signed-in user with a non-US region
 * set in their profile still saw US-only availability/ratings on every card
 * grid across the app (search results, browse, home) even though the title
 * page itself resolved the correct region. Never throws: an anonymous viewer
 * or a lookup failure just gets the 'US' default, same as before.
 */
async function viewerRegion(): Promise<string> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return 'US';
    const profile = await getProfile(supabase, user.id);
    return regionFor(profile);
  } catch {
    return 'US';
  }
}

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
  const region = await viewerRegion();
  // Read-only lookup against OUR OWN `watchmode_availability`/
  // `watchmode_fetch_state` cache tables — never a live Watchmode call. See
  // src/lib/watchmode/sync.ts for what writes them and why nothing here does.
  const availability = await getCardAvailability(mediaType, id, region).catch((): CardAvailability => EMPTY_AVAILABILITY);
  try {
    const { meta, providers } = await getScoringData(mediaType, id, region);
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
    // The synopsis rides along on a hydration we were already doing. A card
    // that shows a poster and a number but not what the thing is about asks the
    // viewer to judge a film by its artwork; TMDB has already given us the
    // sentence, and it cost nothing to carry it here. Null when TMDB has none —
    // never a placeholder, never invented.
    const overview = meta.overview?.trim() ? meta.overview.trim() : null;
    // THE FACTS THE CARD HAD NO ROOM FOR — and then had nothing but room for.
    // Runtime, certificate, genre and season count all come out of the SAME
    // hydration that produced the scores above, so carrying them costs nothing
    // and fills the column that was sitting empty beside every poster. Each is
    // null when TMDB has none; the card shortens rather than inventing.
    const facts = {
      runtimeMinutes: meta.runtimeMinutes ?? null,
      episodeRuntimeMinutes: meta.episodeRuntimeMinutes ?? null,
      seasons: meta.numberOfSeasons ?? null,
      episodes: meta.episodesAired ?? meta.numberOfEpisodes ?? null,
      contentRating: meta.contentRating ?? null,
      genres: Array.isArray(meta.genres) ? meta.genres.slice(0, 4) : [],
    };
    // The response is now region-personalized (see viewerRegion above), and
    // this route has no per-region cache key — a shared CDN cache would risk
    // serving one viewer's region-specific availability to a viewer in a
    // different region. Only the 'US' response (the anonymous/default case,
    // by far the common one) is safe to cache publicly; anything else must
    // never be shared across viewers.
    const cacheControl =
      region === 'US' ? 'public, s-maxage=43200, stale-while-revalidate=86400' : 'private, no-store';
    return NextResponse.json({ ratings, overview, facts, availability }, { headers: { 'Cache-Control': cacheControl } });
  } catch {
    return NextResponse.json({ ratings: EMPTY_TILE_RATINGS, overview: null, facts: null, availability });
  }
}
