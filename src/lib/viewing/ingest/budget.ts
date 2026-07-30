/**
 * PROVIDER CALL BUDGET.
 *
 * A licensed EPG plan is metered, and a paginated lineup ingestion is many HTTP
 * requests, not one. Conflating "one daily ingestion run" with "one provider
 * call" is how a 50-call plan gets burned in a morning.
 *
 * This module is pure: it estimates a run's cost BEFORE any request is made,
 * refuses to start a run that would breach the safety threshold, and stops a
 * run in flight the moment the remaining budget cannot cover the next request.
 * Nothing here caches or splits requests to get around a limit — the point is
 * to stay inside the plan, not to route around it.
 */

export interface BudgetConfig {
  /** Calls the plan allows per month. */
  monthlyLimit: number;
  /** Fraction of the limit we are willing to spend, 0..1. Default 0.9. */
  safetyPercent?: number;
}

export interface BudgetState {
  monthlyLimit: number;
  safetyPercent: number;
  used: number;
  /** Day of the month, 1-31, for projection. */
  dayOfMonth: number;
  daysInMonth: number;
}

export interface BudgetVerdict {
  allowed: boolean;
  remaining: number;
  /** Calls we may still spend before hitting the safety threshold. */
  spendable: number;
  threshold: number;
  reason?: string;
  /** Linear projection of month-end usage at the current rate. */
  projectedMonthly: number;
  /** True when the projection exceeds the plan. */
  projectedOverage: boolean;
}

export const DEFAULT_SAFETY_PERCENT = 0.9;

export function safetyThreshold(c: BudgetConfig): number {
  return Math.floor(c.monthlyLimit * (c.safetyPercent ?? DEFAULT_SAFETY_PERCENT));
}

/** Can we afford `cost` more calls right now? */
export function evaluateBudget(s: BudgetState, cost: number): BudgetVerdict {
  const threshold = safetyThreshold(s);
  const spendable = Math.max(0, threshold - s.used);
  const remaining = Math.max(0, s.monthlyLimit - s.used);
  const projectedMonthly = s.dayOfMonth > 0
    ? Math.ceil((s.used / s.dayOfMonth) * s.daysInMonth)
    : s.used;

  const base = { remaining, spendable, threshold, projectedMonthly,
    projectedOverage: projectedMonthly > s.monthlyLimit };

  if (s.used >= s.monthlyLimit) {
    return { ...base, allowed: false,
      reason: `Monthly allowance exhausted (${s.used}/${s.monthlyLimit} calls used).` };
  }
  if (s.used >= threshold) {
    return { ...base, allowed: false,
      reason: `Safety threshold reached (${s.used}/${threshold}). Holding back the remaining ${remaining} calls.` };
  }
  if (cost > spendable) {
    return { ...base, allowed: false,
      reason: `This run needs ${cost} calls but only ${spendable} remain before the safety threshold.` };
  }
  return { ...base, allowed: true };
}

export interface CostEstimate {
  /** Requests to list the lineup's channels, including pagination. */
  channelCalls: number;
  /** Requests to fetch schedules for those channels. */
  scheduleCalls: number;
  /** Requests for programme metadata. */
  metadataCalls: number;
  total: number;
  assumptions: string[];
}

export interface EstimateInput {
  /** Channels expected in the lineup. */
  channelCount: number;
  /** Channels the provider returns per channel-list page. */
  channelsPerPage: number;
  /** Channels whose schedules one schedule request can cover. */
  channelsPerScheduleCall: number;
  /** Days of coverage requested. */
  days: number;
  /** Whether the provider needs a separate metadata call per batch. */
  metadataBatchSize?: number;
  /** Distinct programmes expected — drives metadata batching. */
  programmeCount?: number;
}

/**
 * Estimate a run's cost. Deliberately pessimistic (ceil everywhere): being
 * over-cautious costs a few unspent calls; being optimistic breaches the plan.
 */
export function estimateRunCost(i: EstimateInput): CostEstimate {
  const assumptions: string[] = [];
  const channelCalls = Math.max(1, Math.ceil(i.channelCount / Math.max(1, i.channelsPerPage)));
  assumptions.push(`${i.channelCount} channels at ${i.channelsPerPage}/page → ${channelCalls} channel-list call(s)`);

  const perDay = Math.max(1, Math.ceil(i.channelCount / Math.max(1, i.channelsPerScheduleCall)));
  const scheduleCalls = perDay * Math.max(1, i.days);
  assumptions.push(`${perDay} schedule call(s)/day × ${i.days} day(s) → ${scheduleCalls}`);

  let metadataCalls = 0;
  if (i.metadataBatchSize && i.programmeCount) {
    metadataCalls = Math.ceil(i.programmeCount / i.metadataBatchSize);
    assumptions.push(`${i.programmeCount} programmes at ${i.metadataBatchSize}/batch → ${metadataCalls} metadata call(s)`);
  }

  return {
    channelCalls, scheduleCalls, metadataCalls,
    total: channelCalls + scheduleCalls + metadataCalls,
    assumptions,
  };
}

/**
 * A live spend counter for one run. `tryConsume` is checked BEFORE each
 * request, so a run stops cleanly at the threshold instead of discovering the
 * breach afterwards.
 */
export class RunBudget {
  private spent = 0;
  private readonly entries: { endpoint: string; at: number; ok: boolean }[] = [];

  constructor(
    private readonly state: BudgetState,
    /** Hard cap for this run, on top of the monthly threshold. */
    private readonly runCap: number,
  ) {}

  get callsUsed(): number { return this.spent; }
  get ledger(): readonly { endpoint: string; at: number; ok: boolean }[] { return this.entries; }

  /** Reserve one call. False means the run must stop — never spend anyway. */
  tryConsume(endpoint: string, nowMs: number): boolean {
    if (this.spent >= this.runCap) return false;
    const v = evaluateBudget({ ...this.state, used: this.state.used + this.spent }, 1);
    if (!v.allowed) return false;
    this.spent++;
    this.entries.push({ endpoint, at: nowMs, ok: true });
    return true;
  }

  /** Record the outcome of the most recent call. */
  markResult(ok: boolean): void {
    const last = this.entries[this.entries.length - 1];
    if (last) last.ok = ok;
  }

  /** Why a run stopped, for the ingestion record. */
  stopReason(): string | null {
    if (this.spent >= this.runCap) return `Run cap of ${this.runCap} calls reached.`;
    const v = evaluateBudget({ ...this.state, used: this.state.used + this.spent }, 1);
    return v.allowed ? null : (v.reason ?? 'Budget exhausted.');
  }
}
