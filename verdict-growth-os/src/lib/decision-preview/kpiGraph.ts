/**
 * KPI VALUE GRAPH — DECISION-ENGINE PREVIEW (DEMONSTRATION ONLY).
 *
 * ⚠️  This is a labeled PREVIEW/mock used to prove the ΔEV ranking mechanism
 *     before Phase 2 builds it for real. It reads the existing WatchVerdict
 *     SEED funnel (isDemo=true) and converts upstream KPI movement into ONE
 *     dollar-denominated value per node. Nothing here is production truth.
 *
 * How it works (this is the anti-double-counting core):
 *   1. Derive the funnel edge conversion rates from the seed funnel.
 *   2. Anchor monetization on a single calibrated probability:
 *        P(subscribe | return_visit) = free-to-paid rate  (from seed revenue).
 *      This replaces the toy `return→referral→subscription` tail so the graph
 *      reflects real monetization, not an artifact.
 *   3. For every node compute P(subscribe | node) = product of forward edge
 *      rates from that node down to `return_visit`, times the anchor.
 *   4. value(node) = P(subscribe | node) × subscriber_value(LTV).
 *
 * Because value(node) already contains ALL downstream conversion to a paying
 * subscriber, you value a change at the SINGLE node it moves. You never add
 * "acquisition value + activation value + revenue value" — they are the same
 * dollars measured at different depths. That is how the ledger avoids triple
 * counting (see docs/adr/ADR-002).
 */
import { aggregateCounts } from "@/lib/domain/funnel";
import { SEED_FUNNEL_DAYS, SEED_REVENUE } from "@/lib/seed";
import type { FunnelStepKey, ProductId } from "@/lib/types";

/** Nodes we assign a monetization value to, top → monetization. */
export const VALUE_CHAIN: FunnelStepKey[] = [
  "impression",
  "click",
  "landing_visit",
  "signup",
  "dna_started",
  "dna_completed",
  "first_verdict",
  "successful_recommendation",
  "return_visit",
];

const SEED_DAYS_WINDOW = 14; // seed provides 14 days per product
const DAYS_PER_MONTH = 30;

export interface KpiGraph {
  product: ProductId;
  /** child conversion rate keyed by child node (child_count / parent_count). */
  edgeRate: Partial<Record<FunnelStepKey, number>>;
  /** P(subscribe | node), 0..1. */
  probToSubscription: Record<FunnelStepKey, number>;
  /** value of one incremental unit at a node, in USD. */
  nodeValueUsd: Record<FunnelStepKey, number>;
  /** monthly volume at each node, scaled from the seed window. */
  monthlyVolume: Record<FunnelStepKey, number>;
  /** the monetization anchor used (free-to-paid). */
  freeToPaidAnchor: number;
  /** subscriber lifetime value used. */
  subscriberValueUsd: number;
  isDemo: true;
}

/**
 * Build the WatchVerdict value graph from seed data. Deterministic and pure.
 */
export function buildWatchVerdictGraph(): KpiGraph {
  const product: ProductId = "watchverdict";
  const days = SEED_FUNNEL_DAYS.filter((d) => d.product === product);
  const totals = aggregateCounts(days); // 14-day totals

  const rev = SEED_REVENUE.find((r) => r.product === product)!;
  const subscriberValueUsd = rev.ltvUsd; // $14.20 in seed
  const freeToPaidAnchor = rev.freeToPaidPct; // 0.041 in seed

  // 1. edge rates (child/parent) along the value chain
  const edgeRate: Partial<Record<FunnelStepKey, number>> = {};
  for (let i = 1; i < VALUE_CHAIN.length; i++) {
    const parent = VALUE_CHAIN[i - 1]!;
    const child = VALUE_CHAIN[i]!;
    const p = totals[parent] ?? 0;
    const c = totals[child] ?? 0;
    edgeRate[child] = p > 0 ? c / p : 0;
  }

  // 2 & 3. probability to subscription, anchored at return_visit
  const prob = {} as Record<FunnelStepKey, number>;
  // the monetization terminal itself is worth a full subscriber
  prob.subscription = 1;
  // walk upward from return_visit
  prob.return_visit = freeToPaidAnchor;
  for (let i = VALUE_CHAIN.indexOf("return_visit") - 1; i >= 0; i--) {
    const node = VALUE_CHAIN[i]!;
    const childBelow = VALUE_CHAIN[i + 1]!;
    prob[node] = (edgeRate[childBelow] ?? 0) * (prob[childBelow] ?? 0);
  }
  // nodes not on the valued chain default to 0 (we don't value them here)
  const allSteps: FunnelStepKey[] = [
    "impression", "click", "landing_visit", "signup", "dna_started", "dna_completed",
    "first_verdict", "successful_recommendation", "return_visit", "referral", "subscription",
  ];
  for (const s of allSteps) if (prob[s] === undefined) prob[s] = 0;

  // 4. node value in USD
  const nodeValueUsd = {} as Record<FunnelStepKey, number>;
  for (const s of allSteps) nodeValueUsd[s] = prob[s] * subscriberValueUsd;

  // monthly volumes scaled from the seed window
  const monthlyVolume = {} as Record<FunnelStepKey, number>;
  const scale = DAYS_PER_MONTH / SEED_DAYS_WINDOW;
  for (const s of allSteps) monthlyVolume[s] = Math.round((totals[s] ?? 0) * scale);

  return {
    product,
    edgeRate,
    probToSubscription: prob,
    nodeValueUsd,
    monthlyVolume,
    freeToPaidAnchor,
    subscriberValueUsd,
    isDemo: true,
  };
}

/** Convenience: value of one incremental unit at a node. */
export function nodeValue(graph: KpiGraph, node: FunnelStepKey): number {
  return graph.nodeValueUsd[node] ?? 0;
}
