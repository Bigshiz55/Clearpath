/**
 * Phase 8/10 — baseline comparison. Compares the current run against a stored
 * baseline (a prior run directory or its summary.json) and flags new failures,
 * fixed cases, and — critically — any *critical regression* on a case that was
 * clean in the baseline. A critical regression fails the run regardless of the
 * composite.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { CaseResult } from '../evaluator/result';
import type { Scorecard } from '../evaluator/scorecard';

export interface Comparison {
  baselineRunId: string | null;
  compositeDelta: number;
  passRateDelta: number;
  newFailures: string[];
  fixed: string[];
  criticalRegressions: string[];
  metricDeltas: Record<string, number>;
}

interface BaselineCase {
  id: string;
  passed: boolean;
  critical: boolean;
}

function resolveBaselineDir(p: string): string | null {
  if (!fs.existsSync(p)) return null;
  const stat = fs.statSync(p);
  if (stat.isDirectory()) return p;
  return path.dirname(p); // pointed at summary.json
}

export function loadBaseline(p: string): { runId: string | null; cases: Map<string, BaselineCase>; summary: { composite: number; passRate: number } } | null {
  const dir = resolveBaselineDir(p);
  if (!dir) return null;
  const casesPath = path.join(dir, 'cases.jsonl');
  const summaryPath = path.join(dir, 'summary.json');
  if (!fs.existsSync(casesPath)) return null;
  const cases = new Map<string, BaselineCase>();
  for (const line of fs.readFileSync(casesPath, 'utf8').trim().split('\n').filter(Boolean)) {
    const r = JSON.parse(line) as { id: string; passed: boolean; critical: boolean };
    cases.set(r.id, { id: r.id, passed: r.passed, critical: r.critical });
  }
  let summary = { composite: 0, passRate: 0 };
  let runId: string | null = null;
  if (fs.existsSync(summaryPath)) {
    const s = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
    summary = { composite: s.composite ?? 0, passRate: s.passRate ?? 0 };
    runId = s.runId ?? null;
  }
  return { runId, cases, summary };
}

export function compareToBaseline(results: CaseResult[], scorecard: Scorecard, baselinePath: string): Comparison | null {
  const base = loadBaseline(baselinePath);
  if (!base) return null;

  const newFailures: string[] = [];
  const fixed: string[] = [];
  const criticalRegressions: string[] = [];
  for (const r of results) {
    const b = base.cases.get(r.case.id);
    if (!b) continue; // case not in baseline (e.g. new gold) — skip for regression accounting
    if (b.passed && !r.passed) newFailures.push(r.case.id);
    if (!b.passed && r.passed) fixed.push(r.case.id);
    if (!b.critical && r.criticalFailure) criticalRegressions.push(r.case.id);
  }

  return {
    baselineRunId: base.runId,
    compositeDelta: scorecard.metrics.composite - base.summary.composite,
    passRateDelta: scorecard.metrics.passRate - base.summary.passRate,
    newFailures,
    fixed,
    criticalRegressions,
    metricDeltas: { composite: scorecard.metrics.composite - base.summary.composite, passRate: scorecard.metrics.passRate - base.summary.passRate },
  };
}

/** Promote a run directory to the tracked baseline. */
export function saveBaseline(outDir: string, runDir: string): string {
  const baseDir = path.join(outDir, 'baseline');
  fs.mkdirSync(baseDir, { recursive: true });
  for (const f of ['summary.json', 'cases.jsonl', 'metrics.json']) {
    const src = path.join(runDir, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(baseDir, f));
  }
  return baseDir;
}
