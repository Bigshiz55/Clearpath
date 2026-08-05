/**
 * SUPPORT STAGES — the objective ladder every source climbs.
 *
 * Pure (no I/O) so both the server and the tests can reason about it, and so
 * the one rule that matters — WHAT MAY A NORMAL USER SEE — is a single
 * function with a single test, not a judgement call spread across surfaces.
 *
 * The stages are ordered. A source's stage is a claim about evidence, and the
 * evidence required to advance is defined in `PROMOTION_REQUIREMENTS` below.
 * Nothing may skip a rung by being confident about it.
 */

export const SUPPORT_STAGES = [
  'discovered',
  'evaluated',
  'fixture_tested',
  'live_prototype',
  'ingesting',
  'verified',
  'production_supported',
  'degraded',
  'disabled',
] as const;

export type SupportStage = (typeof SUPPORT_STAGES)[number];

/** Ladder position. `degraded` and `disabled` are states, not rungs. */
const RUNG: Record<SupportStage, number> = {
  discovered: 0,
  evaluated: 1,
  fixture_tested: 2,
  live_prototype: 3,
  ingesting: 4,
  verified: 5,
  production_supported: 6,
  degraded: -1,
  disabled: -2,
};

/**
 * THE ONE RULE. A normal user sees data from a source only at `verified` or
 * `production_supported`.
 *
 * `degraded` is deliberately NOT user-visible as a source of NEW data — but
 * its last valid dataset stays readable (see `degradedRetainsLastGood`),
 * because deleting the only listings we have because the refresh failed is a
 * worse answer than showing them with an honest freshness label.
 */
export function isUserVisible(stage: SupportStage): boolean {
  return stage === 'verified' || stage === 'production_supported';
}

/**
 * A degraded source stops CONTRIBUTING but does not stop EXISTING: rows it
 * previously wrote stay queryable and are labelled stale at the surface.
 */
export function degradedRetainsLastGood(stage: SupportStage): boolean {
  return stage === 'degraded';
}

/** Fixture-generated rows may never be presented to a normal production user. */
export function fixtureRowsMayBeShown(input: {
  isFixtureRow: boolean;
  vercelEnv: string | null | undefined;
}): boolean {
  if (!input.isFixtureRow) return true;
  return (input.vercelEnv ?? '').trim().toLowerCase() !== 'production';
}

export type PromotionEvidence = {
  consecutiveSuccessfulRuns: number;
  recordCountWithinExpectedRange: boolean;
  coverageDatesValid: boolean;
  sampledAgainstOriginatingSource: boolean;
  timezonesCorrect: boolean;
  duplicateRateAcceptable: boolean;
  matchConfidenceMeasured: boolean;
  failureRetainsLastGood: boolean;
  servedFromStoredRecords: boolean;
  zeroBrowserTriggeredUpstreamRequests: boolean;
  independentlyDisableable: boolean;
  noFixtureOrPlaceholderRows: boolean;
  freshnessAndConfidenceExposed: boolean;
  attributionSatisfied: boolean;
};

/**
 * The verification gate, as a function rather than a paragraph in a document.
 * Every field must be true and the run count must be at least three — "one
 * successful scrape is not sufficient" is enforced here, not remembered.
 */
export const MIN_CONSECUTIVE_RUNS_FOR_PRODUCTION = 3;

export function evaluatePromotion(e: PromotionEvidence): {
  eligible: boolean;
  stage: SupportStage;
  unmet: string[];
} {
  const unmet: string[] = [];
  if (e.consecutiveSuccessfulRuns < MIN_CONSECUTIVE_RUNS_FOR_PRODUCTION) {
    unmet.push(
      `consecutiveSuccessfulRuns=${e.consecutiveSuccessfulRuns} < ${MIN_CONSECUTIVE_RUNS_FOR_PRODUCTION}`,
    );
  }
  const flags: (keyof PromotionEvidence)[] = [
    'recordCountWithinExpectedRange',
    'coverageDatesValid',
    'sampledAgainstOriginatingSource',
    'timezonesCorrect',
    'duplicateRateAcceptable',
    'matchConfidenceMeasured',
    'failureRetainsLastGood',
    'servedFromStoredRecords',
    'zeroBrowserTriggeredUpstreamRequests',
    'independentlyDisableable',
    'noFixtureOrPlaceholderRows',
    'freshnessAndConfidenceExposed',
    'attributionSatisfied',
  ];
  for (const f of flags) if (e[f] !== true) unmet.push(String(f));

  return {
    eligible: unmet.length === 0,
    stage: unmet.length === 0 ? 'production_supported' : 'ingesting',
    unmet,
  };
}

/** Is `to` a legal transition from `from`? Advancing may not skip a rung. */
export function isLegalTransition(from: SupportStage, to: SupportStage): boolean {
  if (to === 'disabled' || to === 'degraded') return true; // always allowed to pull the cord
  if (from === 'disabled' || from === 'degraded') {
    // Recovery re-enters at the rung below the one it must re-earn.
    return RUNG[to] >= 0 && RUNG[to] <= RUNG.verified;
  }
  return RUNG[to] <= RUNG[from] + 1 && RUNG[to] >= 0;
}

/** Human-readable, for the admin dashboard and the final report. */
export const STAGE_LABEL: Record<SupportStage, string> = {
  discovered: 'Discovered — identified, not evaluated',
  evaluated: 'Evaluated — feasibility reviewed, not built',
  fixture_tested: 'Fixture tested — adapter works against stored samples',
  live_prototype: 'Live prototype — real records retrieved and normalized once',
  ingesting: 'Ingesting — scheduled live ingestion is running',
  verified: 'Verified — counts, ranges, samples and fidelity checked',
  production_supported: 'Production supported — 3+ consecutive clean runs',
  degraded: 'Degraded — failing or stale; last valid data retained',
  disabled: 'Disabled — not suitable for user-facing results',
};
