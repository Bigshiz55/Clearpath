/**
 * Recommendation ranking — PURE. No I/O.
 *
 * The Executive Briefing shows the five highest-value actions today. This
 * module computes a priority score for each Recommendation and returns the
 * ranked top-N. Deterministic and explainable.
 *
 * Priority = expectedImpact (0..100) * confidence, boosted by urgency
 * (deadline proximity) and dampened by effort. Approval-required items are NOT
 * penalized — a high-value action that needs sign-off should still surface;
 * it's the Approval Center's job to gate execution, not ranking's job to hide.
 */
import type { Effort, Recommendation, Timestamp } from "@/lib/types";

const EFFORT_DAMP: Record<Effort, number> = { xs: 1, s: 0.92, m: 0.8, l: 0.62, xl: 0.45 };

export interface RankedRecommendation extends Recommendation {
  priorityScore: number;
}

/**
 * @param now ISO timestamp injected for determinism (no `Date.now()` inside).
 */
export function priorityScore(r: Recommendation, now: Timestamp): number {
  const impact = clamp(r.expectedImpact, 0, 100);
  const conf = clamp(r.confidence, 0, 1);
  const urgency = urgencyFactor(r.deadline, now); // 1..1.5
  const effort = EFFORT_DAMP[r.effort];
  return round1(impact * conf * urgency * effort);
}

/** Sooner deadlines get up to a +50% boost; overdue items are maxed. */
export function urgencyFactor(deadline: Timestamp, now: Timestamp): number {
  const days = (Date.parse(deadline) - Date.parse(now)) / 86_400_000;
  if (Number.isNaN(days)) return 1;
  if (days <= 0) return 1.5;
  if (days >= 14) return 1;
  return 1 + (0.5 * (14 - days)) / 14;
}

export function rankRecommendations(
  list: Recommendation[],
  now: Timestamp,
): RankedRecommendation[] {
  return [...list]
    .filter((r) => r.status !== "done" && r.status !== "dismissed")
    .map((r) => ({ ...r, priorityScore: priorityScore(r, now) }))
    .sort((a, b) => b.priorityScore - a.priorityScore || a.deadline.localeCompare(b.deadline));
}

export function topActions(
  list: Recommendation[],
  now: Timestamp,
  n = 5,
): RankedRecommendation[] {
  return rankRecommendations(list, now).slice(0, n);
}

// helpers
function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
