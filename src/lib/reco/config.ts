/**
 * RECOMMENDATION ENGINE CONFIGURATION (pure, no I/O).
 *
 * Every tunable number in the funnel lives here, versioned, so that a ranking
 * change is a config change with an identifier that can be recorded against a
 * session — not a constant edited in six files. `RANKING_VERSION` is stored on
 * every session and is part of the cache key, so a weight change can never be
 * silently served from a cache built under the old weights.
 */

import { assignVariant } from './experiments';

export const RANKING_VERSION = 'rank-2026.07.1';
export const PARSER_VERSION = 'parse-2026.07.1';
export const EMBEDDING_VERSION = 'embed-2026.07.1';

// ------------------------------------------------------------- funnel -------

export interface StageTargets {
  /** Stage 1 — broad retrieval. */
  retrieveMin: number;
  retrieveMax: number;
  /** Stage 2 — after hard filters. */
  eligibleTarget: [number, number];
  /** Stage 3 — after fast scoring. */
  fastRanked: number;
  /** Stage 4 — after deep ranking. */
  deepRanked: number;
  /** Stage 5 — after diversification. */
  semifinalists: number;
}

export const FUNNEL: StageTargets = {
  retrieveMin: 2_500,
  retrieveMax: 5_000,
  eligibleTarget: [750, 1_500],
  fastRanked: 400,
  deepRanked: 100,
  semifinalists: 30,
};

/**
 * Per-channel retrieval caps. No single channel may fill the pool: the sum
 * deliberately exceeds `retrieveMax` because channels overlap heavily after
 * de-duplication, and because a channel that returns nothing must not shrink
 * the pool below target.
 */
export const CHANNEL_CAPS = {
  semantic: 1_500,
  fullText: 800,
  referenceTitle: 600,
  watchDna: 600,
  collaborative: 500,
  metadata: 400,
  qualityFallback: 300,
  discovery: 300,
} as const;

export type ChannelName = keyof typeof CHANNEL_CAPS;
export const CHANNEL_NAMES = Object.keys(CHANNEL_CAPS) as ChannelName[];

/** No channel may contribute more than this share of the final pool. */
export const MAX_CHANNEL_SHARE = 0.45;

// ------------------------------------------------------------ scoring -------

export interface FastWeights {
  semantic: number;
  fullText: number;
  watchDna: number;
  tonight: number;
  referenceTitle: number;
  availabilityConfidence: number;
  qualityConfidence: number;
  novelty: number;
}

/** Starting point, explicitly not a final formula — tuned by evaluation. */
export const FAST_WEIGHTS: FastWeights = {
  semantic: 0.24,
  fullText: 0.08,
  watchDna: 0.22,
  tonight: 0.16,
  referenceTitle: 0.10,
  availabilityConfidence: 0.07,
  qualityConfidence: 0.07,
  novelty: 0.06,
};

export const PENALTIES = {
  /** Multiplied by the matched negative-preference weight. */
  negativePreference: 0.35,
  /** Same franchise already present in the working set. */
  franchiseRepeat: 0.20,
  /** Already watched by a member (when not hard-excluded). */
  watched: 0.30,
} as const;

// -------------------------------------------------------- group scoring -----

export interface GroupWeights {
  /** Weight on the room's mean member fit. */
  mean: number;
  /** Weight on the WORST-served member. Protects the person who fits least. */
  floor: number;
  /** Subtracted per unit of disagreement between members. */
  disagreementPenalty: number;
}

/**
 * Floor-weighted, matching the household model already shipped: a title that
 * one member is predicted to strongly dislike cannot be rescued by another
 * member loving it.
 */
export const GROUP_WEIGHTS: GroupWeights = {
  mean: 0.5,
  floor: 0.5,
  disagreementPenalty: 0.15,
};

/** Below this predicted member fit, a title is flagged as a severe mismatch. */
export const SEVERE_MISMATCH = 0.35;

// ------------------------------------------------------ diversification -----

export const DIVERSITY = {
  /** Maximal-marginal-relevance trade-off: 1 = pure relevance, 0 = pure variety. */
  lambda: 0.7,
  /** At most this many titles from one franchise in the final court. */
  maxPerFranchise: 1,
  /** At most this many sharing a lead performer. */
  maxPerLeadPerformer: 2,
  /** At most this share of the court from any single primary genre. */
  maxGenreShare: 0.4,
  /** At most this share from any single release decade. */
  maxDecadeShare: 0.5,
} as const;

// ------------------------------------------------------------- budgets ------

/** p95 latency budgets in milliseconds, asserted by the performance suite. */
export const BUDGETS_MS = {
  parse: 1_500,
  retrieve: 1_000,
  filter: 500,
  fastRank: 1_000,
  deepRank: 2_000,
  assemble: 750,
  warmTotal: 3_000,
  coldTotal: 6_000,
} as const;

export type StageName = keyof typeof BUDGETS_MS;

// -------------------------------------------------------------- flags -------

export type EngineMode = 'legacy' | 'hybrid' | 'shadow';

/**
 * Rollout is explicit and recorded. `shadow` runs the new engine for
 * measurement while the user still sees the legacy result, so a comparison
 * never changes what anyone is shown.
 */
export function engineMode(env: Record<string, string | undefined>): EngineMode {
  const raw = env.RECO_ENGINE_MODE;
  return raw === 'hybrid' || raw === 'shadow' ? raw : 'legacy';
}

/**
 * Deterministic percentage rollout, expressed as a two-variant experiment so
 * that rollout and A/B assignment share one implementation (and one hash) —
 * `assignVariant` already guarantees stability across requests and sessions.
 */
export function inRollout(userKey: string, percent: number): boolean {
  if (percent <= 0) return false;
  if (percent >= 100) return true;
  return assignVariant(userKey, 'reco-hybrid-rollout', [
    { id: 'on', weight: percent },
    { id: 'off', weight: 100 - percent },
  ]) === 'on';
}
