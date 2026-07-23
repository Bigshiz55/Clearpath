/**
 * Per-case orchestrator: run the REAL parsers (normalize) and the deterministic
 * pipeline (fixtureFinder), grade all six layers, judge ranking, classify any
 * failure, and compute the per-case composite score + pass/critical flags.
 */
import { normalize } from '../normalize/normalize';
import { runFixtureFinder } from '../pipeline/fixtureFinder';
import type { EvalCase } from '../types';
import type { FixtureWorld } from '../fixtures/index';
import { evalLayerA, evalLayerB, evalLayerC, evalLayerD, evalLayerE } from './layers';
import { deterministicJudge } from './judge';
import { classify } from './taxonomy';
import type { CaseResult, PerfEval } from './result';

/** Per-case scorecard weights (Phase 6). */
export const CASE_WEIGHTS = {
  hardPrecision: 0.3,
  parsing: 0.2,
  recall: 0.15,
  ranking: 0.2,
  response: 0.1,
  reliability: 0.05,
};

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function evaluateCase(c: EvalCase, world: FixtureWorld): CaseResult {
  let error: string | undefined;
  const tParse0 = now();
  let normalized;
  let pipeline;
  let perf: PerfEval = { parseMs: 0, pipelineMs: 0, totalMs: 0, externalApiCalls: 0 };
  try {
    normalized = normalize(c.rawQuery);
    const tParse1 = now();
    pipeline = runFixtureFinder(normalized, c.profileKey, world);
    const tPipe1 = now();
    perf = { parseMs: tParse1 - tParse0, pipelineMs: tPipe1 - tParse1, totalMs: tPipe1 - tParse0, externalApiCalls: 0 };
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    normalized = normalize(c.rawQuery);
    pipeline = { intent: 'unknown' as const, items: [], scoredFor: 'error', relaxed: null, total: 0, clarification: null, consideredIds: [], responseText: 'error' };
    perf = { parseMs: now() - tParse0, pipelineMs: 0, totalMs: now() - tParse0, externalApiCalls: 0 };
  }

  const layerA = evalLayerA(c, normalized);
  const layerB = evalLayerB(c, pipeline, world);
  const layerC = evalLayerC(c, pipeline);
  const layerD = evalLayerD(c, pipeline);
  layerD.judge = deterministicJudge(pipeline, world.profile(c.profileKey), world);
  const layerE = evalLayerE(c, pipeline);

  // ── per-case composite ──
  const violatedItemIds = new Set(layerB.violations.map((v) => v.itemId));
  const returned = pipeline.items.length;
  const expectEmpty = Boolean(c.expected.expectsEmptyOrFewer) || Boolean(c.expected.expectsRejection);
  const hardPrecision = returned > 0 ? (returned - violatedItemIds.size) / returned : expectEmpty ? 1 : c.expected.maxResults ? 0.6 : 1;
  const parsing = 0.5 * (layerA.intentCorrect ? 1 : 0) + 0.5 * layerA.fieldAccuracy;
  const recall = layerC.graded ? (layerC.recall ?? 1) : 1;
  const rankingBase = layerD.graded ? 0.6 * (layerD.ndcg ?? 1) + 0.4 * (layerD.mrr ?? layerD.judge?.rankingScore ?? 1) : 1;
  const response = layerE.score;
  const reliability = error ? 0 : perf.totalMs > 1500 ? 0.5 : 1;

  const score =
    CASE_WEIGHTS.hardPrecision * hardPrecision +
    CASE_WEIGHTS.parsing * parsing +
    CASE_WEIGHTS.recall * recall +
    CASE_WEIGHTS.ranking * rankingBase +
    CASE_WEIGHTS.response * response +
    CASE_WEIGHTS.reliability * reliability;

  const criticalFailure =
    Boolean(error) ||
    layerB.hallucinations > 0 ||
    layerB.duplicateCount > 0 ||
    layerB.overCount ||
    layerB.timeWindowViolations > 0 ||
    layerB.networkOrPlatformViolations > 0 ||
    layerB.exclusionViolations > 0 ||
    layerB.previouslyWatchedLeaks > 0 ||
    layerB.previouslyRejectedLeaks > 0 ||
    layerB.subscriptionViolations > 0;

  // pass logic, honouring special expectations
  let passed: boolean;
  if (c.expected.expectsRejection) {
    passed = pipeline.intent === 'unsupported' && returned === 0;
  } else if (c.expected.expectsClarification) {
    passed = layerA.clarificationCorrect && (pipeline.clarification != null || layerA.ambiguityRecall >= 1 || returned > 0);
  } else {
    passed =
      layerB.hardValid &&
      layerA.intentCorrect &&
      (!layerC.graded || (layerC.recall ?? 1) >= 0.5) &&
      layerE.score >= 0.5 &&
      !error;
  }

  const base = { case: c, normalized, pipeline, layerA, layerB, layerC, layerD, layerE, layerF: perf, error };
  const cls = classify(base as never);

  return {
    ...base,
    passed,
    criticalFailure,
    failureCategories: passed ? [] : cls.categories,
    primaryCategory: passed ? null : cls.primary,
    score,
  };
}
