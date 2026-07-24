import { describe, expect, it } from "vitest";
import {
  aggregateCounts,
  biggestLeak,
  overallConversion,
  stepConversions,
} from "@/lib/domain/funnel";
import type { FunnelDay, FunnelStepKey } from "@/lib/types";

function day(counts: Partial<Record<FunnelStepKey, number>>): FunnelDay {
  const full = {
    impression: 0, click: 0, landing_visit: 0, signup: 0, dna_started: 0, dna_completed: 0,
    first_verdict: 0, successful_recommendation: 0, return_visit: 0, referral: 0, subscription: 0,
    ...counts,
  } as Record<FunnelStepKey, number>;
  return { product: "watchverdict", date: "2026-07-24", counts: full, provenance: {
    source: "t", sourceUrl: null, product: "watchverdict", collectedAt: "2026-07-24T00:00:00.000Z", confidence: 1, isDemo: true,
  } };
}

describe("aggregateCounts", () => {
  it("sums each step across days", () => {
    const totals = aggregateCounts([day({ impression: 100 }), day({ impression: 50, signup: 10 })]);
    expect(totals.impression).toBe(150);
    expect(totals.signup).toBe(10);
  });
});

describe("stepConversions", () => {
  it("computes rate and drop-off, guarding divide-by-zero", () => {
    const totals = aggregateCounts([day({ impression: 100, click: 25 })]);
    const convs = stepConversions(totals);
    const imprToClick = convs.find((c) => c.from === "impression")!;
    expect(imprToClick.rate).toBeCloseTo(0.25);
    expect(imprToClick.dropOff).toBeCloseTo(0.75);
    const clickToLanding = convs.find((c) => c.from === "click")!;
    expect(clickToLanding.rate).toBe(0); // landing_visit is 0 but click is 25
    const landingToSignup = convs.find((c) => c.from === "landing_visit")!;
    expect(landingToSignup.rate).toBe(0); // from is 0 -> guarded
  });
});

describe("overallConversion", () => {
  it("is bottom/top of the funnel", () => {
    const totals = aggregateCounts([day({ impression: 1000, subscription: 30 })]);
    expect(overallConversion(totals)).toBeCloseTo(0.03);
  });
  it("is 0 when there are no impressions", () => {
    expect(overallConversion(aggregateCounts([day({ subscription: 5 })]))).toBe(0);
  });
});

describe("biggestLeak", () => {
  it("finds the step with the largest absolute user loss", () => {
    const totals = aggregateCounts([day({
      impression: 1000, click: 900, landing_visit: 890, signup: 300, dna_started: 290, dna_completed: 120,
    })]);
    const leak = biggestLeak(totals)!;
    // landing_visit(890) -> signup(300) loses 590, the biggest drop here.
    expect(leak.from).toBe("landing_visit");
    expect(leak.to).toBe("signup");
  });
});
