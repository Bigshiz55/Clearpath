/**
 * Phase 2 — the normalized internal representation of a voice search.
 *
 * This is the shared vocabulary the whole evaluation framework speaks. It is a
 * *superset translation* of the three production parsers (naiveParseQuery, the
 * build-case detector cascade, and parseAskWithAI) into one shape, plus the
 * hard/soft-constraint distinction the evaluator turns on.
 *
 * It intentionally does NOT replace `FinderQuery` in production — it's the
 * lingua franca for generation → normalization → grading. The normalizer
 * (`eval/normalize/normalize.ts`) fills it from the real parsers; the generator
 * (`eval/generator`) fills the *intended* one as ground truth.
 */

/** Content categories. Only a subset is actually supported by WatchVerdict. */
export type ContentType =
  | 'movie'
  | 'tv'
  | 'episode'
  | 'live_tv'
  | 'sports'
  | 'documentary'
  // Unsupported today — present so the generator can test *rejection* behaviour.
  | 'book'
  | 'audiobook'
  | 'podcast'
  | 'music'
  | 'game';

/** What WatchVerdict can actually return today. Anything else must be rejected
 *  or clarified, never fabricated. Live TV, sports and documentaries are
 *  surfaced through movie/tv + the broadcast guide, so they are supported. */
export const SUPPORTED_CONTENT_TYPES: ReadonlySet<ContentType> = new Set<ContentType>([
  'movie',
  'tv',
  'episode',
  'live_tv',
  'sports',
  'documentary',
]);

export const UNSUPPORTED_CONTENT_TYPES: ReadonlySet<ContentType> = new Set<ContentType>([
  'book',
  'audiobook',
  'podcast',
  'music',
  'game',
]);

/** The high-level thing the user is trying to do. */
export type NormalizedIntent =
  | 'personalized_content_discovery' // "five Lifetime movies I'd like"
  | 'scheduled_broadcast_discovery' // "what's on tonight"
  | 'where_to_watch' // "where can I stream Barbie"
  | 'platform_browse' // "best movies on Netflix"
  | 'similar_to' // "something like Sherlock"
  | 'taste_building' // "I love X, avoid Y" (no find verb)
  | 'unsupported' // books/podcasts/etc.
  | 'unknown';

/** How availability was expressed. */
export type AvailabilityType =
  | 'scheduled_broadcast' // live TV within a time window
  | 'streaming' // on a subscription/service catalogue
  | 'any'
  | 'none';

export interface AvailabilityConstraint {
  type: AvailabilityType;
  /** Hours from "now" the window opens (0 = now). Null when not a time window. */
  startOffsetHours: number | null;
  /** Hours from "now" the window closes. Null when open-ended. */
  endOffsetHours: number | null;
  timezone: string; // "USER_TIMEZONE" placeholder or a real IANA zone
}

/** A soft directional preference over one of the 15 fingerprint axes, or a
 *  free-form mood/theme the engine may or may not model. `weight` 0..1. */
export interface SoftPreference {
  key: string; // dimension key (pacing, darkness, …) or a free-form mood tag
  /** 0..100 target on the axis, or null for a non-axis mood/theme. */
  target: number | null;
  weight: number;
  raw: string; // the phrase that produced it
}

export interface NormalizedQuery {
  rawQuery: string;
  normalizedIntent: NormalizedIntent;
  contentTypes: ContentType[];
  networks: string[]; // detectNetwork keys, e.g. "lifetime"
  platforms: { id: number; name: string }[]; // detectPlatform / TMDB provider ids
  genres: string[]; // TVmaze genre tags or FinderQuery genre names
  moods: SoftPreference[];
  themes: string[];
  excludedAttributes: string[]; // "supernatural", "science_fiction", "subtitles", …
  requestedCount: number | null;
  availability: AvailabilityConstraint;
  personalizationRequested: boolean;
  householdProfile: string | null; // a named co-watcher/household, or null
  watchTitle: string | null; // for where_to_watch / similar_to
  sortPriority: string[];
  ambiguities: string[]; // machine-detected contradictions/vagueness
  confidence: Record<string, number>; // per-field 0..1
}

export function emptyNormalized(rawQuery = ''): NormalizedQuery {
  return {
    rawQuery,
    normalizedIntent: 'unknown',
    contentTypes: [],
    networks: [],
    platforms: [],
    genres: [],
    moods: [],
    themes: [],
    excludedAttributes: [],
    requestedCount: null,
    availability: { type: 'any', startOffsetHours: null, endOffsetHours: null, timezone: 'USER_TIMEZONE' },
    personalizationRequested: false,
    householdProfile: null,
    watchTitle: null,
    sortPriority: ['constraint_satisfaction', 'personalized_match', 'availability_time'],
    ambiguities: [],
    confidence: {},
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Hard constraints vs soft preferences
// ───────────────────────────────────────────────────────────────────────────

/**
 * A HARD constraint invalidates any result that violates it. These are checked
 * BEFORE personalized ranking. Each generated case carries the hard constraints
 * its wording implies; Layer B independently verifies every returned title.
 */
export type HardConstraintKind =
  | 'content_type'
  | 'network'
  | 'platform'
  | 'time_window'
  | 'subscription_access'
  | 'language'
  | 'excluded_attribute'
  | 'no_duplicates'
  | 'max_count'
  | 'no_hallucination'
  | 'not_previously_watched'
  | 'not_previously_rejected';

export interface HardConstraint {
  kind: HardConstraintKind;
  /** Human description used in reports. */
  description: string;
  /** Constraint payload — shape depends on kind (network key, provider id, hours, attr…). */
  value?: unknown;
}

/** SOFT preferences affect ranking only; they never invalidate a result. */
export type SoftPreferenceKind =
  | 'taste_dna'
  | 'genre_pref'
  | 'mood'
  | 'similarity'
  | 'actor_director'
  | 'pacing'
  | 'tone'
  | 'household_compat'
  | 'novelty'
  | 'choose_confidence';

/**
 * The behavioural expectations attached to a generated case. The evaluator
 * grades against these rather than a single exact title (unless the fixture
 * makes one title objectively correct).
 */
export interface ExpectedBehavior {
  /** Intent the parser SHOULD land on. */
  intent: NormalizedIntent;
  /** Hard constraints every returned title must satisfy. */
  hardConstraints: HardConstraint[];
  /** The maximum number of results allowed (requestedCount, or null). */
  maxResults: number | null;
  /** IDs (`${mediaType}-${tmdbId}`) known-valid in the fixture, if enumerable. */
  validCandidateIds?: string[];
  /** The single objectively-correct top pick, when the fixture forces one. */
  idealTopId?: string;
  /** True when the correct behaviour is to ask ONE clarifying question. */
  expectsClarification?: boolean;
  /** True when the correct behaviour is an honest "no results" (or fewer). */
  expectsEmptyOrFewer?: boolean;
  /** True when the request is unsupported → reject/clarify, don't fabricate. */
  expectsRejection?: boolean;
  /** Contradictions the parser should surface as ambiguities. */
  expectedAmbiguities?: string[];
}

/** Compare two normalized fields for Layer A field-accuracy scoring. */
export function sameStringSet(a: string[], b: string[]): boolean {
  const sa = new Set(a.map((x) => x.toLowerCase()));
  const sb = new Set(b.map((x) => x.toLowerCase()));
  if (sa.size !== sb.size) return false;
  for (const x of sa) if (!sb.has(x)) return false;
  return true;
}
