/**
 * SEARCH MODE ROUTER (pure). The "Gone on BritBox" failure happened because a
 * title-plus-provider query was routed into recommendation/similarity search.
 * This classifier decides, deterministically and BEFORE any I/O, which of the
 * five search modes a query is, and extracts the title, the required provider
 * (as a HARD filter unless softened by "preferably/ideally/if available"), and
 * the content type. It never guesses similarity for a plain title lookup.
 *
 *   A exact_title       "Gone on BritBox", "Find Gone", "Is Gone on BritBox?"
 *   B person            "movies starring Tom Hanks", "directed by Nolan"
 *   C provider_catalog  "crime dramas on BritBox"  (genre/topic + provider, no title)
 *   D forensic          "something like Gone but less dark", constraint discovery
 *   E similar_to        "shows like Gone on BritBox"  (explicit similarity cue)
 *
 * No I/O; unit-tested. Provider resolution reuses the shared detectors.
 */
import { detectPlatform, detectNetwork, detectGenre } from '@/lib/nlu/detectors';
import { naiveParseQuery } from '@/lib/finderParse';

export type SearchMode = 'exact_title' | 'person' | 'provider_catalog' | 'forensic' | 'similar_to';

export interface RequiredProvider {
  key: string; // 'britbox', 'netflix', 'hallmark' …
  name: string; // 'BritBox'
  kind: 'platform' | 'network';
  id?: number; // TMDB provider id for platforms
}

export interface SearchClassification {
  mode: SearchMode;
  requestedTitle: string | null;
  requiredProvider: RequiredProvider | null;
  /** hard = must be on that service; soft = preference only. null = none named. */
  providerStrength: 'hard' | 'soft' | null;
  contentType: 'movie' | 'tv' | 'unknown';
  reference: string | null; // populated for similar_to
  /**
   * A year the user typed ALONGSIDE the title ("Creed 2015", "Dune 2021").
   *
   * It is a disambiguator, never part of the name: left inside the title the
   * catalog searched for the literal string "Creed 2015" and returned nothing,
   * so adding the one detail that identifies which Creed you meant made the
   * search strictly worse.
   */
  year: number | null;
  ambiguities: string[];
}

const SIMILARITY_CUE = /\b(like|similar to|reminds me of|in the vein of|along the lines of|kinda like|sort of like|-like\b|in the style of)\b/i;
const SOFT_PROVIDER_CUE = /\b(preferably|ideally|if available|if possible|if it'?s on|hopefully)\b/i;
const PERSON_CUE = /\b(starring|directed by|films? of|movies? with|with actor|cast of|filmography)\b/i;

// Leading request verbs to strip when isolating the bare title.
const LEAD_VERBS =
  /^\s*(?:please\s+)?(?:can (?:i|we|you)\s+(?:watch|find|see|get)|where can i (?:watch|find|stream)|is|are|find(?: me)?|show (?:me|us)|search (?:for)?|look up|look for|get me|play|watch|i (?:want|wanna|would like) to (?:watch|see)|i (?:want|wanna)|stream)\s+/i;

// Provider phrase to strip from the title span. Two-word services are collapsed
// up front so "Brit Box"/"Apple TV" normalize before detection.
function collapseProviderSpelling(text: string): string {
  return text
    .replace(/\bbrit\s+box\b/gi, 'britbox')
    .replace(/\bapple\s+tv\s*\+?/gi, 'appletv')
    .replace(/\bparamount\s+plus\b/gi, 'paramount+')
    .replace(/\bdisney\s+plus\b/gi, 'disney+')
    .replace(/\bprime\s+video\b/gi, 'prime');
}

const PROVIDER_PREP = /\b(?:available\s+on|streaming\s+on|watch\s+on|on|from|via|in)\s+/i;

const CONTENT_TYPE_WORDS = /\b(tv series|tv show|television series|mini-?series|movie|film|flick|feature|series|show)\b/i;

/** Extract + strip the provider, returning the residual text and the provider. */
function extractProvider(raw: string): { provider: RequiredProvider | null; residual: string } {
  const collapsed = collapseProviderSpelling(raw);
  // For DETECTION only, normalize the provider preposition to "on" — the shared
  // detector resolves bare aliases (disney/prime/max/apple/paramount) only after
  // "on", so "Severance from Disney+" would otherwise miss. Title extraction
  // below still uses the original `collapsed`, so titles are untouched.
  const forDetect = collapsed.replace(/\b(?:available on|streaming on|watch on|from|via)\s+/gi, 'on ');
  const platform = detectPlatform(forDetect);
  const network = !platform ? detectNetwork(forDetect) : null;
  const provider: RequiredProvider | null = platform
    ? { key: platform.name.toLowerCase().replace(/[^a-z0-9]+/g, ''), name: platform.name, kind: 'platform', id: platform.id }
    : network
      ? { key: network.key, name: network.name, kind: 'network' }
      : null;

  let residual = collapsed;
  if (provider) {
    // Remove "on/from <provider tokens>" and any bare provider token left over.
    const provWords = provider.name.toLowerCase().replace(/[^a-z0-9+ ]+/g, '').split(/\s+/).filter(Boolean);
    const provAlt = `(?:${[provider.key, ...provWords, provider.name.toLowerCase().replace(/\s+/g, '')].map((w) => w.replace(/[+]/g, '\\+')).join('|')})`;
    residual = residual
      .replace(new RegExp(PROVIDER_PREP.source + provAlt + '(\\s*\\+)?', 'i'), ' ')
      .replace(new RegExp('\\b' + provAlt + '\\b', 'i'), ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return { provider, residual };
}

/** Isolate the requested title from the residual (post-provider) text. */
/**
 * The media type the ask states OUTRIGHT, or null when it does not say.
 *
 * A "more like X" request took its type from whatever the seed title happened
 * to be, so "a boxing movie kinda like Rocky" could read back as "Shows". What
 * the user typed is not a guess and outranks an inference.
 */
export function statedMediaType(
  text: string,
  cls?: { contentType: 'movie' | 'tv' | 'unknown' } | null,
): 'movie' | 'tv' | null {
  const parsed = naiveParseQuery(text).mediaType;
  if (parsed === 'movie' || parsed === 'tv') return parsed;
  if (cls?.contentType === 'movie' || cls?.contentType === 'tv') return cls.contentType;
  return null;
}

function extractTitle(residual: string): { title: string | null; contentType: 'movie' | 'tv' | 'unknown'; year: number | null } {
  let t = residual.replace(LEAD_VERBS, '');
  let contentType: 'movie' | 'tv' | 'unknown' = 'unknown';
  // A bare 4-digit year sitting beside the title is a disambiguator. Only
  // stripped when something is LEFT — "1917" and "2012" are films, and a query
  // that is nothing but a year is that film's name.
  let year: number | null = null;
  const ym = t.match(/(?:^|\s)\(?((?:19|20)\d{2})\)?(?=\s|$)/);
  if (ym) {
    const without = (t.slice(0, ym.index) + ' ' + t.slice(ym.index! + ym[0].length)).replace(/\s+/g, ' ').trim();
    if (without.length >= 2) { year = Number(ym[1]); t = without; }
  }
  const ctm = t.match(CONTENT_TYPE_WORDS);
  if (ctm) {
    const w = ctm[0].toLowerCase();
    contentType = /movie|film|flick|feature/.test(w) ? 'movie' : 'tv';
    t = t.replace(CONTENT_TYPE_WORDS, ' ');
  }
  t = t.replace(/[?!.]+$/g, '').replace(/\s+/g, ' ').trim();
  // Drop a dangling leading article ONLY for length checks; keep for matching.
  return { title: t.length >= 1 ? t : null, contentType, year };
}

/** Classify a raw query into a search mode + structured fields. Pure. */
export function classifySearch(raw: string): SearchClassification {
  const text = (raw ?? '').slice(0, 300);
  const ambiguities: string[] = [];
  const { provider, residual } = extractProvider(text);
  const providerStrength = provider ? (SOFT_PROVIDER_CUE.test(text) ? 'soft' : 'hard') : null;

  const hasSimilarity = SIMILARITY_CUE.test(text);
  const hasPerson = PERSON_CUE.test(text);
  const genre = detectGenre(residual);
  const { title, contentType, year } = extractTitle(residual);

  // E) Explicit similarity always wins ("shows like Gone on BritBox").
  if (hasSimilarity) {
    // Reference is what follows the similarity cue, minus the provider (already
    // stripped from `residual`). Reuse the title extraction on the residual.
    const ref = title;
    return { mode: 'similar_to', requestedTitle: null, requiredProvider: provider, providerStrength, contentType, reference: ref, year, ambiguities };
  }

  // B) Person/credit search.
  if (hasPerson) {
    return { mode: 'person', requestedTitle: title, requiredProvider: provider, providerStrength, contentType, reference: null, year, ambiguities };
  }

  // C) Provider catalog: a genre/topic + a provider but NO plausible title token
  // left (e.g. "crime dramas on BritBox" → residual is just "crime dramas").
  const residualIsJustGenre = genre != null && (!title || isGenreOnly(title));
  if (provider && residualIsJustGenre) {
    return { mode: 'provider_catalog', requestedTitle: null, requiredProvider: provider, providerStrength, contentType, reference: null, year, ambiguities };
  }

  // D) Forensic discovery: constraint language without a clear single title.
  if (!title || isConstraintPhrase(text)) {
    return { mode: 'forensic', requestedTitle: null, requiredProvider: provider, providerStrength, contentType, reference: null, year, ambiguities };
  }

  // A) Default for a title(+provider) query → EXACT TITLE LOOKUP.
  return { mode: 'exact_title', requestedTitle: title, requiredProvider: provider, providerStrength, contentType, reference: null, year, ambiguities };
}

const GENRE_WORDS = new Set([
  'crime', 'crimes', 'mystery', 'mysteries', 'thriller', 'thrillers', 'comedy', 'comedies',
  'romance', 'romances', 'romantic', 'horror', 'horrors', 'documentary', 'documentaries', 'doc', 'docs',
  'detective', 'detectives', 'action', 'drama', 'dramas', 'family', 'kids', 'scifi', 'sci-fi',
  'fantasy', 'western', 'westerns', 'anime', 'reality', 'sport', 'sports', 'noir', 'procedural', 'procedurals',
  // media-type words are also "no title" signals in a catalog ask
  'movie', 'movies', 'show', 'shows', 'series', 'film', 'films', 'sitcom', 'sitcoms',
]);
/** True when EVERY word is a genre/media word (i.e. no title token present). */
function isGenreOnly(t: string): boolean {
  const words = t.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return words.length > 0 && words.every((w) => GENRE_WORDS.has(w));
}

const CONSTRAINT_CUE = /\b(something|anything|surprise me|recommend|in the mood|under \d|over \d|less than|more than|but (?:less|more|not)|not too|a bit more|feel good|feel-good|to watch tonight|to binge|bingeable)\b/i;
function isConstraintPhrase(text: string): boolean { return CONSTRAINT_CUE.test(text); }
