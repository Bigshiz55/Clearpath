/**
 * THE SHARED RESULT CONTRACT.
 *
 * One shape for every multi-result query in the product — schedule or catalog.
 * Two rules it exists to enforce:
 *
 *   1. `results` is ALWAYS an array. Never "an object or an array depending".
 *      A caller can never accidentally render one item because the shape was
 *      ambiguous.
 *   2. Counts are explicit and separate. `totalAvailable` (what exists),
 *      `totalReturned` (what is in this payload) and `pageSize` are different
 *      numbers, so "we showed 12 of 340" is representable and a thin result is
 *      never mistaken for a complete one.
 *
 * A highlighted top pick is an INDEX into `results`, never a separate field
 * holding the item — highlighting cannot shorten the list if the list is the
 * only place the item lives.
 */
import type { SourceStatus } from './status';
import { combineStatus, isFailure, statusMessage } from './status';

export type QueryType =
  | 'live_schedule'
  | 'channel_schedule'
  | 'provider_catalog'
  | 'genre_discovery'
  | 'group_slate'
  | 'broad_discovery';

export type RankingMethod =
  | 'chronological'
  | 'best_match'
  | 'highest_rated'
  | 'newest'
  | 'popularity'
  | 'group_dna';

/** One stage of a pipeline, with what it removed and why. */
export interface StageCount {
  stage: string;
  /** Records entering this stage. */
  in: number;
  /** Records leaving this stage. */
  out: number;
  /** The rule responsible, named plainly. Required when the stage drops rows. */
  rule?: string;
}

export interface SourceReport {
  sourceId: string;
  status: SourceStatus;
  /** Rows the source handed us before any of our own processing. */
  rawCount: number;
  errorCode?: string;
  /** Never contains credentials — adapters are responsible for scrubbing. */
  errorMessage?: string;
  fetchedAt?: string;
  /** For cached reads: when the cached copy was originally fetched. */
  cachedAt?: string;
}

export interface ResultSet<T> {
  queryType: QueryType;
  /** Everything that survived availability filtering, before pagination. */
  totalAvailable: number;
  /** Length of `results`. Always equals `results.length`. */
  totalReturned: number;
  /** This page's requested size, so a client can ask for the next one. */
  pageSize: number;
  /** Offset of `results[0]` within the available set. */
  offset: number;
  /** True when `totalAvailable > offset + totalReturned`. */
  hasMore: boolean;
  results: T[];
  /** Index into `results` of the highlighted pick, or null. Never removes it. */
  topPickIndex: number | null;
  rankingMethod: RankingMethod;
  status: SourceStatus;
  /** Human-readable state, or null when everything is fine and non-empty. */
  statusMessage: string | null;
  /** True when a non-primary source or cached data supplied these rows. */
  fallbackUsed: boolean;
  sources: SourceReport[];
  /** Populated in development and test only. */
  stages?: StageCount[];
  traceId: string;
  // Optional request context, present when meaningful for the query type.
  provider?: string | null;
  channel?: string | null;
  region?: string | null;
  windowStartUtc?: string | null;
  windowEndUtc?: string | null;
}

/** Deterministic id from a seed — no Math.random, so replays are reproducible. */
export function traceIdFrom(seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36).padStart(7, '0');
}

export interface BuildOptions<T> {
  queryType: QueryType;
  /** The full available set, already ranked. Pagination is applied here. */
  available: T[];
  rankingMethod: RankingMethod;
  sources: SourceReport[];
  traceId: string;
  pageSize?: number;
  offset?: number;
  /** Index into the AVAILABLE set; remapped onto the page, or null if off-page. */
  topPickIndex?: number | null;
  stages?: StageCount[];
  fallbackUsed?: boolean;
  provider?: string | null;
  channel?: string | null;
  region?: string | null;
  windowStartUtc?: string | null;
  windowEndUtc?: string | null;
}

/**
 * Assemble a result set. This is the ONLY place pagination is applied, so a
 * stray `.slice()` in a route or a component can't silently shorten a list
 * without the counts disagreeing — which the reconciliation test checks.
 */
export function buildResultSet<T>(o: BuildOptions<T>): ResultSet<T> {
  const offset = Math.max(0, o.offset ?? 0);
  const pageSize = Math.max(1, o.pageSize ?? Math.max(1, o.available.length));
  const page = o.available.slice(offset, offset + pageSize);
  const status = combineStatus(o.sources.map((s) => s.status));

  // A top pick outside this page is not shown as "top" — it is still present
  // in the available set, just not flagged on this page.
  const rawTop = o.topPickIndex ?? null;
  const topPickIndex =
    rawTop != null && rawTop >= offset && rawTop < offset + page.length ? rawTop - offset : null;

  return {
    queryType: o.queryType,
    totalAvailable: o.available.length,
    totalReturned: page.length,
    pageSize,
    offset,
    hasMore: o.available.length > offset + page.length,
    results: page,
    topPickIndex,
    rankingMethod: o.rankingMethod,
    status,
    statusMessage: statusMessage(status, o.available.length),
    fallbackUsed: o.fallbackUsed ?? o.sources.some((s) => s.status === 'stale_cache'),
    sources: o.sources,
    stages: o.stages,
    traceId: o.traceId,
    provider: o.provider ?? null,
    channel: o.channel ?? null,
    region: o.region ?? null,
    windowStartUtc: o.windowStartUtc ?? null,
    windowEndUtc: o.windowEndUtc ?? null,
  };
}

/** An empty set that states WHY it is empty. Never a bare `[]`. */
export function emptyResultSet<T>(
  queryType: QueryType,
  sources: SourceReport[],
  traceId: string,
  extra: Partial<ResultSet<T>> = {},
): ResultSet<T> {
  const status = combineStatus(sources.map((s) => s.status));
  return {
    queryType,
    totalAvailable: 0,
    totalReturned: 0,
    pageSize: 0,
    offset: 0,
    hasMore: false,
    results: [],
    topPickIndex: null,
    rankingMethod: 'chronological',
    status,
    statusMessage: statusMessage(status, 0),
    fallbackUsed: false,
    sources,
    traceId,
    provider: null,
    channel: null,
    region: null,
    windowStartUtc: null,
    windowEndUtc: null,
    ...extra,
  };
}

/** True when this set is empty BECAUSE something failed, not because nothing matched. */
export function emptyDueToFailure(rs: ResultSet<unknown>): boolean {
  return rs.totalAvailable === 0 && isFailure(rs.status);
}

/** Threshold at which a pipeline stage is considered suspicious. */
export const COLLAPSE_RATIO = 0.8;

/** Stages that removed more than 80% of their input, with the rule named. */
export function collapseStages(stages: StageCount[]): StageCount[] {
  return stages.filter((s) => s.in > 0 && (s.in - s.out) / s.in > COLLAPSE_RATIO);
}
