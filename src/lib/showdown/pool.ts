import 'server-only';

import { discoverTitles } from '@/lib/tmdb/client';
import { getCachedDimensions } from '@/lib/titleDimensions';
import { CALIBRATION_BUCKETS } from '@/lib/preference/calibrationPool';
import { isValidDimensions } from '@/lib/scoring/dimensions';
import type { ShowdownTitle } from './matchup';

/**
 * WHERE THE POSTERS COME FROM.
 *
 * Real TMDB titles, sourced through the SAME diverse bucket plan the existing
 * calibration uses — genre × format × era × language, so the pool is wide by
 * construction rather than by hoping a popularity feed happens to be varied.
 *
 * This is also why there is no static poster map here. An earlier build of this
 * game shipped its own hard-coded catalogue and a hand-maintained
 * `POSTER_PATHS`, then reported every poster as unavailable because the build
 * environment had no TMDB key. The app already resolves posters server-side for
 * every other surface; the fix was to stop building a second mechanism, not to
 * fill in the first one.
 *
 * FINGERPRINTS ARE READ FROM CACHE, NEVER CLASSIFIED HERE. `title_dimensions` is
 * populated in batch; classifying on demand would put an LLM in a user request
 * path, which the architecture forbids. A title with no cached fingerprint is
 * dropped rather than guessed at — the planner compares axes, and a title whose
 * axes are invented would corrupt every comparison it appeared in.
 */

/** How many buckets to draw from. The whole set is more breadth than one game needs. */
const BUCKETS_PER_GAME = 10;

export interface PoolResult {
  titles: ShowdownTitle[];
  /** Titles fetched from TMDB before the fingerprint filter. */
  fetched: number;
  /** Dropped for having no cached fingerprint. */
  withoutDimensions: number;
}

/**
 * A diverse pool of real titles that carry real fingerprints.
 *
 * Returns whatever it can. A thin pool is a real state the caller must handle
 * honestly — an empty game is better than a game built on invented axes.
 */
export async function buildShowdownPool(opts: { exclude?: readonly string[] } = {}): Promise<PoolResult> {
  const exclude = new Set(opts.exclude ?? []);
  const buckets = CALIBRATION_BUCKETS.slice(0, BUCKETS_PER_GAME);

  const groups = await Promise.all(
    buckets.map((b) =>
      discoverTitles(b.mediaType, {
        genreIds: b.genreIds,
        sortBy: b.minYear ? 'vote_average.desc' : 'popularity.desc',
        minVotes: b.minVotes,
        minYear: b.minYear,
        maxYear: b.maxYear,
        originalLanguage: b.originalLanguage,
        originCountry: b.originCountry,
      })
        .then((rows) => rows.slice(0, b.take + 2))
        .catch(() => []),
    ),
  );

  const byKey = new Map<string, { id: number; mediaType: 'movie' | 'tv'; title: string; year: number | null; posterPath: string | null }>();
  for (const rows of groups) {
    for (const r of rows) {
      const key = `${r.mediaType}:${r.id}`;
      if (exclude.has(key) || byKey.has(key)) continue;
      // A poster is the whole stimulus here; a title without one has nothing to
      // put on screen and is dropped rather than rendered as an empty tile.
      if (!r.posterPath) continue;
      byKey.set(key, {
        id: r.id,
        mediaType: r.mediaType,
        title: r.title,
        year: r.year,
        posterPath: r.posterPath,
      });
    }
  }

  const entries = Array.from(byKey.entries());
  const dimsMap = await getCachedDimensions(
    entries.map(([, v]) => ({ tmdb_id: v.id, media_type: v.mediaType })),
  );

  const titles: ShowdownTitle[] = [];
  let withoutDimensions = 0;
  for (const [key, v] of entries) {
    const dims = dimsMap.get(`${v.mediaType}-${v.id}`);
    if (!dims || !isValidDimensions(dims)) {
      withoutDimensions += 1;
      continue;
    }
    titles.push({
      key,
      title: v.title,
      year: v.year,
      posterPath: v.posterPath,
      mediaType: v.mediaType,
      dims,
    });
  }

  return { titles, fetched: entries.length, withoutDimensions };
}
