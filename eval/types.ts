/** Shared types across the evaluation framework. */
import type { NormalizedQuery, ExpectedBehavior } from './contract';
import type { NoiseKind } from './generator/noise';

export type CaseSource = 'gold' | 'generated' | 'mutation' | 'regression';

export interface EvalCase {
  id: string;
  seed: number;
  source: CaseSource;
  archetype: string;
  profileKey: string;
  rawQuery: string;
  noise: NoiseKind;
  /** Ground-truth normalized query (the intended meaning). */
  intended: NormalizedQuery;
  /** Behavioural expectations for the returned results. */
  expected: ExpectedBehavior;
  /** Tags for report filtering (content type, network, time, category…). */
  tags: string[];
}

export type GenMode = 'smoke' | 'standard' | 'full' | 'stress' | 'mutation' | 'regression';

export const MODE_SIZES: Record<Exclude<GenMode, 'mutation' | 'regression'>, number> = {
  smoke: 50,
  standard: 500,
  full: 5000,
  stress: 25000,
};

/** Which dataset split a case belongs to (Phase 9 — prevent overfitting). */
export type DatasetSplit = 'development' | 'regression' | 'holdout';
