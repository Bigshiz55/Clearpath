/**
 * ΔEV DECISION LEDGER — DECISION-ENGINE PREVIEW (DEMONSTRATION ONLY).
 *
 * ⚠️  Labeled mock. Proves that heterogeneous work (a product fix, a TikTok
 *     campaign, a pricing change, a PR pitch…) can be ranked on ONE
 *     dollar-denominated axis — Expected Value (ΔEV) — before any real
 *     integration exists. All inputs are demonstration figures.
 *
 * Two value shapes (see docs/DECISION_ENGINE.md §"horizon"):
 *   • DURABLE rate improvement — a fix that lifts a funnel edge for every future
 *     cohort. ΔEV = monthlyPopulation × Δrate × value(childNode) × 12 × durability
 *   • ONE_SHOT bolus — a campaign that injects a one-time batch of units at a
 *     node. ΔEV = units × value(node) × durability
 *
 * Anti-double-count: each action names the SINGLE node it moves and is valued
 * with that node's downstream-to-subscription value. The revenue/retention/
 * acquisition "impacts" are a PARTITION of that one ΔEV by pathway (they sum to
 * ΔEV), never three independent additions.
 */
import type { ApprovalActionType, FunnelStepKey, Reversibility, Risk } from "@/lib/types";
import { buildWatchVerdictGraph, nodeValue, type KpiGraph } from "@/lib/decision-preview/kpiGraph";

export type ExecutiveSponsor =
  | "CPO" | "CGO" | "CMO" | "CRO" | "CTO" | "CCO" | "CDS" | "CPRO" | "CPartO" | "CFO";

export type Pathway = "acquisition" | "retention" | "revenue";

export interface ActionInput {
  id: string;
  title: string;
  sponsor: ExecutiveSponsor;
  kpi: string;                       // human label of the KPI moved
  node: FunnelStepKey;               // the single node whose value we use
  shape: "durable" | "one_shot";
  parentPopulationNode?: FunnelStepKey; // durable: whose monthly volume enters the edge
  baselineRate?: number;             // durable: current edge rate
  lift: { conservative: number; base: number; optimistic: number }; // durable: Δrate; one_shot: units
  durability: number;                // 0..1 decay/realization factor
  cashCostUsd: number;
  engDays: number;                   // capacity cost (NOT converted to $; it's a pool)
  timeToImpactWeeks: number;
  confidence: number;                // 0..1
  risk: Risk;
  reversibility: Reversibility;
  approval: { required: boolean; type?: ApprovalActionType };
  dependencies: string[];            // ids or notes
  /** partition of ΔEV by pathway; MUST sum to 1. Guards against double counting. */
  pathwaySplit: Record<Pathway, number>;
  /** CDS/Growth-Science estimate 0..1: how much the OUTCOME would update the
   *  model / change future allocation. Drives the value-of-information ranking. */
  strategicUncertaintyResolved: number;
  notes?: string;
}

export interface ScoredAction extends ActionInput {
  evUsd: { conservative: number; base: number; optimistic: number };
  /** partitioned VIEWS of base ΔEV — sum to evUsd.base, never additive beyond it. */
  impactViews: Record<Pathway, number>;
  baselineKpiLabel: string;
  populationAffected: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** ΔEV for a single case. */
function evForCase(a: ActionInput, graph: KpiGraph, liftValue: number): number {
  if (a.shape === "durable") {
    const pop = graph.monthlyVolume[a.parentPopulationNode ?? a.node] ?? 0;
    const childVal = nodeValue(graph, a.node);
    return pop * liftValue * childVal * 12 * a.durability;
  }
  // one_shot: liftValue is the number of incremental units at the node
  return liftValue * nodeValue(graph, a.node) * a.durability;
}

export function scoreAction(a: ActionInput, graph: KpiGraph): ScoredAction {
  const ev = {
    conservative: round2(evForCase(a, graph, a.lift.conservative)),
    base: round2(evForCase(a, graph, a.lift.base)),
    optimistic: round2(evForCase(a, graph, a.lift.optimistic)),
  };
  const impactViews: Record<Pathway, number> = {
    acquisition: round2(ev.base * a.pathwaySplit.acquisition),
    retention: round2(ev.base * a.pathwaySplit.retention),
    revenue: round2(ev.base * a.pathwaySplit.revenue),
  };
  const pop =
    a.shape === "durable"
      ? graph.monthlyVolume[a.parentPopulationNode ?? a.node] ?? 0
      : a.lift.base;
  const baselineKpiLabel =
    a.shape === "durable" && a.baselineRate !== undefined
      ? `${(a.baselineRate * 100).toFixed(0)}%`
      : "n/a (new volume)";
  return { ...a, evUsd: ev, impactViews, populationAffected: pop, baselineKpiLabel };
}

// ── The ten competing actions (DEMO inputs) ──────────────────────────────────
export const PREVIEW_ACTIONS: ActionInput[] = [
  {
    id: "act-dna-fix", title: "Fix DNA activation leak", sponsor: "CPO",
    kpi: "DNA completion rate", node: "dna_completed", shape: "durable",
    parentPopulationNode: "dna_started", baselineRate: 0.41,
    lift: { conservative: 0.07, base: 0.14, optimistic: 0.20 }, durability: 0.9,
    cashCostUsd: 0, engDays: 3, timeToImpactWeeks: 2, confidence: 0.7, risk: "low",
    reversibility: "reversible", approval: { required: true, type: "production_deployment" },
    dependencies: [], pathwaySplit: { acquisition: 0, retention: 0.3, revenue: 0.7 },
    strategicUncertaintyResolved: 0.5,
    notes: "Largest single funnel leak; converts already-acquired traffic.",
  },
  {
    id: "act-onboarding", title: "Improve onboarding completion", sponsor: "CPO",
    kpi: "Signup → DNA-start rate", node: "dna_started", shape: "durable",
    parentPopulationNode: "signup", baselineRate: 0.70,
    lift: { conservative: 0.05, base: 0.10, optimistic: 0.15 }, durability: 0.9,
    cashCostUsd: 0, engDays: 2, timeToImpactWeeks: 2, confidence: 0.65, risk: "low",
    reversibility: "reversible", approval: { required: true, type: "production_deployment" },
    dependencies: ["overlaps act-dna-fix (non-additive)"],
    pathwaySplit: { acquisition: 0, retention: 0.25, revenue: 0.75 },
    strategicUncertaintyResolved: 0.35,
  },
  {
    id: "act-tiktok", title: "Launch a TikTok campaign", sponsor: "CMO",
    kpi: "Incremental signups (one-shot)", node: "signup", shape: "one_shot",
    lift: { conservative: 120, base: 300, optimistic: 1500 }, durability: 1,
    cashCostUsd: 500, engDays: 0, timeToImpactWeeks: 1, confidence: 0.35, risk: "medium",
    reversibility: "partial", approval: { required: true, type: "public_social_post" },
    dependencies: [], pathwaySplit: { acquisition: 1, retention: 0, revenue: 0 },
    strategicUncertaintyResolved: 0.6,
    notes: "Top-of-funnel volume poured into a leaky funnel dilutes to little value.",
  },
  {
    id: "act-meta-paid", title: "Start a Meta paid acquisition test", sponsor: "CGO",
    kpi: "Incremental signups via paid (one-shot)", node: "signup", shape: "one_shot",
    lift: { conservative: 120, base: 194, optimistic: 260 }, durability: 1,
    cashCostUsd: 600, engDays: 0, timeToImpactWeeks: 1, confidence: 0.4, risk: "medium",
    reversibility: "reversible", approval: { required: true, type: "paid_campaign" },
    dependencies: [], pathwaySplit: { acquisition: 1, retention: 0, revenue: 0 },
    strategicUncertaintyResolved: 0.9,
    notes: "Direct ΔEV is negative, but it resolves the dominant strategic unknown: can PAID acquisition ever scale for us? Highest value-of-information.",
  },
  {
    id: "act-referral", title: "Build a referral loop", sponsor: "CGO",
    kpi: "Referral rate (k-factor)", node: "signup", shape: "durable",
    parentPopulationNode: "return_visit", baselineRate: 0.12,
    lift: { conservative: 0.04, base: 0.08, optimistic: 0.15 }, durability: 0.9,
    cashCostUsd: 0, engDays: 5, timeToImpactWeeks: 4, confidence: 0.45, risk: "low",
    reversibility: "reversible", approval: { required: false },
    dependencies: ["needs an activated/retained base first (act-dna-fix, act-retention-msg)"],
    pathwaySplit: { acquisition: 1, retention: 0, revenue: 0 },
    strategicUncertaintyResolved: 0.3,
    notes: "Right idea, wrong time — too small a retained base to refer from today.",
  },
  {
    id: "act-pricing", title: "Improve pricing or packaging", sponsor: "CRO",
    kpi: "Free → paid conversion (monetization multiplier)", node: "subscription", shape: "durable",
    parentPopulationNode: "signup", baselineRate: 0.041,
    // Monetization multiplier: `lift` is the EXTRA P(subscribe | signup) gained,
    // applied to the signup population and valued at full LTV (node=subscription).
    // Valuing at the subscription node (not an intermediate) is correct BECAUSE
    // pricing moves the terminal conversion directly — no downstream discount.
    lift: { conservative: 0.00020, base: 0.00048, optimistic: 0.00075 }, durability: 0.95,
    cashCostUsd: 0, engDays: 0, timeToImpactWeeks: 1, confidence: 0.5, risk: "medium",
    reversibility: "reversible", approval: { required: true, type: "pricing_change" },
    dependencies: [], pathwaySplit: { acquisition: 0, retention: 0, revenue: 1 },
    strategicUncertaintyResolved: 0.7,
    notes: "Permanent multiplier on every future dollar; raising LTV later is what unlocks paid acquisition.",
  },
  {
    id: "act-rec-quality", title: "Fix a recommendation-quality issue", sponsor: "CPO",
    kpi: "Successful-recommendation rate", node: "successful_recommendation", shape: "durable",
    parentPopulationNode: "first_verdict", baselineRate: 0.62,
    lift: { conservative: 0.05, base: 0.10, optimistic: 0.15 }, durability: 0.9,
    cashCostUsd: 0, engDays: 4, timeToImpactWeeks: 3, confidence: 0.6, risk: "low",
    reversibility: "reversible", approval: { required: true, type: "production_deployment" },
    dependencies: [], pathwaySplit: { acquisition: 0, retention: 0.45, revenue: 0.55 },
    strategicUncertaintyResolved: 0.4,
    notes: "Quality lifts both activation and downstream retention.",
  },
  {
    id: "act-creator", title: "Pursue a creator partnership", sponsor: "CPRO",
    kpi: "Incremental signups via creator (one-shot)", node: "signup", shape: "one_shot",
    lift: { conservative: 200, base: 500, optimistic: 1200 }, durability: 1,
    cashCostUsd: 400, engDays: 0, timeToImpactWeeks: 3, confidence: 0.4, risk: "medium",
    reversibility: "partial", approval: { required: true, type: "influencer_outreach" },
    dependencies: [], pathwaySplit: { acquisition: 1, retention: 0, revenue: 0 },
    strategicUncertaintyResolved: 0.5,
    notes: "Some brand/option value beyond ΔEV; still diluted by the funnel leak.",
  },
  {
    id: "act-pr", title: "Pursue a PR opportunity", sponsor: "CPRO",
    kpi: "Incremental signups via press (one-shot)", node: "signup", shape: "one_shot",
    lift: { conservative: 100, base: 300, optimistic: 800 }, durability: 1,
    cashCostUsd: 0, engDays: 0, timeToImpactWeeks: 3, confidence: 0.35, risk: "low",
    reversibility: "partial", approval: { required: true, type: "journalist_outreach" },
    dependencies: [], pathwaySplit: { acquisition: 1, retention: 0, revenue: 0 },
    strategicUncertaintyResolved: 0.4,
    notes: "Backlink/domain-authority option value is excluded from ΔEV (undervalued here).",
  },
  {
    id: "act-retention-msg", title: "Improve retention messaging", sponsor: "CCO",
    kpi: "Return-visit rate", node: "return_visit", shape: "durable",
    parentPopulationNode: "successful_recommendation", baselineRate: 0.45,
    lift: { conservative: 0.035, base: 0.07, optimistic: 0.12 }, durability: 0.9,
    cashCostUsd: 0, engDays: 0, timeToImpactWeeks: 1, confidence: 0.55, risk: "low",
    reversibility: "reversible", approval: { required: true, type: "customer_email" },
    dependencies: [], pathwaySplit: { acquisition: 0, retention: 0.75, revenue: 0.25 },
    strategicUncertaintyResolved: 0.35,
    notes: "No engineering; copy + lifecycle. Requires email approval.",
  },
];

// ── The CEO allocator ────────────────────────────────────────────────────────

export interface Ledger {
  graph: KpiGraph;
  actions: ScoredAction[]; // sorted by base ΔEV desc
}

export function buildPreviewLedger(): Ledger {
  const graph = buildWatchVerdictGraph();
  const actions = PREVIEW_ACTIONS.map((a) => scoreAction(a, graph)).sort(
    (x, y) => y.evUsd.base - x.evUsd.base,
  );
  return { graph, actions };
}

export interface AllocatorView {
  oneThing: ScoredAction;
  topFive: ScoredAction[];
  bestLowCash: ScoredAction;
  bestLowEngCapacity: ScoredAction;
  fastestLearning: ScoredAction;
  bestLongTerm: ScoredAction;
}

/** The seven CEO answers, all derived from the same ranked ledger. */
export function allocate(ledger: Ledger): AllocatorView {
  const byEv = [...ledger.actions].sort((a, b) => b.evUsd.base - a.evUsd.base);

  const oneThing = byEv[0]!;
  const topFive = byEv.slice(0, 5);

  // low cash: highest ΔEV among ~$0 cash actions
  const bestLowCash = byEv.filter((a) => a.cashCostUsd === 0)[0]!;

  // low eng capacity: highest ΔEV among actions needing 0 eng-days
  const bestLowEngCapacity = byEv.filter((a) => a.engDays === 0)[0]!;

  // fastest learning: highest VALUE-OF-INFORMATION per unit time — the action
  // whose outcome would most update the model, soonest. This is the EXPLORE
  // pick and is deliberately allowed to have negative direct ΔEV.
  const fastestLearning = [...byEv].sort(
    (a, b) =>
      b.strategicUncertaintyResolved / b.timeToImpactWeeks -
      a.strategicUncertaintyResolved / a.timeToImpactWeeks,
  )[0]!;

  // long-term EV: durable actions weighted by durability, revenue-pathway
  // (permanent multipliers) preferred; excludes one-shot campaigns.
  const bestLongTerm = [...byEv]
    .filter((a) => a.shape === "durable")
    .sort(
      (a, b) =>
        b.evUsd.base * b.durability * (1 + b.pathwaySplit.revenue) -
        a.evUsd.base * a.durability * (1 + a.pathwaySplit.revenue),
    )[0]!;

  return { oneThing, topFive, bestLowCash, bestLowEngCapacity, fastestLearning, bestLongTerm };
}

/** Why did a rejected (not top-five) action lose? One-line rationale. */
export function rejectionReason(a: ScoredAction, oneThing: ScoredAction): string {
  const ratio = oneThing.evUsd.base > 0 ? (a.evUsd.base / oneThing.evUsd.base) : 0;
  const pct = `${Math.round(ratio * 100)}% of the #1 action's ΔEV`;
  if (a.shape === "one_shot" && a.cashCostUsd > a.evUsd.base) {
    return `Costs $${a.cashCostUsd} to produce only $${a.evUsd.base} ΔEV (${pct}) — acquisition diluted by the funnel leak.`;
  }
  if (a.dependencies.some((d) => /needs|base first/i.test(d))) {
    return `Premature: ${a.dependencies[0]}. Only ${pct}.`;
  }
  return `Lower ΔEV (${pct}) at higher effort/uncertainty than the funded set.`;
}
