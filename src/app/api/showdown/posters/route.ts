import { NextResponse } from 'next/server';
import { getTitle } from '@/lib/tmdb/client';
import { TITLES } from '@/lib/voice/quickdna/definition';
import { mediaTypeFor } from '@/lib/showdown/mediaType';

export const runtime = 'nodejs';
/** The diagnostic catalogue is fixed, so this is the same answer for everyone. */
export const revalidate = 86400;

/**
 * POSTER PATHS FOR THE DIAGNOSTIC CATALOGUE.
 *
 * Showdown shipped with a hand-maintained `POSTER_PATHS` map that was EMPTY, so
 * every tile rendered the typographic fallback and a poster-recognition game had
 * no posters. The map was never filled because the session that wrote it had no
 * TMDB key and recorded the blocker as "api.themoviedb.org is blocked by the
 * egress policy (CONNECT 403)". That is no longer the failure: the host answers
 * 401, which is "no key", and image.tmdb.org serves 200. The network is open.
 *
 * So this resolves paths the way the rest of the product does — server-side,
 * through the canonical `getTitle` client, keyed by the tmdbId already recorded
 * against each diagnostic title. No second TMDB integration, no hand-copied
 * strings to drift, no key in the browser, and nothing hard-coded that could
 * render someone else's film beside the right name.
 *
 * CACHED FOR A DAY because the catalogue is fixed and identical for every
 * player: this is at most ~46 upstream calls once per day, not per session and
 * not per player. TMDB is a free source under the app's `free_live` policy.
 *
 * DEGRADES TO THE TYPOGRAPHIC TILE. A title that fails to resolve is simply
 * absent from the map and the client renders what it already renders today, so
 * a missing key or a dead CDN costs artwork, never playability.
 */
export async function GET() {
  const settled = await Promise.allSettled(
    TITLES.map(async (t) => {
      const meta = await getTitle(mediaTypeFor(t.id), t.tmdbId);
      return { id: t.id, posterPath: meta.posterPath ?? null };
    }),
  );

  const posters: Record<string, string> = {};
  let failed = 0;
  for (const r of settled) {
    if (r.status !== 'fulfilled') {
      failed++;
      continue;
    }
    if (r.value.posterPath) posters[r.value.id] = r.value.posterPath;
  }

  return NextResponse.json(
    {
      posters,
      resolved: Object.keys(posters).length,
      total: TITLES.length,
      // Reported rather than hidden: "the game looks unfinished" and "TMDB is
      // refusing us" are different problems with different owners.
      failed,
    },
    { headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400' } },
  );
}
