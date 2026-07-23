/**
 * Shared contract for the multi-stage AI Retrieval Pipeline. PURE types only —
 * no I/O. The pipeline's guarantee: a search NEVER terminates in a bare
 * "No results" state. When confident candidates are missing, the result carries
 * honest interpretations + useful suggestions instead (never fabricated titles).
 */

export type IntentKind =
  | 'title_lookup'   // "the matrix", "watch inception"
  | 'similar_to'     // "movies like Rocky"
  | 'actor'          // "films with Tom Hanks"
  | 'franchise'      // "star wars movies"
  | 'genre'          // "a good horror movie"
  | 'availability'   // "where can I watch Dune"
  | 'schedule'       // "what's on tonight"
  | 'upcoming'       // "movies coming out soon"
  | 'recommendation' // "recommend me something"
  | 'incomplete'     // "movies with the guy from…"
  | 'conversational' // "hey, I'm bored, ideas?"
  | 'unknown';

export interface DetectedEntities {
  title: string | null;
  person: string | null;
  franchise: string | null;
  genre: string | null;
  network: string | null;
  platform: string | null;
  count: number | null;
  horizonMonths: number | null;
}

export interface Intent {
  kind: IntentKind;
  /** Secondary intents worth trying (the request may be several things at once). */
  also: IntentKind[];
  entities: DetectedEntities;
  /** The user typed a fragment / trailing preposition and stopped. */
  incomplete: boolean;
  /** Casual/conversational phrasing rather than a query ("ugh find me something"). */
  conversational: boolean;
  /** An implied search with no explicit query verb ("bored tonight"). */
  implied: boolean;
  /** 0..1 — how confident we are in the top intent. */
  confidence: number;
}

export type ExpansionKind =
  | 'original' | 'normalized' | 'spelling' | 'plural' | 'singular'
  | 'franchise' | 'alias' | 'abbreviation' | 'semantic' | 'wording' | 'alt_title';

export interface Expansion {
  query: string;
  kind: ExpansionKind;
  /** 0..1 — how close this rewrite is to the user's literal input. */
  weight: number;
}

export type SourceName =
  | 'tmdb' | 'internal_index' | 'embeddings' | 'fuzzy_title'
  | 'alias' | 'streaming_providers' | 'live_tv' | 'trending';

export interface Candidate {
  id: string;                 // stable id (e.g. "movie:603")
  title: string;
  year: number | null;
  mediaType: 'movie' | 'tv' | 'person' | 'unknown';
  source: SourceName;
  /** Raw source relevance if the source provides one (0..1), else null. */
  sourceScore: number | null;
  /** Which expansion produced this hit (for the Search Lab log). */
  viaQuery: string;
}

export interface ScoredCandidate extends Candidate {
  confidence: number;         // 0..1, from the confidence engine
  confidenceBand: 'high' | 'medium' | 'low';
  reasons: string[];
}

export interface Interpretation {
  /** A plain-language reading of what the user might have meant. */
  label: string;
  intent: IntentKind;
  /** A concrete query the UI can re-run for this interpretation. */
  query: string;
}

export interface Suggestion {
  kind: 'refine' | 'did_you_mean' | 'browse' | 'broaden' | 'clarify';
  label: string;
  /** Optional machine-actionable payload (a query string, a route, etc.). */
  action?: string;
}

export interface RecoveryResult {
  interpretations: Interpretation[];
  suggestions: Suggestion[];
  /** At most ONE clarifying question, and only when genuinely necessary. */
  clarifyingQuestion: string | null;
  message: string;
}

export type RetrievalOutcome = 'confident' | 'ambiguous' | 'recovery';

export interface RetrievalResult {
  outcome: RetrievalOutcome;
  intent: Intent;
  expansions: Expansion[];
  /** Confident results, best-first. May be empty — but then `recovery` is populated. */
  results: ScoredCandidate[];
  /** ALWAYS populated when `results` is empty; never a dead end. */
  recovery: RecoveryResult | null;
  /** Everything the Search Lab needs to log this search. */
  telemetry: SearchTelemetry;
}

export interface SearchTelemetry {
  originalQuery: string;
  rewrittenQueries: string[];
  candidateCount: number;
  topConfidence: number;
  outcome: RetrievalOutcome;
  intentKind: IntentKind;
  sourcesQueried: SourceName[];
  sourcesUnavailable: SourceName[];
}
