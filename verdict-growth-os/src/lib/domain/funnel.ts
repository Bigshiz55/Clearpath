/**
 * Funnel calculations — PURE. No I/O.
 *
 * Computes step-to-step conversion rates and drop-off from raw daily counts,
 * and locates the single biggest leak. Used by the Conversion Laboratory and
 * surfaced into the Executive Briefing.
 */
import type { FunnelDay, FunnelStepKey, ProductId } from "@/lib/types";

export const FUNNEL_ORDER: FunnelStepKey[] = [
  "impression",
  "click",
  "landing_visit",
  "signup",
  "dna_started",
  "dna_completed",
  "first_verdict",
  "successful_recommendation",
  "return_visit",
  "referral",
  "subscription",
];

export interface StepConversion {
  from: FunnelStepKey;
  to: FunnelStepKey;
  fromCount: number;
  toCount: number;
  /** to/from as a fraction 0..1. 0 when fromCount is 0. */
  rate: number;
  /** fraction lost between the two steps, 0..1. */
  dropOff: number;
}

/** Sum a set of daily rows into a single totals map (e.g. last 7 days). */
export function aggregateCounts(days: FunnelDay[]): Record<FunnelStepKey, number> {
  const totals = Object.fromEntries(
    FUNNEL_ORDER.map((k) => [k, 0]),
  ) as Record<FunnelStepKey, number>;
  for (const d of days) {
    for (const k of FUNNEL_ORDER) totals[k] += d.counts[k] ?? 0;
  }
  return totals;
}

export function stepConversions(totals: Record<FunnelStepKey, number>): StepConversion[] {
  const out: StepConversion[] = [];
  for (let i = 0; i < FUNNEL_ORDER.length - 1; i++) {
    const from = FUNNEL_ORDER[i]!;
    const to = FUNNEL_ORDER[i + 1]!;
    const fromCount = totals[from] ?? 0;
    const toCount = totals[to] ?? 0;
    const rate = fromCount > 0 ? toCount / fromCount : 0;
    out.push({ from, to, fromCount, toCount, rate, dropOff: fromCount > 0 ? 1 - rate : 0 });
  }
  return out;
}

/** Overall impression->subscription conversion, 0..1. */
export function overallConversion(totals: Record<FunnelStepKey, number>): number {
  const top = totals[FUNNEL_ORDER[0]!] ?? 0;
  const bottom = totals[FUNNEL_ORDER[FUNNEL_ORDER.length - 1]!] ?? 0;
  return top > 0 ? bottom / top : 0;
}

/**
 * The step with the largest absolute lost users — the highest-leverage place
 * to run an experiment. Ignores the very top of funnel where counts are huge
 * but the business can't do much (impression->click is an ad-quality problem,
 * still reported, just not auto-flagged as "the" leak unless it's worst).
 */
export function biggestLeak(totals: Record<FunnelStepKey, number>): StepConversion | null {
  const convs = stepConversions(totals);
  let worst: StepConversion | null = null;
  let worstLost = -1;
  for (const c of convs) {
    const lost = c.fromCount - c.toCount;
    if (lost > worstLost) {
      worstLost = lost;
      worst = c;
    }
  }
  return worst;
}

export function funnelForProduct(days: FunnelDay[], product: ProductId): FunnelDay[] {
  return days.filter((d) => d.product === product);
}
