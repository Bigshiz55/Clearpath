/**
 * Predefined search-quality TARGETS. No code change is production-ready until the
 * benchmark meets these. The runner asserts them and fails otherwise. Values are
 * measured against the offline fixture catalog; they are floors, not ceilings.
 */
import type { BenchmarkMetrics } from './metrics';

export interface QualityTargets {
  neverDeadEndRate: number;      // HARD — the product promise
  recoveryCompleteness: number;  // HARD — every no-result query gets full help
  intentAccuracy: number;
  resolutionRecall: number;
  resolutionOrLeadRecall: number;
  meanExpansions: number;
}

export const TARGETS: QualityTargets = {
  neverDeadEndRate: 1.0,
  recoveryCompleteness: 1.0,
  intentAccuracy: 0.85,
  resolutionRecall: 0.85,
  resolutionOrLeadRecall: 0.9,
  meanExpansions: 8,
};

export interface TargetCheck { key: keyof QualityTargets; target: number; actual: number; pass: boolean }

export function checkTargets(m: BenchmarkMetrics): { checks: TargetCheck[]; allPass: boolean } {
  const checks: TargetCheck[] = (Object.keys(TARGETS) as (keyof QualityTargets)[]).map((key) => ({
    key, target: TARGETS[key], actual: m[key] as number, pass: (m[key] as number) >= TARGETS[key],
  }));
  return { checks, allPass: checks.every((c) => c.pass) };
}
