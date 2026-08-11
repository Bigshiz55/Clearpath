/**
 * DNA SHOWDOWN — poster art for the diagnostic set.
 *
 * The matchup catalogue is a fixed, curated list of a few dozen films, so the
 * right shape for its artwork is STATIC DATA: verified once, committed, and
 * read with no network call at all. That satisfies the rule this repo already
 * holds elsewhere — nothing third-party on the customer request path — without
 * needing a cache, a route, or a key in the browser.
 *
 * `posterPath` is a TMDB image path (`/xxxx.jpg`), resolved and verified
 * against the title's own `tmdbId`, name and release year. It is deliberately
 * NOT a full URL: the size is chosen at render time by `tmdbImage()`, so a
 * phone can fetch w342 and a desktop w500 from the same record.
 *
 * UNRESOLVED ENTRIES ARE NOT A FAILURE STATE. A title with no verified path
 * renders the typographic fallback, which is a designed treatment rather than a
 * broken image — and the same treatment covers a path that 404s at runtime, a
 * dead CDN, or an offline device. `poster.test.ts` holds the line that the
 * catalogue's coverage is known and deliberate rather than drifting: every
 * title must either carry a verified path or appear in `UNRESOLVED` with a
 * reason, so "we never got round to it" cannot masquerade as "it has a
 * fallback".
 */

import { tmdbImage, type TmdbImageSize } from '@/lib/tmdb/image';
import { TITLES } from '@/lib/voice/quickdna/definition';

/**
 * Verified TMDB poster paths, keyed by the diagnostic title's own id.
 *
 * HOW TO ADD OR CORRECT AN ENTRY: resolve the path from the title's `tmdbId`
 * (never by search — an id is exact and a title string is not), confirm the
 * returned name and release year match the entry in `definition.ts`, and paste
 * the `poster_path` verbatim. Never guess a path: a wrong-but-plausible one
 * renders someone else's film beside the right name, which is worse than the
 * fallback in every way.
 */
export const POSTER_PATHS: Readonly<Record<string, string>> = {
  // Populated by verified resolution. Empty is a legitimate state: every title
  // then renders the typographic treatment, and the game is fully playable.
};

/**
 * Titles knowingly without artwork, and why.
 *
 * An entry here is a DECISION. It keeps `poster.test.ts` honest: the test
 * demands that every title is either resolved or explained, so this map is the
 * only way to leave one blank, and doing so is visible in review.
 */
const NO_TMDB_ACCESS =
  'awaiting one-off verified resolution: this build environment has no TMDB_API_KEY ' +
  'and api.themoviedb.org is blocked by the egress policy (CONNECT 403), so a path ' +
  'here could only be guessed — and a wrong-but-plausible path renders someone ' +
  'else’s film beside the right name. Renders the typographic tile until resolved.';

export const UNRESOLVED: Readonly<Record<string, string>> = Object.fromEntries(
  TITLES.map((t) => [t.id, NO_TMDB_ACCESS]),
);

export interface PosterArt {
  /** Ready-to-use image URL, or null when the typographic treatment should render. */
  url: string | null;
  /** Why there is no image. Surfaced in tests and dev, never to a customer. */
  reason: string | null;
}

export function posterFor(titleId: string, size: TmdbImageSize = 'w342'): PosterArt {
  const path = POSTER_PATHS[titleId];
  if (path) {
    const url = tmdbImage(path, size);
    if (url) return { url, reason: null };
    return { url: null, reason: 'path present but could not be resolved to a URL' };
  }
  return { url: null, reason: UNRESOLVED[titleId] ?? 'no verified poster path yet' };
}

/** Coverage across the whole diagnostic catalogue — reported by the test. */
export function posterCoverage(): { resolved: number; total: number; missing: string[] } {
  const missing: string[] = [];
  for (const t of TITLES) if (!POSTER_PATHS[t.id]) missing.push(t.id);
  return { resolved: TITLES.length - missing.length, total: TITLES.length, missing };
}
