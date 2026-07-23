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

/** Provisional defaults — the values Phase 4 shipped, pending calibration. */
export const THRESHOLDS_V1_PROVISIONAL: SeedSimilarityThresholds = {
  version: 'v1-provisional',
  minAnchor: 0.28,
  maxContradiction: 0.42,
  hardRealismGap: 50,
  minConfidence: 0.4,
  defaultFranchiseCap: 1,
};

/** The config the production gate uses. Swap to a calibrated version once frozen. */
export const ACTIVE_THRESHOLDS: SeedSimilarityThresholds = THRESHOLDS_V1_PROVISIONAL;
