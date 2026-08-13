/**
 * MATCHING A SCHEDULE ROW TO A REAL TITLE — WITHOUT GUESSING.
 *
 * ── THE DEFECT THIS FIXES ─────────────────────────────────────────────────
 * `resolveProgrammeTmdbId` matched like this:
 *
 *     const best = year
 *       ? results.find((r) => r.year === year) ?? results.find(near(year))
 *       : results[0];
 *
 * and then wrote `best.id` and `best.mediaType` onto the programme row. The
 * `results[0]` branch is not a match, it is TMDB's popularity ordering: search
 * "Snapped" and take whatever is most popular. Worse, that branch is the ONLY
 * one that ever runs, because NEITHER ingest writer populates `release_year` —
 * `tvmazeWriter` and `tvMediaWriter` both insert `title, episode_title,
 * programme_type, season_number, episode_number, genres, description,
 * runtime_minutes, artwork_url` and no year. So `year` is null on every
 * ingested row and every match was "the most popular thing with a vaguely
 * similar name", persisted permanently as that programme's identity.
 *
 * That is how a Pack acquires a confidently wrong `tmdb_media_type`, which is
 * strictly worse than a null one: null fails closed, wrong fails open.
 *
 * ── WHAT REPLACES IT ──────────────────────────────────────────────────────
 * Three requirements, all of them properties of the data rather than of a
 * title's vibe, and every one of them able to return "no match":
 *
 *   EXACT NORMALIZED TITLE   Case, accents, punctuation and a leading article
 *                            differ freely between a TV guide and TMDB; nothing
 *                            else is allowed to. No fuzzy distance, no prefix
 *                            match, no "close enough".
 *   THE EXPECTED KIND        When the provider already declared the row a film
 *                            (or an episode), candidates of the other kind are
 *                            discarded before ranking. Durable evidence
 *                            narrowing the search rather than being overwritten
 *                            by it.
 *   UNAMBIGUOUS              With no year to disambiguate — which is every
 *                            ingested row today — two candidates sharing the
 *                            exact normalized title means NO MATCH. Popularity
 *                            is not evidence. This is the direct replacement
 *                            for `results[0]`.
 *
 * A year, when one is available, is used as a filter and a tie-break rather
 * than as a fallback, so this improves rather than regresses if ingest ever
 * starts writing one.
 *
 * PURE. Takes candidates, returns a verdict. The caller does the network.
 */

/** The shape this needs from a TMDB search result. */
export interface TmdbCandidate {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year: number | null;
}

export interface MatchInput {
  title: string;
  releaseYear?: number | null;
  /** From `expectedTmdbMediaType` — narrows the pool, never widens it. */
  expectedMediaType?: 'movie' | 'tv' | null;
}

export interface TmdbMatch {
  id: number;
  mediaType: 'movie' | 'tv';
  /** Why this was accepted — persisted nowhere, reported everywhere. */
  basis: 'exact-title-unique' | 'exact-title-year';
}

/**
 * Too short to identify anything.
 *
 * "Go", "Us" and "It" are real films, and they are also the titles most likely
 * to collide with a hundred unrelated rows. Without a year there is no way to
 * tell them apart, so they stay unmatched rather than becoming a coin flip.
 */
const MIN_NORMALIZED_LENGTH = 3;

/** Nearest-year tolerance: a guide's year and TMDB's release year drift by one. */
const YEAR_TOLERANCE = 1;

/**
 * Case, accents, punctuation and a leading article — the differences that are
 * always noise between a listings feed and a title database. Nothing else is
 * removed: two titles that differ in a WORD are two different titles.
 */
/**
 * Apostrophe forms, ELIDED rather than turned into a space.
 *
 * \u2500\u2500 THE PRODUCTION DEFECT THIS FIXES \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
 * The generic `[^a-z0-9]+ -> ' '` rule below is correct for hyphens and colons,
 * which really do separate words. It is wrong for an apostrophe INSIDE a word,
 * which never does:
 *
 *   catalogue "Widow's Bay"  ->  "widow s bay"      three tokens
 *   user      "Widows Bay"   ->  "widows bay"       two tokens
 *
 * so an exact title became unfindable over a punctuation mark nobody types
 * consistently. Found by the post-merge smoke of the Critic Layer against the
 * real catalogue, where it made a named anchor resolve `not_found`.
 *
 * DELIBERATELY NARROW. "Strip all punctuation" would merge titles that
 * punctuation genuinely distinguishes; only the marks that sit inside a word
 * are removed, and everything else keeps becoming a separator.
 *
 * Covers the straight quote, both curly forms, the modifier letter apostrophe
 * TMDB occasionally carries, and the two accent characters people type in their
 * place. NFD above does not decompose any of them, so they survive to here.
 */
const APOSTROPHES = /['‘’ʼ´`]/g;

export function normalizeTitle(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(APOSTROPHES, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^(a|an|the) /, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function pickMatch(input: MatchInput, candidates: readonly TmdbCandidate[]): TmdbMatch | null {
  const want = normalizeTitle(input.title ?? '');
  /* THE SHORT-TITLE FLOOR APPLIES ONLY WHEN THERE IS NOTHING TO DISAMBIGUATE.
     `MIN_NORMALIZED_LENGTH`'s own reasoning is conditional: "Without a year
     there is no way to tell them apart, so they stay unmatched rather than
     becoming a coin flip." When a year IS supplied that justification does not
     hold — "It (2017)" is not a coin flip, it is an identity, and refusing it
     would reject the very disambiguation the user provided.

     Widened for critic anchors, where a person naming "It" or "Us" in a request
     is common and the year is often stated. The year branch below still
     requires an exact normalized title, an in-range year and a unique winner,
     so nothing is loosened except this pre-filter. */
  if (want.length < MIN_NORMALIZED_LENGTH && (input.releaseYear ?? null) == null) return null;
  if (want.length === 0) return null;

  // The expected kind narrows the pool BEFORE ranking, so a series can never
  // win a search for a row the provider already called a film.
  const pool = input.expectedMediaType
    ? candidates.filter((c) => c.mediaType === input.expectedMediaType)
    : candidates;

  const exact = pool.filter((c) => normalizeTitle(c.title ?? '') === want);
  if (exact.length === 0) return null;

  const year = input.releaseYear ?? null;
  if (year != null) {
    const inRange = exact.filter((c) => c.year != null && Math.abs(c.year - year) <= YEAR_TOLERANCE);
    if (inRange.length === 0) return null;
    // Closest year wins; a genuine tie is still ambiguous.
    const best = [...inRange].sort(
      (a, b) => Math.abs((a.year as number) - year) - Math.abs((b.year as number) - year),
    );
    const head = best[0];
    if (!head) return null;
    const tied = best.filter((c) => Math.abs((c.year as number) - year) === Math.abs((head.year as number) - year));
    if (tied.length > 1) return null;
    return { id: head.id, mediaType: head.mediaType, basis: 'exact-title-year' };
  }

  /* NO YEAR — SO UNIQUENESS IS THE ONLY EVIDENCE LEFT. This is the branch that
     runs on every ingested row today, and it is where `results[0]` used to be.
     Two candidates with the same exact title and nothing to separate them is
     not a match; it is a question nobody has answered. */
  if (exact.length > 1) return null;
  const only = exact[0];
  if (!only) return null;
  return { id: only.id, mediaType: only.mediaType, basis: 'exact-title-unique' };
}
