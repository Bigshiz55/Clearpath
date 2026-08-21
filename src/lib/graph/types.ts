/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE WATCHVERDICT GRAPH VOCABULARY — Phase 1 of graph-native WatchVerd1ct.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Nothing important in WatchVerd1ct should exist as an isolated number,
 * string, claim, or recommendation if the system can instead represent what
 * it means, where it came from, what it relates to, and what downstream
 * decisions it influenced. This module is that representation's TYPE
 * vocabulary: nodes, edges, provenance, confidence, persistence, temporal
 * validity, and the decision run.
 *
 * TWO RULES THE TYPES ENCODE, because production violated both:
 *
 * 1. PERSISTENCE IS PART OF MEANING. "I hate slow movies" (durable) and
 *    "something fast tonight" (request_only) must never be confusable — the
 *    live defect where "a boxing movie" became a fabricated loved-title
 *    rating was exactly this confusion. Every evidence-bearing edge carries
 *    a `Persistence`.
 *
 * 2. ABSENCE OF EVIDENCE IS NOT EVIDENCE OF ABSENCE. Unknown is a state,
 *    never a default of "no"/"not available"/"not gory". `EvidenceState`
 *    makes unknown/stale/contradicted first-class instead of silently
 *    collapsing them into confirmed or absent.
 *
 * GRAPH-NATIVE ≠ GRAPH DATABASE. These types are storage-agnostic; Phase 2
 * persists decision runs as jsonb rows in Postgres (see decisionRun store),
 * and later phases may add relational projections. The model owns the
 * semantics; infrastructure follows.
 *
 * Pure types + tiny pure helpers. No I/O.
 */

/** Where a fact came from — never optional on evidence that will be acted on. */
export type EvidenceSource =
  | 'user_statement' // the user said it in words
  | 'user_action' // FOR/AGAINST/save/rating/choice — behavior, not words
  | 'inference' // derived from behavior by our own logic
  | 'classifier' // model-derived (LLM/ML) — never indistinguishable from fact
  | 'deterministic_rule' // computed by pure product rules
  | 'external:tmdb'
  | 'external:tvmaze'
  | 'imported' // brought in from another service's history
  | 'calculated'; // arithmetic over other evidence (scores, blends)

/**
 * How long a piece of evidence is allowed to matter. `request_only` evidence
 * dies with its decision run; writing it anywhere durable is invariant
 * INV-2's violation.
 */
export type Persistence = 'durable' | 'session' | 'request_only';

/** The believability state of a claim. Unknown is not "no". */
export type EvidenceState = 'confirmed' | 'contradicted' | 'unknown' | 'stale';

export interface Provenance {
  source: EvidenceSource;
  /** ISO timestamp of observation — when we learned it, not when it was true. */
  observedAt: string;
  /** 0..1 where meaningful; null when the source doesn't grade itself. */
  confidence?: number | null;
  /** The decision run that produced this evidence, when one did. */
  runId?: string;
}

/** Temporal validity for facts that age (availability, airings, moods). */
export interface Validity {
  validFrom?: string;
  /** null/absent = no known expiry; a KNOWN expiry must be honored. */
  validUntil?: string | null;
}

/**
 * Node references are STRINGLY-TYPED ON PURPOSE for the jsonb-first phase —
 * stable, greppable, storage-agnostic. The closed constructors below are the
 * only sanctioned shapes, so identity stays canonical (one title, one ref).
 */
export type NodeRef = string;

export const nodeRef = {
  run: (): NodeRef => 'run',
  request: (): NodeRef => 'request',
  user: (): NodeRef => 'user',
  results: (): NodeRef => 'results',
  title: (mediaType: 'movie' | 'tv', id: number): NodeRef => `title:${mediaType}:${id}`,
  candidate: (mediaType: 'movie' | 'tv', id: number): NodeRef => `candidate:${mediaType}:${id}`,
  tasteAxis: (axis: string): NodeRef => `taste:${axis}`,
  subject: (term: string): NodeRef => `subject:${term.toLowerCase()}`,
  genre: (id: number): NodeRef => `genre:${id}`,
  person: (id: number): NodeRef => `person:${id}`,
} as const;

/**
 * The closed predicate set. Grows deliberately, one review at a time — a
 * free-string predicate field is how "graph" degrades back into a log line.
 */
export type EdgePredicate =
  // ── what the utterance IS ────────────────────────────────────────────────
  | 'classified_as' // request | taste | airing | platform | where_to_watch | clarify | lookup
  | 'routed_to' // the destination href/surface the decision chose
  // ── what the request REQUIRES (hard edges; INV-1 tracks these) ──────────
  | 'requires_subject'
  | 'requires_media'
  | 'requires_count'
  | 'requires_genre'
  | 'excludes_genre'
  | 'excludes_documentaries'
  | 'wants_tone'
  | 'excludes_tone'
  | 'max_runtime'
  // ── how each candidate fared ────────────────────────────────────────────
  | 'satisfies'
  | 'violates'
  | 'rejected'
  | 'scored'
  | 'returned'
  // ── availability/airing claims (INV-4: source + observation time) ───────
  | 'available_on'
  | 'airs_on'
  // ── what the run WROTE (INV-2 tracks these against persistence) ─────────
  | 'wrote_taste'
  | 'seeded_title'
  // ── statements ──────────────────────────────────────────────────────────
  | 'acknowledged';

export interface DecisionEdge {
  subject: NodeRef;
  predicate: EdgePredicate;
  /** A NodeRef or a scalar rendered to string ('boxing', 'movie', '3', '87'). */
  object: string;
  /** Free evidence detail — rejection reason, score parts, evidence text. */
  detail?: Record<string, unknown>;
  provenance?: Provenance;
}

/** The entry points that may open a decision run. */
export type EntryPoint =
  | 'build-case'
  | 'ask'
  | 'search'
  | 'finder'
  | 'watch-now'
  | 'tv'
  | 'browse'
  // Phase 8 — group and ephemeral decision surfaces (INV-9 applies).
  | 'court'
  | 'verdict'
  | 'subscriptions';

/**
 * A DECISION RUN — one user-triggered decision, its constraints, candidates,
 * outcomes and writes, connected. This is execution evidence, captured from
 * the state the route actually computed — never reconstructed afterwards.
 */
export interface DecisionRun {
  id: string;
  entryPoint: EntryPoint;
  /** The raw utterance, verbatim (INV-6: it must survive to the end). */
  rawText: string;
  /** The run's one-line understanding, for humans scanning a list. */
  intent: {
    kind: string;
    persistence: Persistence;
  };
  edges: DecisionEdge[];
  createdAt: string;
}

// ── Tiny pure helpers ──────────────────────────────────────────────────────

export function edgesBy(run: DecisionRun, predicate: EdgePredicate): DecisionEdge[] {
  return run.edges.filter((e) => e.predicate === predicate);
}

export function edgesFrom(run: DecisionRun, subject: NodeRef): DecisionEdge[] {
  return run.edges.filter((e) => e.subject === subject);
}

/** Every hard requirement the request stated (the INV-1 obligation set). */
export function hardRequirements(run: DecisionRun): DecisionEdge[] {
  return run.edges.filter((e) =>
    e.predicate === 'requires_subject' ||
    e.predicate === 'requires_media' ||
    e.predicate === 'requires_genre' ||
    e.predicate === 'excludes_genre' ||
    e.predicate === 'requires_count' ||
    e.predicate === 'max_runtime',
  );
}
