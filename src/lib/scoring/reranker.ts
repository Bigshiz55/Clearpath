/**
 * The learned re-ranker (pure, deterministic, unit-tested).
 *
 * The Standard-Score calibrator learns how to weight the *objective* rating
 * sources. This sits one level up: given real (features → did-you-like-it) rows,
 * it fits how much a title's **objective quality** vs. its **content-fingerprint
 * fit** predicts THIS product's users actually enjoying it, then turns that into
 * a small bounded re-rank nudge. Like the calibrator, it never mutates a live
 * score and a human promotes the fitted model into `rerankerWeights.ts`.
 *
 * A logistic model on two 0..1 features. Same data in → same model out (fixed
 * init, fixed iteration count, no randomness).
 */

export interface RerankSample {
  objective: number; // 0..100 objective quality (Standard Score)
  dimMatch: number; // 0..100 content-fingerprint fit to the user
  liked: boolean; // rating ≥ threshold
}

export interface RerankModel {
  bias: number;
  wObjective: number;
  wDim: number;
}

/** Neutral model → predict 0.5 for everything → zero nudge. The shipped default. */
export const NEUTRAL_MODEL: RerankModel = { bias: 0, wObjective: 0, wDim: 0 };

/** How far the re-ranker may move a title's rank score (bounded, like the DNA nudge). */
export const RERANK_NUDGE_MAX = 6;

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

/** Predicted probability (0..1) the user likes a title with these features. */
export function predict(objective: number, dimMatch: number, model: RerankModel): number {
  return sigmoid(model.bias + model.wObjective * (objective / 100) + model.wDim * (dimMatch / 100));
}

/** Bounded re-rank nudge in points, centered so a neutral prediction moves nothing. */
export function rerankNudge(objective: number, dimMatch: number, model: RerankModel): number {
  const p = predict(objective, dimMatch, model);
  return Math.max(-RERANK_NUDGE_MAX, Math.min(RERANK_NUDGE_MAX, (p - 0.5) * 2 * RERANK_NUDGE_MAX));
}

export interface RerankFit {
  model: RerankModel;
  hitRate: number; // precision@K of the fitted model on held-out test
  baseline: number; // precision@K ranking by objective quality alone
  trainSize: number;
  testSize: number;
  k: number;
}

/** Precision@K: rank by predicted likelihood, take the top K fraction, report the liked share. */
export function precisionAtK(samples: RerankSample[], model: RerankModel, k = 0.3): number {
  if (samples.length === 0) return 0;
  const scored = samples
    .map((s) => ({ p: predict(s.objective, s.dimMatch, model), liked: s.liked }))
    .sort((a, b) => b.p - a.p);
  const n = Math.max(1, Math.round(scored.length * k));
  const top = scored.slice(0, n);
  return top.filter((t) => t.liked).length / top.length;
}

// Objective-only baseline: a model that ranks purely by objective quality.
const OBJECTIVE_ONLY: RerankModel = { bias: 0, wObjective: 1, wDim: 0 };

function splitByParity(samples: RerankSample[]): { train: RerankSample[]; test: RerankSample[] } {
  const train: RerankSample[] = [];
  const test: RerankSample[] = [];
  samples.forEach((s, i) => (i % 2 === 0 ? train : test).push(s));
  return { train, test };
}

/**
 * Fit a logistic model by deterministic gradient descent (with light L2), then
 * report precision@K on a held-out parity split vs. an objective-only baseline.
 */
export function fitReranker(samples: RerankSample[], k = 0.3): RerankFit {
  const { train, test } = splitByParity(samples);
  const trainSet = train.length > 0 ? train : samples;
  const evalSet = test.length > 0 ? test : trainSet;

  const model: RerankModel = { ...NEUTRAL_MODEL };
  const lr = 0.5;
  const l2 = 0.001;
  const iters = 600;
  const n = trainSet.length;
  for (let it = 0; it < iters && n > 0; it++) {
    let gB = 0, gO = 0, gD = 0;
    for (const s of trainSet) {
      const x1 = s.objective / 100;
      const x2 = s.dimMatch / 100;
      const err = predict(s.objective, s.dimMatch, model) - (s.liked ? 1 : 0);
      gB += err;
      gO += err * x1;
      gD += err * x2;
    }
    model.bias -= lr * (gB / n);
    model.wObjective -= lr * (gO / n + l2 * model.wObjective);
    model.wDim -= lr * (gD / n + l2 * model.wDim);
  }

  return {
    model,
    hitRate: precisionAtK(evalSet, model, k),
    baseline: precisionAtK(evalSet, OBJECTIVE_ONLY, k),
    trainSize: trainSet.length,
    testSize: evalSet.length,
    k,
  };
}
