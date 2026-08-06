import { isExactTitle } from '@/lib/nlu/titleNormalize';
import { splitTitleQualifiers, isGenericPhrase } from '@/lib/nlu/queryRepair';
import { GENRE_WORDS, SUBJECT_TERMS } from '@/lib/finderParse';
import { resolveSource } from '@/lib/nlu/mediaOntology';
import { genreLabel } from '@/lib/finderGenres';

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
  // A PLURAL media noun beside a genre/subject word or a linking preposition
  // is browsing, not naming: "British detective shows", "movies with Tom
  // Hanks on Peacock". Plural is the load-bearing part — "Scary Movie" names
  // one thing; "scary movies" asks for several. And a leading superlative
  // over a vocabulary word ("best horror on Netflix") is a ranking request,
  // never a title.
  const lower = ` ${text.toLowerCase()} `;
  const hasVocab =
    Object.keys(GENRE_WORDS).some((g) => lower.includes(` ${g} `) || lower.includes(` ${g}s `)) ||
    SUBJECT_TERMS.some((s) => lower.includes(` ${s} `));
  if (/\b(movies|films|shows|series|documentaries)\b/i.test(text) && text.split(/\s+/).length >= 3) {
    if (hasVocab || /\b(with|starring|featuring|on|from|about)\b/i.test(text) || /\b(?:can|to)\s+watch\b/i.test(text)) {
      return true;
    }
  }
  if (/^\s*(best|top)\b/i.test(text) && text.split(/\s+/).length >= 3 && hasVocab) return true;
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

// ---------------------------------------------------------------------------
// Lexical intents — the search the UI promises: genre, subject, provider,
// network. A BARE vocabulary word is a browse request for that thing, never a
// coincidental title lookup ("crime" must not open a film that happens to be
// called Crime). Multi-word sentences fall through to the normal pipeline.
// ---------------------------------------------------------------------------

export type LexicalIntent =
  | { kind: 'genre'; label: string; genreId: number }
  | { kind: 'subject'; label: string }
  | { kind: 'provider'; label: string; providerId: number }
  | { kind: 'network'; label: string; packHref: string | null };

/** Networks with a dedicated Pack — a bare network search goes straight there. */
const NETWORK_PACKS: Record<string, string> = {
  hallmark: '/packs/hallmark-universe',
  lifetime: '/packs/lifetime-vault',
  lmn: '/packs/lifetime-vault',
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9+' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Singular form for plural genre words: comedies→comedy, thrillers→thriller. */
function singular(w: string): string {
  if (w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

export function lexicalIntent(raw: string): LexicalIntent | null {
  const q = norm(raw ?? '');
  if (!q || q.split(' ').length > 3) return null;

  // Provider / network — the WHOLE query must be one of the source's aliases
  // ("Hulu", "acorn tv", "paramount plus"), so "Hulu original movies" still
  // reads as a sentence, not a bare source.
  const src = resolveSource(q);
  if (src && src.aliases.some((a) => a === q)) {
    if (src.sourceType === 'streaming_provider' && src.providerId != null) {
      return { kind: 'provider', label: src.canonicalName, providerId: src.providerId };
    }
    return { kind: 'network', label: src.canonicalName, packHref: NETWORK_PACKS[src.networkKey ?? ''] ?? null };
  }

  // Genre — single word or known alias, singular or plural. Normalisation
  // turned hyphens into spaces, so "sci-fi" must be looked up hyphen-joined
  // too or the most common genre spelling silently misses.
  const variants = [q, singular(q), q.replace(/ /g, '-'), singular(q).replace(/ /g, '-')];
  const genreId = variants.map((v) => GENRE_WORDS[v]).find((g) => g != null);
  if (genreId != null && q.split(' ').length <= 2) {
    return { kind: 'genre', label: genreLabel(genreId), genreId };
  }

  // Subject — the stated-subject vocabulary ("boxing", "heist", "serial killer").
  const subj = SUBJECT_TERMS.find((t2) => variants.includes(t2));
  if (subj) return { kind: 'subject', label: subj };

  return null;
}

export interface Destination {
  href: string;
  /** Why we went there — surfaced in tests and useful when diagnosing a report. */
  reason: 'ask' | 'exact-title' | 'top-result' | 'no-results' | 'genre' | 'subject' | 'provider' | 'network';
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

  // A BARE GENRE / SUBJECT / PROVIDER / NETWORK WORD is a browse request for
  // that thing — checked before the exact-title rule on purpose: someone who
  // types "crime" wants crime, not a film that happens to be titled Crime.
  // Titles that merely CONTAIN these words ("Crime Story", "Hulu who?") are
  // multi-word and fall through untouched, as does every qualified query
  // ("Crime 2021" still names the specific film).
  const lex = lexicalIntent(q);
  if (lex) {
    const href = lex.kind === 'network' && lex.packHref ? lex.packHref : askHref(q)!;
    return { href, reason: lex.kind };
  }

  // AN EXACT TITLE ALWAYS WINS, even when the words read like a request.
  // Checked before intent precisely because intent cannot settle "Show Me a
  // Hero" and a catalog hit can: if what was typed IS the name of something,
  // that is what was meant.
  //
  // A year beside the title disambiguates rather than defeating the match:
  // "Creed 2015" is an exact ask for the 2015 Creed, so the bare title is
  // compared and the stated year picks among the films that share it.
  // Qualifiers and years are instructions: "Fargo the series" compares the
  // bare title and prefers the stated media type; "Creed 2015" prefers the
  // stated year (±1 — festival vs wide-release conventions differ by one, and
  // a user who knows the film should not lose the match for knowing it by its
  // premiere year).
  const { title: bare, year, mediaType, qualified } = splitTitleQualifiers(q);
  const bareExact = (extra: (r: CatalogResult) => boolean) =>
    results.find((r) => isExactTitle(bare, r.title) && extra(r));
  const exact =
    results.find((r) => isExactTitle(q, r.title)) ??
    (qualified
      ? bareExact((r) => (mediaType == null || r.mediaType === mediaType) && (year == null || r.year === year)) ??
        bareExact((r) => (mediaType == null || r.mediaType === mediaType) && year != null && r.year != null && Math.abs(r.year - year) === 1) ??
        bareExact((r) => mediaType == null || r.mediaType === mediaType) ??
        bareExact(() => true)
      : undefined);
  if (exact) return { href: titleHref(exact), reason: 'exact-title' };

  if (classifySearchIntent(q) === 'ask') {
    return { href: askHref(q)!, reason: 'ask' };
  }

  const pick = pickResult(q, results);
  if (!pick) return { href: askHref(q)!, reason: 'no-results' };

  return { href: titleHref(pick), reason: 'top-result' };
}
