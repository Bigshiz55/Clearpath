/**
 * Typed, versioned seed-similarity thresholds. The gate reads ACTIVE_THRESHOLDS
 * instead of scattering magic numbers. Values are PROVISIONAL until the broader
 * human-reviewed calibration (eval/searchlab/calibration) selects a frozen point;
 * see docs/search-dna-phase4-comparison.md and the calibration report.
 */
export interface SeedSimilarityThresholds {
  /** Config version — bump when a calibrated set is frozen from a real sweep. */
  version: string;
  /** Minimum weighted shared-anchor score to qualify (0..1). */
  minAnchor: number;
  /** Contradiction score above which a candidate fails regardless of anchors (0..1). */
  maxContradiction: number;
  /** Grounded↔fantastical `realism` split treated as a hard failure (0..100). */
  hardRealismGap: number;
  /** Below this metadata confidence the fingerprint is too sparse to trust (0..1). */
  minConfidence: number;
  /** Same-collection results allowed in the returned top slice (default policy). */
  defaultFranchiseCap: number;
}

/** Provisional defaults — the values Phase 4 shipped, tuned only on Rocky-like
 *  cases. RETAINED for reference: the calibration sweep showed this point leaks
 *  contradictions on a broader set (critical-contradiction rate 0.214 on the
 *  calibration split). Do NOT use in production. */
export const THRESHOLDS_V1_PROVISIONAL: SeedSimilarityThresholds = {
  version: 'v1-provisional',
  minAnchor: 0.28,
  maxContradiction: 0.42,
  hardRealismGap: 50,
  minConfidence: 0.4,
  defaultFranchiseCap: 1,
};

/**
 * v1-calibrated — selected by the calibration sweep (eval/searchlab/calibration)
 * on the CALIBRATION split only, then confirmed on the frozen CAL_HOLDOUT split
 * (scored once) and the frozen Search Lab regression suite. Versus provisional it
 * removes ALL contradiction leaks and false-qualifications (precision 1.0, F1 0.944,
 * critical-contradiction rate 0) at a recall cost of two thin cross-language
 * positives, which correctly fall through to the honest broader-alternatives path
 * rather than being mislabelled "similar". Selection artifacts + rationale:
 * search-lab-results/calibration/report.md and docs/search-dna-decisions-1-2-3.md.
 *
 * Still flagged for a LARGER human-audited calibration set before final production
 * sign-off (the sweep set is an initial reviewed sample), but it is a strict,
 * evidence-backed improvement over provisional and is what the gate now uses.
 */
export const THRESHOLDS_V1_CALIBRATED: SeedSimilarityThresholds = {
  version: 'v1-calibrated',
  minAnchor: 0.4,
  maxContradiction: 0.42,
  hardRealismGap: 40,
  minConfidence: 0.4,
  defaultFranchiseCap: 1,
};

/** The config the production gate uses. */
export const ACTIVE_THRESHOLDS: SeedSimilarityThresholds = THRESHOLDS_V1_CALIBRATED;
