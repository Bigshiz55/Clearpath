/**
 * Opportunity scoring — PURE. No I/O.
 *
 * Turns a raw Opportunity into a single 0..100 business-impact score so the
 * Growth Opportunity Inbox can rank a heterogeneous mix (Reddit threads, SEO
 * gaps, PR prospects…) on one comparable axis.
 *
 * The score is deterministic and explainable: `explainOpportunityScore`
 * returns the weighted term breakdown so every ranking can show its work
 * (architecture rule 11 — always explain why it matters).
 */
import type { Effort, Intent, Opportunity, Risk } from "@/lib/types";

const INTENT_WEIGHT: Record<Intent, number> = { high: 1, medium: 0.6, low: 0.3 };
const EFFORT_WEIGHT: Record<Effort, number> = { xs: 1, s: 0.85, m: 0.65, l: 0.4, xl: 0.2 };
const RISK_PENALTY: Record<Risk, number> = { low: 0, medium: 0.12, high: 0.3 };

/** Reach is log-scaled so a 1M-reach item doesn't swamp everything else. */
export function reachFactor(estimatedReach: number): number {
  if (estimatedReach <= 0) return 0;
  // log10(reach) mapped so ~10 => .25, ~1k => .5, ~100k => .75, ~10M => 1
  return clamp01(Math.log10(estimatedReach) / 7);
}

export interface ScoreTerm {
  label: string;
  weight: number;
  value: number;
  contribution: number;
}

export interface ScoredOpportunity {
  score: number;
  terms: ScoreTerm[];
}

/**
 * Weighted blend. Weights sum to 1 before the risk penalty is applied
 * multiplicatively, so a high-risk item can never out-rank an equivalent
 * low-risk one.
 */
export function scoreOpportunity(o: Opportunity): ScoredOpportunity {
  const terms: ScoreTerm[] = [
    term("Intent", 0.3, INTENT_WEIGHT[o.intent]),
    term("Reach", 0.25, reachFactor(o.estimatedReach)),
    term("Low competition", 0.2, 1 - clamp01(o.competitiveDensity)),
    term("Low effort", 0.15, EFFORT_WEIGHT[o.effort]),
    term("Confidence", 0.1, clamp01(o.confidence)),
  ];

  const base = terms.reduce((sum, t) => sum + t.contribution, 0); // 0..1
  const afterRisk = base * (1 - RISK_PENALTY[o.risk]);
  return { score: round1(clamp01(afterRisk) * 100), terms };
}

export function explainOpportunityScore(o: Opportunity): string {
  const { score, terms } = scoreOpportunity(o);
  const top = [...terms].sort((a, b) => b.contribution - a.contribution)[0];
  const driver = top ? top.label.toLowerCase() : "mixed factors";
  return `Score ${score}/100 — driven mostly by ${driver}; risk=${o.risk}, effort=${o.effort}.`;
}

/** Rank a list highest-score-first. Stable for equal scores (by discoveredAt). */
export function rankOpportunities(list: Opportunity[]): Opportunity[] {
  return [...list]
    .map((o) => ({ o, s: scoreOpportunity(o).score }))
    .sort((a, b) => b.s - a.s || a.o.discoveredAt.localeCompare(b.o.discoveredAt))
    .map(({ o, s }) => ({ ...o, score: s }));
}

// helpers
function term(label: string, weight: number, value: number): ScoreTerm {
  const v = clamp01(value);
  return { label, weight, value: v, contribution: weight * v };
}
export function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
