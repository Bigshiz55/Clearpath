// The calibration "brain". Given real (title-sources, did-the-user-like-it)
// rows, it fits the Standard Score base weights to maximize how often the blend
// puts genuinely-liked titles on top — "the highest ratio of picking the right
// thing." Pure and deterministic: same data in → same weights out, no
// randomness, no I/O. It never mutates a live score; a human promotes the fitted
// weights into `standardWeights.ts`.
import { computeStandardScore, type SourceReading, type StandardWeights } from './standardScore';

export interface CalibrationSample {
  readings: SourceReading[];
  /** The real outcome: did the viewer end up liking it (rating ≥ threshold)? */
  liked: boolean;
}

export interface CalibrationResult {
  weights: StandardWeights;
  /** Precision@K of the fitted weights on the held-out test split. */
  hitRate: number;
  /** Precision@K of uniform weights on the same test split — the baseline. */
  baseline: number;
  trainSize: number;
  testSize: number;
  k: number;
}

const UNIFORM: StandardWeights = { tmdbAudience: 0.2, imdb: 0.2, rottenTomatoes: 0.2, rtAudience: 0.2, metacritic: 0.2 };

/**
 * Precision@K: rank the samples by predicted Standard Score, take the top K
 * fraction, and report what share of them were actually liked. This is the
 * headline metric — "when we say watch it, how often were we right?"
 */
export function precisionAtK(samples: CalibrationSample[], weights: StandardWeights, k = 0.3): number {
  if (samples.length === 0) return 0;
  const scored = samples.map((s) => ({
    score: computeStandardScore(s.readings, weights).score,
    liked: s.liked,
  }));
  scored.sort((a, b) => b.score - a.score);
  const n = Math.max(1, Math.round(scored.length * k));
  const top = scored.slice(0, n);
  return top.filter((t) => t.liked).length / top.length;
}

// A coarse grid is enough — the score renormalizes weights, so only their ratios
// matter. 7^4 = 2401 combinations, all deterministic.
const GRID = [0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4];

function splitByParity(samples: CalibrationSample[]): { train: CalibrationSample[]; test: CalibrationSample[] } {
  const train: CalibrationSample[] = [];
  const test: CalibrationSample[] = [];
  samples.forEach((s, i) => (i % 2 === 0 ? train : test).push(s));
  return { train, test };
}

/**
 * Fit the weights that maximize precision@K on a training split, then report the
 * honest hit-rate on a held-out test split (vs a uniform-weight baseline). The
 * parity split is deterministic so results are reproducible.
 */
export function fitWeights(samples: CalibrationSample[], k = 0.3): CalibrationResult {
  const { train, test } = splitByParity(samples);
  const evalSet = test.length > 0 ? test : train;
  const trainSet = train.length > 0 ? train : samples;

  let best: StandardWeights = { ...UNIFORM };
  let bestScore = -1;

  for (const rottenTomatoes of GRID) {
    for (const imdb of GRID) {
      for (const rtAudience of GRID) {
        for (const tmdbAudience of GRID) {
          for (const metacritic of GRID) {
            const sum = rottenTomatoes + imdb + rtAudience + tmdbAudience + metacritic;
            if (sum <= 0) continue;
            const w: StandardWeights = {
              rottenTomatoes: rottenTomatoes / sum,
              imdb: imdb / sum,
              rtAudience: rtAudience / sum,
              tmdbAudience: tmdbAudience / sum,
              metacritic: metacritic / sum,
            };
            const p = precisionAtK(trainSet, w, k);
            if (p > bestScore) {
              bestScore = p;
              best = w;
            }
          }
        }
      }
    }
  }

  return {
    weights: best,
    hitRate: precisionAtK(evalSet, best, k),
    baseline: precisionAtK(evalSet, UNIFORM, k),
    trainSize: trainSet.length,
    testSize: evalSet.length,
    k,
  };
}
