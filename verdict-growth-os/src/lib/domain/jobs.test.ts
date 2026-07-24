import { describe, expect, it } from "vitest";
import { dailyIdempotencyKey, evaluateJobStart, type JobLedger } from "@/lib/domain/jobs";

const cost = { spentUsd: 1, ceilingUsd: 5 };
function ledger(over: Partial<JobLedger> = {}): JobLedger {
  return { seenKeys: new Set<string>(), emergencyStop: false, ...over };
}

describe("dailyIdempotencyKey", () => {
  it("is stable per job per day", () => {
    expect(dailyIdempotencyKey("job-x", "2026-07-24T13:00:00.000Z")).toBe("job-x:2026-07-24");
  });
});

describe("evaluateJobStart", () => {
  it("starts a fresh job within budget", () => {
    expect(evaluateJobStart("k1", ledger(), cost, 1)).toEqual({ start: true });
  });

  it("skips a duplicate idempotency key (no re-execution)", () => {
    const g = evaluateJobStart("k1", ledger({ seenKeys: new Set(["k1"]) }), cost, 1);
    expect(g.start).toBe(false);
    if (!g.start) expect(g.status).toBe("skipped_duplicate");
  });

  it("aborts when the emergency stop is engaged", () => {
    const g = evaluateJobStart("k1", ledger({ emergencyStop: true }), cost, 1);
    expect(g.start).toBe(false);
    if (!g.start) expect(g.status).toBe("aborted_stopped");
  });

  it("aborts when the charge would exceed the cost ceiling", () => {
    const g = evaluateJobStart("k1", ledger(), { spentUsd: 4.9, ceilingUsd: 5 }, 1);
    expect(g.start).toBe(false);
    if (!g.start) expect(g.status).toBe("aborted_cost");
  });

  it("prioritizes emergency stop over duplicate and cost checks", () => {
    const g = evaluateJobStart("k1", ledger({ emergencyStop: true, seenKeys: new Set(["k1"]) }), cost, 100);
    if (!g.start) expect(g.status).toBe("aborted_stopped");
  });
});
