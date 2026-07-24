/**
 * Scheduled-job orchestration helpers — PURE. No I/O.
 *
 * Architecture rule 8: jobs must be resumable, idempotent, observable, and
 * cost-limited. This module provides the idempotency primitive (duplicate-run
 * prevention) and a manual emergency-stop check. The actual scheduling lives in
 * an adapter; this is the decision logic it consults.
 */
import type { CostState } from "@/lib/domain/cost";
import { checkCostCeiling } from "@/lib/domain/cost";

export interface JobLedger {
  /** idempotency keys already seen (succeeded or in-flight). */
  seenKeys: ReadonlySet<string>;
  /** global kill switch — when true, no job may start. */
  emergencyStop: boolean;
}

export type JobGate =
  | { start: true }
  | { start: false; status: "skipped_duplicate" | "aborted_cost" | "aborted_stopped"; reason: string };

/**
 * Decide whether a job run may start. A run is identified by an idempotency key
 * (e.g. `${jobId}:${yyyy-mm-dd}`); a key already in the ledger is a duplicate
 * and must be skipped rather than re-executed.
 */
export function evaluateJobStart(
  idempotencyKey: string,
  ledger: JobLedger,
  cost: CostState,
  estimatedChargeUsd: number,
): JobGate {
  if (ledger.emergencyStop) {
    return { start: false, status: "aborted_stopped", reason: "Emergency stop is engaged." };
  }
  if (ledger.seenKeys.has(idempotencyKey)) {
    return {
      start: false,
      status: "skipped_duplicate",
      reason: `Idempotency key already processed: ${idempotencyKey}`,
    };
  }
  const budget = checkCostCeiling(cost, estimatedChargeUsd);
  if (!budget.allowed) {
    return { start: false, status: "aborted_cost", reason: budget.reason };
  }
  return { start: true };
}

/** Build the canonical idempotency key for a daily job. */
export function dailyIdempotencyKey(jobId: string, isoDate: string): string {
  return `${jobId}:${isoDate.slice(0, 10)}`;
}
