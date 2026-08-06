import { isExactTitle } from '@/lib/nlu/titleNormalize';
import { splitTitleYear, isGenericPhrase } from '@/lib/nlu/queryRepair';

/**
 * WHERE A TYPED QUERY ACTUALLY GOES.
 *
 * Pure, no I/O, unit-tested — the routing decision has to be checkable without
 * a browser, because getting it wrong is invisible in code review and obvious
 * to a user in one tap.
 *
 * ── THE DEFECT THIS REPLACES ──────────────────────────────────────────────
 * `quickSearchHref()` sent EVERY query to `/app/ask`. So typing "CSI: NY" —
 * the name of a specific show — asked the Judge for a recommendation and came
 * back with something unrelated. A search box that cannot find a title by its
 * own name is not a search box.
 *
 * The split is between two genuinely different questions:
 *
 *   "CSI: NY"                              → find me THIS THING        (catalog)
 *   "Tom Hanks"                            → find me this PERSON       (catalog)
 *   "crime"                                → show me this GENRE        (catalog)
 *   "find me a funny crime movie under 2h" → DECIDE something for me   (ask)
 *
 * Only the last one is a recommendation request. Everything else is a lookup,
 * and a lookup belongs in the catalog.
 *
 * ── WHY NOT A WORD COUNT ──────────────────────────────────────────────────
 * The previous heuristic inside SearchBar treated any query of five or more
 * words as a request. That silently broke every long title: "The Lord of the
 * Rings" and "Everything Everywhere All at Once" are both five words, and both
 * would have been sent to the Judge instead of found. Length is not intent.
 * Every rule below is a positive signal that someone is ASKING rather than
 * NAMING.
 */

/** Asking to be shown or told something, in the ordinary ways English does it. */
const REQUEST_VERBS =
  /\b(find me|find a|find some|show me|recommend|recommendation|suggest|suggestion|give me|gimme|pull up|put on|what should i|what to watch|i want (?:a|an|some|to)|i wanna|i'?d like|i would like|looking for|in the mood|feel like watching|worth watching|any good|help me (?:find|pick|choose)|pick (?:me|something)|surprise me)\b/i;

/**
 * A CONSTRAINT is a request even without a verb. "under two hours" is not part
 * of any title; it is a filter someone is asking us to apply.
 */
const CONSTRAINT =
  /\b(under (?:\d+|one|two|three|an?)\b|over (?:\d+|one|two|three)\b|less than|no longer than|shorter than|at least|between \d+|\d+\s*(?:minutes?|mins?|hours?|hrs?)\b|under (?:\d+)\s*(?:minutes?|hours?))/i;

/** A media noun — the kind of thing someone asks to be shown several of. */
const MEDIA_NOUN =
  /\b(movies?|films?|shows?|series|documentar(?:y|ies)|comed(?:y|ies)|thrillers?|dramas?|myster(?:y|ies)|picks?|options?|titles?)\b/i;

/** "3 crime thrillers", "five comedies" — a count plus a media noun. */
const COUNT_PREFIX = /^\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i;

/** A bare description standing in for a request: "Something light and funny". */
const LEADING_SOMETHING = /^\s*(something|anything)\b/i;

/** A question is being asked, not a name being typed. */
const QUESTION = /^\s*(what|which|who|any|can you|could you)\b|[?]\s*$/i;

/**
 * A COMPARISON is a request: "movies like Creed" asks for neighbours, not for
 * Creed. Without this cue the phrase classified as a catalog lookup and the
 * top result — the reference title itself — opened as the destination. Titles
 * that genuinely contain "like" ("Like Water for Chocolate") are safe because
 * the exact-catalog-match rule in `resolveSearchDestination` runs FIRST and
 * evidence beats phrasing.
 */
const SIMILARITY = /\b(?:like|similar to|in the vein of|in the style of|reminds me of|same (?:feel|vibe|feeling) as|(?:newer|older) than|(?:more|less) [a-z]+ than)\b/i;

/**
 * Is this a recommendation request rather than a lookup?
 *
 * Deliberately conservative: when in doubt this returns false and the query
 * goes to the catalog, because a catalog search that finds nothing shows an
 * honest "no matches" and costs one more tap, whereas a wrong trip to the
 * Judge silently answers a question nobody asked.
 */
export function isRecommendationRequest(raw: string): boolean {
  const text = (raw ?? '').trim();
  if (!text) return false;
  if (LEADING_SOMETHING.test(text)) return true;
  if (REQUEST_VERBS.test(text)) return true;
  if (CONSTRAINT.test(text)) return true;
  if (QUESTION.test(text) && MEDIA_NOUN.test(text)) return true;
  if (SIMILARITY.test(text) && MEDIA_NOUN.test(text)) return true;
  if (COUNT_PREFIX.test(text) && MEDIA_NOUN.test(text)) return true;
  return false;
}

/**
 * SHORT ENOUGH TO PLAUSIBLY BE A TITLE.
 *
 * "Show Me a Hero" is a real HBO series that begins with a request phrase, and
 * no amount of extra keywords resolves that — the phrase genuinely is
 * ambiguous to a human too. So the ambiguity is settled with EVIDENCE instead:
 * a short query is looked up in the catalog even when it reads like a request,
 * and an exact title match wins. A long sentence is never a title, so it is
 * not worth the round trip.
 */
export function couldBeTitle(raw: string): boolean {
  const words = (raw ?? '').trim().split(/\s+/).filter(Boolean);
  return words.length > 0 && words.length <= 6;
}

export type SearchIntent = 'catalog' | 'ask';

/** The one classifier every search entry point uses. */
export function classifySearchIntent(raw: string): SearchIntent {
  return isRecommendationRequest(raw) ? 'ask' : 'catalog';
}

// ---------------------------------------------------------------------------
// Destinations
// ---------------------------------------------------------------------------

/** Matches the ask route's own `slice(0, 300)`, so what is sent is what is read. */
export const MAX_QUERY = 300;
export const ASK_ROUTE = '/app/ask';

export function askHref(raw: string): string | null {
  const q = (raw ?? '').trim().slice(0, MAX_QUERY);
  return q ? `${ASK_ROUTE}?q=${encodeURIComponent(q)}` : null;
}

/** The shape `/api/search` returns, reduced to what routing needs. */
export interface CatalogResult {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year?: number | null;
}

export function titleHref(r: CatalogResult): string {
  return `/app/title/${r.mediaType}/${r.id}`;
}

/**
 * Which result a query should open.
 *
 * AN EXACT TITLE BEATS EVERYTHING. TMDB orders by popularity, so a search for
 * a specific show routinely returns a more famous near-match first — the
 * "Gone" → "Gone Girl" problem `titleNormalize` was written for. If any result
 * IS the thing that was typed, that result wins regardless of its position.
 * Otherwise the top result stands, which is the honest best guess.
 */
export function pickResult(query: string, results: CatalogResult[]): CatalogResult | null {
  if (results.length === 0) return null;
  return results.find((r) => isExactTitle(query, r.title)) ?? results[0]!;
}

export interface Destination {
  href: string;
  /** Why we went there — surfaced in tests and useful when diagnosing a report. */
  reason: 'ask' | 'exact-title' | 'top-result' | 'no-results';
}

/**
 * The full decision, given a query and whatever the catalog returned.
 *
 * `results` may be empty because nothing matched OR because the caller chose
 * not to look; both end at the Judge, which is the only place left that can
 * still do something useful with the words. Returns null ONLY for an empty
 * query — submitting an empty box must never navigate, because losing the
 * screen you were on is the exact cost this control exists to avoid.
 */
export function resolveSearchDestination(raw: string, results: CatalogResult[] = []): Destination | null {
  const q = (raw ?? '').trim();
  if (!q) return null;

  // A GENERIC PHRASE NEVER NAVIGATES. "something good", "a movie", "newer",
  // "not that" and "the sequel" each opened an unrelated title page because
  // some film shares those literal words. A phrase whose every token is a
  // function word or a bare adjective names nothing — it is a request, and the
  // Judge is the only place that can do something useful with it. This runs
  // before the exact-match rule on purpose: for these queries an "exact"
  // catalog hit is a coincidence, not evidence.
  if (isGenericPhrase(q)) {
    return { href: askHref(q)!, reason: 'ask' };
  }

  // AN EXACT TITLE ALWAYS WINS, even when the words read like a request.
  // Checked before intent precisely because intent cannot settle "Show Me a
  // Hero" and a catalog hit can: if what was typed IS the name of something,
  // that is what was meant.
  //
  // A year beside the title disambiguates rather than defeating the match:
  // "Creed 2015" is an exact ask for the 2015 Creed, so the bare title is
  // compared and the stated year picks among the films that share it.
  const { title: bare, year } = splitTitleYear(q);
  const exact =
    results.find((r) => isExactTitle(q, r.title)) ??
    (year != null
      ? results.find((r) => isExactTitle(bare, r.title) && r.year === year) ??
        results.find((r) => isExactTitle(bare, r.title))
      : undefined);
  if (exact) return { href: titleHref(exact), reason: 'exact-title' };

  if (classifySearchIntent(q) === 'ask') {
    return { href: askHref(q)!, reason: 'ask' };
  }

  const pick = pickResult(q, results);
  if (!pick) return { href: askHref(q)!, reason: 'no-results' };

  return { href: titleHref(pick), reason: 'top-result' };
}
