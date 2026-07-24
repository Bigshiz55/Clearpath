import { describe, expect, it } from "vitest";
import { priorityScore, rankRecommendations, topActions, urgencyFactor } from "@/lib/domain/ranking";
import type { Recommendation } from "@/lib/types";

const NOW = "2026-07-24T00:00:00.000Z";

function rec(over: Partial<Recommendation>): Recommendation {
  return {
    id: "r", product: "watchverdict", department: "growth", problem: "p", evidence: ["e"],
    recommendedAction: "a", effort: "m", expectedImpact: 50, confidence: 0.6, metricAffected: "m",
    owner: "o", approvalRequired: false, status: "proposed", deadline: "2026-08-24T00:00:00.000Z",
    sourceOpportunityId: null, createdAt: NOW, ...over,
  };
}

describe("priorityScore", () => {
  it("scales with impact and confidence", () => {
    const hi = priorityScore(rec({ expectedImpact: 90, confidence: 0.9 }), NOW);
    const lo = priorityScore(rec({ expectedImpact: 20, confidence: 0.3 }), NOW);
    expect(hi).toBeGreaterThan(lo);
  });

  it("does not penalize approval-required items", () => {
    const gated = priorityScore(rec({ approvalRequired: true }), NOW);
    const free = priorityScore(rec({ approvalRequired: false }), NOW);
    expect(gated).toBe(free);
  });

  it("lower effort ranks higher, all else equal", () => {
    expect(priorityScore(rec({ effort: "xs" }), NOW)).toBeGreaterThan(priorityScore(rec({ effort: "xl" }), NOW));
  });
});

describe("urgencyFactor", () => {
  it("is 1.5 for overdue and 1 for far-out deadlines", () => {
    expect(urgencyFactor("2026-07-20T00:00:00.000Z", NOW)).toBe(1.5);
    expect(urgencyFactor("2026-09-24T00:00:00.000Z", NOW)).toBe(1);
  });
  it("increases as the deadline approaches", () => {
    const soon = urgencyFactor("2026-07-26T00:00:00.000Z", NOW);
    const later = urgencyFactor("2026-08-04T00:00:00.000Z", NOW);
    expect(soon).toBeGreaterThan(later);
  });
});

describe("rankRecommendations / topActions", () => {
  it("excludes done and dismissed items", () => {
    const list = [rec({ id: "keep" }), rec({ id: "done", status: "done" }), rec({ id: "dismissed", status: "dismissed" })];
    expect(rankRecommendations(list, NOW).map((r) => r.id)).toEqual(["keep"]);
  });

  it("returns at most N and highest priority first", () => {
    const list = Array.from({ length: 8 }, (_, i) => rec({ id: `r${i}`, expectedImpact: i * 10 }));
    const top = topActions(list, NOW, 5);
    expect(top).toHaveLength(5);
    for (let i = 1; i < top.length; i++) {
      expect(top[i - 1]!.priorityScore).toBeGreaterThanOrEqual(top[i]!.priorityScore);
    }
  });
});
