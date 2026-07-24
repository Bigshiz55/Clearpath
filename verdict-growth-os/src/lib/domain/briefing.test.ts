import { describe, expect, it } from "vitest";
import { buildBriefing } from "@/lib/domain/briefing";
import {
  SEED_INCIDENTS,
  SEED_OBSERVATIONS,
  SEED_OPPORTUNITIES,
  SEED_RECOMMENDATIONS,
} from "@/lib/seed";

const NOW = "2026-07-24T13:00:00.000Z";

describe("buildBriefing", () => {
  const b = buildBriefing({
    now: NOW,
    observations: SEED_OBSERVATIONS,
    opportunities: SEED_OPPORTUNITIES,
    recommendations: SEED_RECOMMENDATIONS,
    incidents: SEED_INCIDENTS,
  });

  it("separates grew vs declined by direction", () => {
    expect(b.grew.every((o) => o.direction === "up")).toBe(true);
    expect(b.declined.every((o) => o.direction === "down")).toBe(true);
  });

  it("only surfaces unresolved incidents as broken", () => {
    expect(b.broken.every((i) => i.status !== "resolved")).toBe(true);
  });

  it("flags revenue threats from declining revenue-related metrics", () => {
    expect(b.revenueThreats.some((o) => o.metric.toLowerCase().includes("churn"))).toBe(true);
  });

  it("returns at most 5 ranked top actions", () => {
    expect(b.topActions.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < b.topActions.length; i++) {
      expect(b.topActions[i - 1]!.priorityScore).toBeGreaterThanOrEqual(b.topActions[i]!.priorityScore);
    }
  });

  it("returns at most 5 ranked new opportunities with scores attached", () => {
    expect(b.newOpportunities.length).toBeLessThanOrEqual(5);
    expect(b.newOpportunities[0]!.score).toBeGreaterThan(0);
  });
});
