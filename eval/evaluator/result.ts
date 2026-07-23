/** Types produced by the multilayer evaluator (Phase 5). */
import type { NormalizedQuery } from '../contract';
import type { EvalCase } from '../types';
import type { PipelineResult } from '../pipeline/fixtureFinder';

/** Layer A — parsing accuracy (field-by-field). */
export interface ParseEval {
  fields: Record<string, boolean>; // field → correct?
  fieldAccuracy: number; // 0..1 across graded fields
  intentCorrect: boolean;
  clarificationCorrect: boolean;
  ambiguityRecall: number; // 0..1 of expected ambiguities detected
}

export interface ConstraintViolation {
  itemId: string;
  title: string;
  kind: string; // HardConstraintKind
  detail: string;
}

/** Layer B — hard-constraint validity of the returned set. */
export interface ConstraintEval {
  returned: number;
  violations: ConstraintViolation[];
  duplicateCount: number;
  overCount: boolean;
  hallucinations: number;
  timeWindowViolations: number;
  networkOrPlatformViolations: number;
  exclusionViolations: number;
  previouslyWatchedLeaks: number;
  previouslyRejectedLeaks: number;
  subscriptionViolations: number;
  hardValid: boolean; // no hard violations at all
}

/** Layer C — candidate recall. */
export interface RecallEval {
  graded: boolean;
  recall: number | null; // fraction of known-valid ids surfaced (returned or considered)
  missed: string[];
}

/** Layer D — personalized ranking quality. */
export interface RankingEval {
  graded: boolean;
  descendingByMatch: boolean; // order consistent with the DNA match score
  ndcg: number | null;
  mrr: number | null; // for idealTopId
  idealTopRank: number | null;
  judge?: JudgeVerdict | null;
}

/** Layer E — response quality. */
export interface ResponseEval {
  answersRequest: boolean;
  honestAboutFewer: boolean;
  noImpliedUnavailable: boolean;
  hasNextAction: boolean;
  notTooLong: boolean;
  clarifiesWhenNeeded: boolean;
  score: number; // 0..1
}

/** Layer F — performance. */
export interface PerfEval {
  parseMs: number;
  pipelineMs: number;
  totalMs: number;
  externalApiCalls: number; // 0 in deterministic mode
}

export interface JudgeVerdict {
  rankingScore: number; // 0..1
  rationale: string;
  source: 'llm' | 'deterministic';
}

export interface CaseResult {
  case: EvalCase;
  normalized: NormalizedQuery;
  pipeline: PipelineResult;
  layerA: ParseEval;
  layerB: ConstraintEval;
  layerC: RecallEval;
  layerD: RankingEval;
  layerE: ResponseEval;
  layerF: PerfEval;
  passed: boolean;
  criticalFailure: boolean;
  failureCategories: string[];
  primaryCategory: string | null;
  score: number; // 0..1 per-case composite
  error?: string;
}
