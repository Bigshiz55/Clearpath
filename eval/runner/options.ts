/**
 * Run options — parsed from EVAL_* env vars (the reliable channel under the
 * vitest runner) and, when present, `--flag value` argv. Mirrors the CLI flags
 * in the Phase 11 spec: --seed --cases --profile --mode --intent --network
 * --concurrency --max-api-calls --max-cost --baseline.
 */
import type { GenMode, DatasetSplit } from '../types';

export interface RunOptions {
  mode: GenMode;
  seed?: number;
  cases?: number;
  split: DatasetSplit;
  profile?: string; // filter to a single profile
  intent?: string; // filter to an archetype/intent
  network?: string; // filter to a network tag
  concurrency: number; // live mode only
  maxApiCalls: number; // live mode budget
  maxCost: number; // live mode budget ($)
  baseline?: string; // path to a baseline summary.json
  live: boolean;
  outDir: string;
}

function argv(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function num(v: string | undefined): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
function pick(...vals: (string | undefined)[]): string | undefined {
  for (const v of vals) if (v != null && v !== '') return v;
  return undefined;
}

export function parseOptions(): RunOptions {
  const mode = (pick(process.env.EVAL_MODE, argv('--mode')) ?? 'smoke') as GenMode;
  const split = (pick(process.env.EVAL_SPLIT, argv('--split')) ?? 'development') as DatasetSplit;
  return {
    mode,
    split,
    seed: num(pick(process.env.EVAL_SEED, argv('--seed'))),
    cases: num(pick(process.env.EVAL_CASES, argv('--cases'))),
    profile: pick(process.env.EVAL_PROFILE, argv('--profile')),
    intent: pick(process.env.EVAL_INTENT, argv('--intent')),
    network: pick(process.env.EVAL_NETWORK, argv('--network')),
    concurrency: num(pick(process.env.EVAL_CONCURRENCY, argv('--concurrency'))) ?? 4,
    maxApiCalls: num(pick(process.env.EVAL_MAX_API_CALLS, argv('--max-api-calls'))) ?? 100,
    maxCost: num(pick(process.env.EVAL_MAX_COST, argv('--max-cost'))) ?? 5,
    baseline: pick(process.env.EVAL_BASELINE, argv('--baseline')),
    live: pick(process.env.EVAL_LIVE, argv('--live')) === '1',
    outDir: pick(process.env.EVAL_OUT, argv('--out')) ?? 'evaluation-results',
  };
}
