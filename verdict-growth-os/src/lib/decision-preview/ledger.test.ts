import { describe, expect, it } from "vitest";
import { buildWatchVerdictGraph } from "@/lib/decision-preview/kpiGraph";
import { allocate, buildPreviewLedger, rejectionReason } from "@/lib/decision-preview/ledger";

describe("KPI value graph (WatchVerdict seed)", () => {
  const g = buildWatchVerdictGraph();

  it("anchors monetization on the free-to-paid rate", () => {
    expect(g.probToSubscription.return_visit).toBeCloseTo(g.freeToPaidAnchor, 6);
  });

  it("node value increases monotonically down the funnel toward subscription", () => {
    expect(g.nodeValueUsd.signup).toBeLessThan(g.nodeValueUsd.dna_completed);
    expect(g.nodeValueUsd.dna_completed).toBeLessThan(g.nodeValueUsd.successful_recommendation);
    expect(g.nodeValueUsd.successful_recommendation).toBeLessThan(g.nodeValueUsd.return_visit);
  });

  it("is deterministic", () => {
    const g2 = buildWatchVerdictGraph();
    expect(g2.nodeValueUsd).toEqual(g.nodeValueUsd);
  });
});

describe("ΔEV ledger", () => {
  const ledger = buildPreviewLedger();

  it("ranks 'Fix DNA activation leak' as the #1 action", () => {
    expect(ledger.actions[0]!.id).toBe("act-dna-fix");
  });

  it("NEVER double counts: pathway views partition ΔEV (sum == base ΔEV)", () => {
    for (const a of ledger.actions) {
      const sum = a.impactViews.acquisition + a.impactViews.retention + a.impactViews.revenue;
      expect(sum).toBeCloseTo(a.evUsd.base, 1);
      // and the split fractions themselves sum to 1
      const frac = a.pathwaySplit.acquisition + a.pathwaySplit.retention + a.pathwaySplit.revenue;
      expect(frac).toBeCloseTo(1, 6);
    }
  });

  it("orders cases conservative <= base <= optimistic", () => {
    for (const a of ledger.actions) {
      expect(a.evUsd.conservative).toBeLessThanOrEqual(a.evUsd.base);
      expect(a.evUsd.base).toBeLessThanOrEqual(a.evUsd.optimistic);
    }
  });

  it("shows paid/one-shot acquisition losing money against a leaky funnel", () => {
    const tiktok = ledger.actions.find((a) => a.id === "act-tiktok")!;
    const meta = ledger.actions.find((a) => a.id === "act-meta-paid")!;
    expect(tiktok.evUsd.base).toBeLessThan(tiktok.cashCostUsd);
    expect(meta.evUsd.base).toBeLessThan(meta.cashCostUsd);
  });
});

describe("CEO allocator", () => {
  const ledger = buildPreviewLedger();
  const view = allocate(ledger);

  it("the ONE thing is the DNA activation fix", () => {
    expect(view.oneThing.id).toBe("act-dna-fix");
  });

  it("best under low cash has zero cash cost", () => {
    expect(view.bestLowCash.cashCostUsd).toBe(0);
  });

  it("best under low engineering capacity needs zero eng-days", () => {
    expect(view.bestLowEngCapacity.engDays).toBe(0);
  });

  it("top five are the five highest ΔEV actions in order", () => {
    expect(view.topFive).toHaveLength(5);
    for (let i = 1; i < view.topFive.length; i++) {
      expect(view.topFive[i - 1]!.evUsd.base).toBeGreaterThanOrEqual(view.topFive[i]!.evUsd.base);
    }
  });

  it("produces a rejection reason for out-of-money actions", () => {
    const tiktok = ledger.actions.find((a) => a.id === "act-tiktok")!;
    expect(rejectionReason(tiktok, view.oneThing)).toMatch(/dilut|ΔEV/);
  });
});

// Optional human-readable dump: `PRINT_LEDGER=1 npm test`
if (process.env.PRINT_LEDGER) {
  describe("print", () => {
    it("dumps the ledger", () => {
      const ledger = buildPreviewLedger();
      const g = ledger.graph;
      // eslint-disable-next-line no-console
      console.log("\n=== KPI NODE VALUES (USD per incremental unit) ===");
      for (const n of ["signup", "dna_started", "dna_completed", "first_verdict", "successful_recommendation", "return_visit"] as const) {
        // eslint-disable-next-line no-console
        console.log(`${n.padEnd(28)} P(sub)=${g.probToSubscription[n].toFixed(6)}  value=$${g.nodeValueUsd[n].toFixed(4)}  monthlyVol=${g.monthlyVolume[n]}`);
      }
      // eslint-disable-next-line no-console
      console.log(`anchor free_to_paid=${g.freeToPaidAnchor}  LTV=$${g.subscriberValueUsd}`);
      // eslint-disable-next-line no-console
      console.log("\n=== LEDGER (by base ΔEV) ===");
      for (const a of ledger.actions) {
        // eslint-disable-next-line no-console
        console.log(
          `${a.title.padEnd(34)} ${a.sponsor.padEnd(6)} EV c/b/o = $${a.evUsd.conservative}/$${a.evUsd.base}/$${a.evUsd.optimistic}` +
          `  pop=${a.populationAffected} cash=$${a.cashCostUsd} eng=${a.engDays}d conf=${a.confidence} risk=${a.risk}` +
          `  views[acq/ret/rev]=$${a.impactViews.acquisition}/$${a.impactViews.retention}/$${a.impactViews.revenue}`,
        );
      }
      const v = allocate(ledger);
      // eslint-disable-next-line no-console
      console.log(`\nONE THING: ${v.oneThing.title}`);
      // eslint-disable-next-line no-console
      console.log(`lowCash: ${v.bestLowCash.title} | lowEng: ${v.bestLowEngCapacity.title} | fastestLearning: ${v.fastestLearning.title} | longTerm: ${v.bestLongTerm.title}`);
      expect(true).toBe(true);
    });
  });
}
