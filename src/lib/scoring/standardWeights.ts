// Base weights for the Standard Score. These are the ONLY thing the calibration
// brain changes: it fits them to real user ratings offline, and a human promotes
// the result here (versioned). Inference stays deterministic — AI/UI never touch
// a live score, per the scoring rule.
import type { StandardWeights } from './standardScore';

export interface StandardWeightsMeta {
  version: string;
  /** ISO date the weights were fit, or null for hand-picked priors. */
  trainedAt: string | null;
  /** Number of (title, real-rating) rows the fit was trained on. */
  sampleSize: number;
  /** Precision@K of the fit on held-out data, or null if not yet calibrated. */
  hitRate: number | null;
  note: string;
}

/**
 * v1 — expert priors, not yet calibrated. Rotten Tomatoes and IMDb carry the
 * most predictive weight in the literature; Metacritic is thinner coverage;
 * TMDB audience is broad but noisier. Sums to 1 for readability (the engine
 * renormalizes over present sources anyway).
 */
export const STANDARD_WEIGHTS: StandardWeights = {
  rottenTomatoes: 0.3,
  imdb: 0.27,
  tmdbAudience: 0.23,
  metacritic: 0.2,
};

export const STANDARD_WEIGHTS_META: StandardWeightsMeta = {
  version: 'v1-prior',
  trainedAt: null,
  sampleSize: 0,
  hitRate: null,
  note: 'Expert priors. Run the calibration report to fit these to real ratings, then promote the result here.',
};
