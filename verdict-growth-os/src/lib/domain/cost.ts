/**
 * Cost-ceiling enforcement — PURE. No I/O.
 *
 * Architecture rule 8: scheduled jobs must be cost-limited. Before a job spends
 * (LLM tokens, paid API calls), it asks `checkCostCeiling` whether the next
 * increment stays under the ceiling. This is the emergency brake that stops
 * runaway AI/infra spend.
 */

export interface CostState {
  spentUsd: number;
  ceilingUsd: number;
}

export interface CostDecision {
  allowed: boolean;
  remainingUsd: number;
  reason: string;
}

/**
 * @param nextChargeUsd cost of the operation about to run.
 * Returns allowed=false if it would breach the ceiling, so the caller aborts.
 */
export function checkCostCeiling(state: CostState, nextChargeUsd: number): CostDecision {
  const remaining = round4(state.ceilingUsd - state.spentUsd);
  if (nextChargeUsd < 0) {
    return { allowed: false, remainingUsd: remaining, reason: "Negative charge is invalid." };
  }
  if (state.spentUsd >= state.ceilingUsd) {
    return { allowed: false, remainingUsd: 0, reason: "Daily cost ceiling already reached." };
  }
  if (state.spentUsd + nextChargeUsd > state.ceilingUsd) {
    return {
      allowed: false,
      remainingUsd: remaining,
      reason: `Charge $${nextChargeUsd} would exceed remaining $${remaining}.`,
    };
  }
  return {
    allowed: true,
    remainingUsd: round4(remaining - nextChargeUsd),
    reason: "Within ceiling.",
  };
}

/** Fraction of the ceiling consumed, 0..1+. Used for the UI budget bar. */
export function utilization(state: CostState): number {
  if (state.ceilingUsd <= 0) return 1;
  return round4(state.spentUsd / state.ceilingUsd);
}

/** Warn before the wall so operators can intervene at 80% by default. */
export function shouldWarn(state: CostState, threshold = 0.8): boolean {
  return utilization(state) >= threshold;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
