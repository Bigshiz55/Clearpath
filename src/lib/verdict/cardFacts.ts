/**
 * THE FACTS THAT FILL THE COLUMN BESIDE THE POSTER.
 *
 * A row card is a 2:3 poster next to a title, and a title is two lines. On a
 * phone that left roughly 150px of black beside every poster on every card,
 * while runtime, certificate, genre and season count — all of which we ALREADY
 * hydrate to compute the score — were nowhere on the card at all. The space and
 * the missing information were the same problem.
 *
 * Two short lines: what it costs you to watch (length, certificate, how much of
 * it there is) and what kind of thing it is (genre). Nothing here is derived,
 * inferred or rounded into a claim — every part is printed only when TMDB
 * actually gave us the field, and the line simply gets shorter when it did not.
 *
 * Pure. No I/O, no clock.
 */

export interface CardFactsInput {
  mediaType?: 'movie' | 'tv';
  /** Movie feature length. */
  runtimeMinutes?: number | null;
  /** TV per-episode length. */
  episodeRuntimeMinutes?: number | null;
  seasons?: number | null;
  /** Episodes aired so far — never presented as a total unless it is one. */
  episodes?: number | null;
  /** "PG-13", "TV-MA". */
  contentRating?: string | null;
  genres?: readonly string[];
}

export interface CardFacts {
  /** Length · certificate · size of the run. */
  primary: string[];
  /** Up to three genres. */
  genres: string[];
  /** True when there is nothing truthful to print at all. */
  empty: boolean;
}

/** How many genres a narrow column can hold without wrapping to a third line. */
export const MAX_GENRES = 3;
/** How many "what it costs you" facts fit on one line in that column. */
export const MAX_PRIMARY = 3;

/** 105 → "1h 45m", 48 → "48m". Null in, null out — never "0m". */
export function formatRuntime(minutes: number | null | undefined): string | null {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return null;
  const m = Math.round(minutes);
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest}m`;
  if (rest === 0) return `${h}h`;
  return `${h}h ${rest}m`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function buildCardFacts(input: CardFactsInput): CardFacts {
  const primary: string[] = [];

  if (input.mediaType === 'tv') {
    // HOW MUCH OF IT THERE IS is the question a series raises and a film does
    // not — one season or eight is the difference between tonight and a month.
    if (input.seasons != null && input.seasons > 0) primary.push(plural(input.seasons, 'season'));
    if (input.episodes != null && input.episodes > 0) primary.push(`${input.episodes} eps`);
    const ep = formatRuntime(input.episodeRuntimeMinutes);
    if (ep) primary.push(`${ep}/ep`);
  } else {
    const rt = formatRuntime(input.runtimeMinutes);
    if (rt) primary.push(rt);
  }

  const cert = (input.contentRating ?? '').trim();
  if (cert) primary.push(cert);

  const genres = (input.genres ?? [])
    .map((g) => (g ?? '').trim())
    .filter((g) => g.length > 0)
    .slice(0, MAX_GENRES);

  // THREE PARTS, NOT FIVE. A series can produce seasons + episodes + per-episode
  // runtime + certificate, which is four facts and two lines in a 200px column —
  // and the fourth is the least useful of them.
  const kept = primary.slice(0, MAX_PRIMARY);
  return { primary: kept, genres, empty: kept.length === 0 && genres.length === 0 };
}
