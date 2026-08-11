/**
 * THE CHAIN'S QUIETEST FAILURE MODE.
 *
 * Showdown -> preference_events -> deriveDna -> preferenceNudge only produces a
 * ranking change if the title carries a FINGERPRINT: `preferenceNudge` matches
 * a user's per-axis beliefs against `title.dims`, so an event with no `dims`
 * contributes nothing to the order however cleanly it was answered.
 *
 * That failure is invisible from every direction that matters. The session
 * completes, the events insert, `deriveDna` folds them, the results screen
 * celebrates — and the ranker never moves, because the rows the engine needed
 * were never there. Nothing errors. This module exists so that state is a
 * REPORTED NUMBER rather than an absence nobody is looking at.
 *
 * It does not generate anything. Generation is `getTitleDimensions` (gpt-4o-mini
 * + the `title_dimensions` cache), driven in batch by `/api/cron/classify`;
 * CLAUDE.md forbids an LLM call on a user request path, so a Showdown write can
 * only ever READ what the backfill has already established. Building a second
 * fingerprint engine here would be the wrong fix twice over.
 *
 * PURE. No I/O — the caller supplies what the cache returned.
 */

import { TITLES } from '@/lib/voice/quickdna/definition';
import { mediaTypeFor } from './mediaType';

/** The cache key shape `getCachedDimensions` returns: `${mediaType}-${tmdbId}`. */
export function dimsCacheKey(titleId: string): string | null {
  const t = TITLES.find((x) => x.id === titleId);
  if (!t) return null;
  return `${mediaTypeFor(titleId)}-${t.tmdbId}`;
}

/** Every diagnostic title, in the shape `getCachedDimensions` expects. */
export function diagnosticDimensionKeys(): Array<{ tmdb_id: number; media_type: 'movie' | 'tv' }> {
  return TITLES.map((t) => ({ tmdb_id: t.tmdbId, media_type: mediaTypeFor(t.id) }));
}

export interface CoverageReport {
  /** How many diagnostic titles carry a usable fingerprint. */
  covered: number;
  /** The whole diagnostic catalogue. */
  total: number;
  /** Catalogue ids with no usable fingerprint, sorted for a stable log. */
  missing: string[];
  /** 0..1. */
  ratio: number;
  /**
   * Can a Showdown session meaningfully reach the ranker at all?
   *
   * FALSE IS A RELEASE CONDITION, not a warning. With no fingerprints the game
   * is a closed loop again — exactly the state this rebuild set out to leave —
   * and it would look identical to a working one from the outside.
   */
  usable: boolean;
}

/**
 * Coverage below this and the chain is not meaningfully live.
 *
 * Not 100%: a single unclassifiable title must not block a release, and the
 * planner already routes around titles it cannot use. Not 0 either, which would
 * make the check decorative. Two thirds means a typical twelve-decision session
 * lands most of its evidence on titles the ranker can actually match.
 */
export const MIN_USABLE_COVERAGE = 0.67;

export function assessCoverage(cached: ReadonlyMap<string, unknown>): CoverageReport {
  const missing: string[] = [];
  for (const t of TITLES) {
    const key = dimsCacheKey(t.id);
    if (!key || !cached.has(key)) missing.push(t.id);
  }
  const total = TITLES.length;
  const covered = total - missing.length;
  const ratio = total > 0 ? covered / total : 0;
  return { covered, total, missing: missing.sort(), ratio, usable: ratio >= MIN_USABLE_COVERAGE };
}

/**
 * What actually happened to ONE recorded session's evidence.
 *
 * Distinguishes the two states the task is explicit about never conflating:
 * evidence that reached the log, and evidence the ranker can act on. A session
 * can be a complete success by the first measure and worth nothing by the
 * second, and only saying so makes that visible.
 */
export interface WriteCoverage {
  events: number;
  /** Events that carried a fingerprint and can therefore influence ranking. */
  withDims: number;
  /** Events recorded but inert for ranking until their title is classified. */
  withoutDims: number;
  /** Titles responsible for the inert events. */
  unfingerprinted: string[];
}

export function writeCoverage(
  events: ReadonlyArray<{ titleId: string; dims?: unknown }>,
): WriteCoverage {
  const unfingerprinted = new Set<string>();
  let withDims = 0;
  for (const e of events) {
    if (e.dims) withDims++;
    else unfingerprinted.add(e.titleId);
  }
  return {
    events: events.length,
    withDims,
    withoutDims: events.length - withDims,
    unfingerprinted: [...unfingerprinted].sort(),
  };
}
