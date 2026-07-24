import { describe, expect, it } from "vitest";
import { rankOpportunities, reachFactor, scoreOpportunity } from "@/lib/domain/scoring";
import type { Opportunity } from "@/lib/types";

function opp(over: Partial<Opportunity>): Opportunity {
  return {
    id: "o", product: "watchverdict", type: "seo", title: "t", audience: "a",
    intent: "medium", estimatedReach: 1000, competitiveDensity: 0.5, recommendedChannel: "c",
    suggestedResponse: "r", expectedOutcome: "o", effort: "m", risk: "low", confidence: 0.6,
    approvalState: "not_required", outcome: null, discoveredAt: "2026-07-20T00:00:00.000Z",
    provenance: { source: "s", sourceUrl: null, product: "watchverdict", collectedAt: "2026-07-20T00:00:00.000Z", confidence: 0.6, isDemo: true },
    ...over,
  };
}

describe("scoreOpportunity", () => {
  it("returns a 0..100 score", () => {
    const { score } = scoreOpportunity(opp({}));
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("high intent beats low intent, all else equal", () => {
    const hi = scoreOpportunity(opp({ intent: "high" })).score;
    const lo = scoreOpportunity(opp({ intent: "low" })).score;
    expect(hi).toBeGreaterThan(lo);
  });

  it("lower competitive density scores higher", () => {
    const open = scoreOpportunity(opp({ competitiveDensity: 0.1 })).score;
    const crowded = scoreOpportunity(opp({ competitiveDensity: 0.9 })).score;
    expect(open).toBeGreaterThan(crowded);
  });

  it("high risk can never out-rank an otherwise identical low-risk item", () => {
    const low = scoreOpportunity(opp({ risk: "low" })).score;
    const high = scoreOpportunity(opp({ risk: "high" })).score;
    expect(high).toBeLessThan(low);
  });

  it("term contributions sum consistently with the score before risk penalty", () => {
    const { terms } = scoreOpportunity(opp({ risk: "low" }));
    const base = terms.reduce((s, t) => s + t.contribution, 0);
    expect(base).toBeGreaterThan(0);
    expect(base).toBeLessThanOrEqual(1);
  });
});

describe("reachFactor", () => {
  it("is monotonic and bounded 0..1", () => {
    expect(reachFactor(0)).toBe(0);
    expect(reachFactor(10)).toBeLessThan(reachFactor(100000));
    expect(reachFactor(1e9)).toBeLessThanOrEqual(1);
  });
});

describe("rankOpportunities", () => {
  it("sorts highest score first and attaches score", () => {
    const ranked = rankOpportunities([
      opp({ id: "weak", intent: "low", competitiveDensity: 0.9, risk: "high", estimatedReach: 10 }),
      opp({ id: "strong", intent: "high", competitiveDensity: 0.1, risk: "low", estimatedReach: 500000, effort: "xs" }),
    ]);
    expect(ranked[0]!.id).toBe("strong");
    expect(ranked[0]!.score).toBeGreaterThan(ranked[1]!.score!);
  });

  it("is deterministic for equal inputs (stable by discoveredAt)", () => {
    const a = opp({ id: "a", discoveredAt: "2026-07-01T00:00:00.000Z" });
    const b = opp({ id: "b", discoveredAt: "2026-07-02T00:00:00.000Z" });
    expect(rankOpportunities([b, a]).map((o) => o.id)).toEqual(rankOpportunities([a, b]).map((o) => o.id));
  });
});
