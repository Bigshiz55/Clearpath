/**
 * Phase 9 — dataset construction and the dev/regression/holdout split that
 * prevents overfitting. The holdout set uses a distinct seed and is NEVER shown
 * to the optimizer; the regression set is frozen gold + confirmed failures.
 */
import fs from 'node:fs';
import path from 'node:path';
import { generateCases, sizeForMode } from '../generator/generate';
import { GOLD_CASES } from '../gold/seed';
import type { EvalCase, GenMode, DatasetSplit } from '../types';

/** Distinct, fixed seeds so splits never overlap. */
export const SEEDS = {
  development: 1_000,
  holdout: 9_000,
  stress: 5_000,
};

const REGRESSION_STORE = path.resolve('eval/gold/regression.json');

/** Confirmed failures promoted to permanent regression cases (Phase 8/9).
 *  Never deleted after a fix. */
export function loadRegressionExtras(): EvalCase[] {
  try {
    if (fs.existsSync(REGRESSION_STORE)) return JSON.parse(fs.readFileSync(REGRESSION_STORE, 'utf8')) as EvalCase[];
  } catch {
    /* ignore */
  }
  return [];
}

export function saveRegressionExtras(cases: EvalCase[]): void {
  fs.mkdirSync(path.dirname(REGRESSION_STORE), { recursive: true });
  fs.writeFileSync(REGRESSION_STORE, JSON.stringify(cases, null, 2));
}

export function regressionSet(): EvalCase[] {
  return [...GOLD_CASES, ...loadRegressionExtras()];
}

export interface BuildOptions {
  mode: GenMode;
  seed?: number;
  cases?: number; // override count
  split?: DatasetSplit;
}

/** Build the case list for a run. Gold cases are always included (except in
 *  pure holdout), so every run exercises the flagship scenarios. */
export function buildCases(opts: BuildOptions): EvalCase[] {
  const { mode } = opts;
  if (mode === 'regression') return regressionSet();

  if (mode === 'mutation') return mutationCases(opts.seed ?? SEEDS.development);

  const split: DatasetSplit = opts.split ?? 'development';
  const seed = opts.seed ?? (split === 'holdout' ? SEEDS.holdout : SEEDS.development);
  const total = opts.cases ?? sizeForMode(mode);

  if (split === 'holdout') {
    return generateCases(total, seed, 'generated');
  }
  // development: gold anchors + synthetic fill up to `total`
  const gold = regressionSet();
  const fill = Math.max(0, total - gold.length);
  return [...gold, ...generateCases(fill, seed, 'generated')];
}

/** Phase 8 mutation mode: variants of previously-failed cases. Reads the most
 *  recent failures.jsonl and re-renders each with fresh noise/count/network. */
export function mutationCases(seed: number): EvalCase[] {
  const latest = latestFailuresFile();
  if (!latest) return generateCases(50, seed, 'mutation');
  try {
    const lines = fs.readFileSync(latest, 'utf8').trim().split('\n').filter(Boolean);
    const failed = lines.map((l) => JSON.parse(l) as { case: EvalCase });
    // Keep the same intended meaning; the generator's noise layer supplies the
    // variation. We re-tag them as mutation source.
    return failed.map((f, i) => ({ ...f.case, id: `mutation-${seed}-${i}`, source: 'mutation' as const }));
  } catch {
    return generateCases(50, seed, 'mutation');
  }
}

function latestFailuresFile(): string | null {
  const runsDir = path.resolve('evaluation-results/runs');
  if (!fs.existsSync(runsDir)) return null;
  const runs = fs
    .readdirSync(runsDir)
    .map((d) => path.join(runsDir, d, 'failures.jsonl'))
    .filter((p) => fs.existsSync(p))
    .sort();
  return runs[runs.length - 1] ?? null;
}
