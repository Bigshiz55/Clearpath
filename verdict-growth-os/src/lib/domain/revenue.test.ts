import { describe, expect, it } from "vitest";
import { arrConsistent, costPerActiveUser, ltvToCac, revenueHealth } from "@/lib/domain/revenue";
import type { CostSnapshot, RevenueSnapshot } from "@/lib/types";

const prov = { source: "t", sourceUrl: null, product: "watchverdict" as const, collectedAt: "2026-07-24T00:00:00.000Z", confidence: 1, isDemo: true };

function rev(over: Partial<RevenueSnapshot>): RevenueSnapshot {
  return {
    product: "watchverdict", date: "2026-07-24", mrrUsd: 1000, arrUsd: 12000, activeSubscriptions: 100,
    trials: 20, trialConversionPct: 0.3, freeToPaidPct: 0.05, churnPct: 0.05,
    revenuePerActiveUserUsd: 1, cacUsd: 3, ltvUsd: 12, provenance: prov, ...over,
  };
}
function cost(over: Partial<CostSnapshot>): CostSnapshot {
  return { product: "watchverdict", date: "2026-07-24", llmCostUsd: 2, infraCostUsd: 3, activeUsers: 1000, provenance: prov, ...over };
}

describe("ltvToCac", () => {
  it("computes the ratio", () => {
    expect(ltvToCac(rev({ ltvUsd: 12, cacUsd: 3 }))).toBe(4);
  });
  it("handles zero CAC without dividing by zero", () => {
    expect(ltvToCac(rev({ ltvUsd: 10, cacUsd: 0 }))).toBe(Infinity);
    expect(ltvToCac(rev({ ltvUsd: 0, cacUsd: 0 }))).toBe(0);
  });
});

describe("costPerActiveUser", () => {
  it("sums llm + infra over active users", () => {
    expect(costPerActiveUser(cost({ llmCostUsd: 2, infraCostUsd: 3, activeUsers: 1000 }))).toBe(0.01);
  });
  it("is 0 with no active users (no divide-by-zero)", () => {
    expect(costPerActiveUser(cost({ activeUsers: 0 }))).toBe(0);
  });
});

describe("revenueHealth", () => {
  it("flags healthy unit economics (LTV:CAC>=3 and positive contribution)", () => {
    const h = revenueHealth(rev({ ltvUsd: 12, cacUsd: 3, revenuePerActiveUserUsd: 0.62 }), cost({ llmCostUsd: 2, infraCostUsd: 3, activeUsers: 1450 }));
    expect(h.ltvToCac).toBe(4);
    expect(h.healthy).toBe(true);
    expect(h.contributionPerActiveUserUsd).toBeGreaterThan(0);
  });
  it("flags unhealthy when LTV:CAC < 3", () => {
    expect(revenueHealth(rev({ ltvUsd: 4, cacUsd: 3 }), cost({})).healthy).toBe(false);
  });
});

describe("arrConsistent", () => {
  it("validates ARR == MRR*12", () => {
    expect(arrConsistent(rev({ mrrUsd: 1000, arrUsd: 12000 }))).toBe(true);
    expect(arrConsistent(rev({ mrrUsd: 1000, arrUsd: 9999 }))).toBe(false);
  });
});
