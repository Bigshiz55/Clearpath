/**
 * Benchmark evaluation — PURE. Runs each generated query through the retrieval
 * pipeline (with the fixture catalog as the source set) and scores retrieval
 * quality. The headline invariant is `neverDeadEndRate === 1` — a search must
 * never terminate without either a confident result or populated recovery help.
 */
import { runRetrieval } from '@/lib/search/retrieval/pipeline';
import { fuzzyTitleSource, aliasSource, unavailableSource } from '@/lib/search/retrieval/sources';
import { catalogCandidates } from './catalog';
import type { GeneratedQuery } from './generator';

export interface CaseEval {
  text: string;
  expectedIntent: string;
  actualIntent: string;
  intentCorrect: boolean;
  expectedTitleId: string | null;
  hadConfidentResults: boolean;
  resolvedConfident: boolean;   // expected title among confident results
  resolvedOrLead: boolean;      // confident OR surfaced as a recovery lead
  deadEnd: boolean;             // NO confident result AND NO recovery help
  recoveryComplete: boolean;    // when no confident result, recovery is fully populated
  expansions: number;
  topConfidence: number;
}

export interface BenchmarkMetrics {
  n: number;
  neverDeadEndRate: number;
  recoveryCompleteness: number;   // among cases with zero confident results
  intentAccuracy: number;
  resolutionRecall: number;       // among title-anchored cases (confident)
  resolutionOrLeadRecall: number; // among title-anchored cases (confident or lead)
  meanExpansions: number;
  medianExpansions: number;
  confidentRate: number;
  byIntent: Record<string, { total: number; intentCorrect: number; resolved: number; titleAnchored: number }>;
  failures: { text: string; reason: string }[];
}

export async function evaluateQueries(queries: GeneratedQuery[]): Promise<{ evals: CaseEval[]; metrics: BenchmarkMetrics }> {
  const sources = [
    fuzzyTitleSource(catalogCandidates('fuzzy_title')),
    aliasSource(catalogCandidates('alias')),
    unavailableSource('embeddings'),
    unavailableSource('live_tv'),
    unavailableSource('streaming_providers'),
    unavailableSource('trending'),
  ];

  const evals: CaseEval[] = [];
  for (const q of queries) {
    const r = await runRetrieval(q.text, { sources, limit: 8 });
    const confidentIds = new Set(r.results.map((x) => x.id));
    const leadIds = new Set((r.recovery?.suggestions ?? []).map((s) => s.action ?? ''));
    const hadConfidentResults = r.results.length > 0;
    const resolvedConfident = q.expectedTitleId != null && confidentIds.has(q.expectedTitleId);
    const resolvedOrLead = resolvedConfident || (q.expectedTitleId != null && leadIds.has(q.expectedTitleId));
    const hasHelp = hadConfidentResults || (r.recovery != null && (r.recovery.interpretations.length + r.recovery.suggestions.length) > 0);
    const recoveryComplete = hadConfidentResults
      ? true
      : r.recovery != null && r.recovery.interpretations.length > 0 && r.recovery.suggestions.length > 0;
    const intentCorrect = r.intent.kind === q.expectedIntent || r.intent.also.includes(q.expectedIntent as never);

    evals.push({
      text: q.text, expectedIntent: q.expectedIntent, actualIntent: r.intent.kind, intentCorrect,
      expectedTitleId: q.expectedTitleId, hadConfidentResults, resolvedConfident, resolvedOrLead,
      deadEnd: !hasHelp, recoveryComplete,
      expansions: r.expansions.length, topConfidence: r.telemetry.topConfidence,
    });
  }

  return { evals, metrics: aggregate(evals) };
}

function aggregate(evals: CaseEval[]): BenchmarkMetrics {
  const n = evals.length;
  const titleAnchored = evals.filter((e) => e.expectedTitleId != null);
  const emptyResultCases = evals.filter((e) => !e.hadConfidentResults);
  const exp = [...evals.map((e) => e.expansions)].sort((a, b) => a - b);

  const byIntent: BenchmarkMetrics['byIntent'] = {};
  for (const e of evals) {
    const b = (byIntent[e.expectedIntent] ??= { total: 0, intentCorrect: 0, resolved: 0, titleAnchored: 0 });
    b.total++; if (e.intentCorrect) b.intentCorrect++;
    if (e.expectedTitleId != null) { b.titleAnchored++; if (e.resolvedConfident) b.resolved++; }
  }

  const failures = [
    ...evals.filter((e) => e.deadEnd).map((e) => ({ text: e.text, reason: 'dead_end' })),
    ...emptyResultCases.filter((e) => !e.recoveryComplete).map((e) => ({ text: e.text, reason: 'incomplete_recovery' })),
    ...titleAnchored.filter((e) => !e.resolvedConfident).map((e) => ({ text: e.text, reason: 'unresolved_title' })),
  ].slice(0, 60);

  const rr = (x: number) => Math.round(x * 1000) / 1000;
  return {
    n,
    neverDeadEndRate: rr(1 - evals.filter((e) => e.deadEnd).length / n),
    recoveryCompleteness: rr(emptyResultCases.length === 0 ? 1 : emptyResultCases.filter((e) => e.recoveryComplete).length / emptyResultCases.length),
    intentAccuracy: rr(evals.filter((e) => e.intentCorrect).length / n),
    resolutionRecall: rr(titleAnchored.length === 0 ? 1 : titleAnchored.filter((e) => e.resolvedConfident).length / titleAnchored.length),
    resolutionOrLeadRecall: rr(titleAnchored.length === 0 ? 1 : titleAnchored.filter((e) => e.resolvedOrLead).length / titleAnchored.length),
    meanExpansions: rr(exp.reduce((a, b) => a + b, 0) / n),
    medianExpansions: exp[Math.floor(n / 2)] ?? 0,
    confidentRate: rr(evals.filter((e) => e.hadConfidentResults).length / n),
    byIntent, failures,
  };
}
