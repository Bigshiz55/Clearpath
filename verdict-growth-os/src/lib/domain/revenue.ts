/**
 * Revenue calculations — PURE. No I/O.
 *
 * Derives the headline revenue health numbers from a RevenueSnapshot plus the
 * matching CostSnapshot, including the two ratios the mission cares about most:
 * LTV:CAC and AI+infra cost per active user.
 */
import type { CostSnapshot, RevenueSnapshot } from "@/lib/types";

export interface RevenueHealth {
  mrrUsd: number;
  arrUsd: number;
  ltvToCac: number;
  /** Combined AI + infra spend divided by active users. */
  costPerActiveUserUsd: number;
  /** revenuePerActiveUser - costPerActiveUser. */
  contributionPerActiveUserUsd: number;
  paybackMonths: number | null;
  healthy: boolean;
}

export function ltvToCac(snapshot: RevenueSnapshot): number {
  if (snapshot.cacUsd <= 0) return snapshot.ltvUsd > 0 ? Infinity : 0;
  return round2(snapshot.ltvUsd / snapshot.cacUsd);
}

export function costPerActiveUser(cost: CostSnapshot): number {
  if (cost.activeUsers <= 0) return 0;
  return round2((cost.llmCostUsd + cost.infraCostUsd) / cost.activeUsers);
}

/** CAC payback in months, using revenue per active user as a monthly proxy. */
export function paybackMonths(snapshot: RevenueSnapshot): number | null {
  if (snapshot.revenuePerActiveUserUsd <= 0) return null;
  return round2(snapshot.cacUsd / snapshot.revenuePerActiveUserUsd);
}

export function revenueHealth(rev: RevenueSnapshot, cost: CostSnapshot): RevenueHealth {
  const cpau = costPerActiveUser(cost);
  const ratio = ltvToCac(rev);
  return {
    mrrUsd: round2(rev.mrrUsd),
    arrUsd: round2(rev.arrUsd),
    ltvToCac: ratio,
    costPerActiveUserUsd: cpau,
    contributionPerActiveUserUsd: round2(rev.revenuePerActiveUserUsd - cpau),
    paybackMonths: paybackMonths(rev),
    // Rule of thumb: healthy unit economics need LTV:CAC >= 3 and positive
    // contribution margin per active user.
    healthy: ratio >= 3 && rev.revenuePerActiveUserUsd - cpau > 0,
  };
}

/** ARR must always equal MRR*12; used to validate ingested snapshots. */
export function arrConsistent(rev: RevenueSnapshot, toleranceUsd = 0.01): boolean {
  return Math.abs(rev.arrUsd - rev.mrrUsd * 12) <= toleranceUsd;
}

function round2(n: number): number {
  if (!Number.isFinite(n)) return n;
  return Math.round(n * 100) / 100;
}
