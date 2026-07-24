/**
 * Product registry.
 *
 * The two products Verdict Growth OS exists to grow. This is configuration, not
 * live data — production URLs/repos are declared here but the OS never claims a
 * deployment is healthy without evidence from an adapter.
 */
import type { Product } from "@/lib/types";

export const PRODUCTS: Record<string, Product> = {
  watchverdict: {
    id: "watchverdict",
    name: "WatchVerdict",
    productionUrl: "https://watchverdict.app",
    repository: "Bigshiz55/Clearpath",
    deploymentProvider: "Vercel",
    analyticsSource: "mock:analytics (real provider TBD)",
    databaseSource: "Supabase (WatchVerdict project)",
    lifecycleStage: "early_traction",
    revenueModel: "Freemium → monthly subscription",
    primaryActivationEvent: "Watch DNA completed",
    primaryRetentionEvent: "Return verdict within 7 days",
    coreFunnel: [
      "impression",
      "click",
      "landing_visit",
      "signup",
      "dna_started",
      "dna_completed",
      "first_verdict",
      "successful_recommendation",
      "return_visit",
      "referral",
      "subscription",
    ],
    goals: [
      {
        id: "wv-goal-activation",
        product: "watchverdict",
        metric: "DNA completion rate",
        target: 0.6,
        current: 0.41,
        unit: "ratio",
        dueBy: "2026-09-30T00:00:00.000Z",
      },
      {
        id: "wv-goal-mrr",
        product: "watchverdict",
        metric: "MRR",
        target: 5000,
        current: 1840,
        unit: "usd",
        dueBy: "2026-12-31T00:00:00.000Z",
      },
    ],
    costLimits: { dailyLlmUsdCeiling: 5, dailyJobRunCeiling: 500, maxAiCostPerActiveUserUsd: 0.05 },
    accent: "watch",
  },
  readverdict: {
    id: "readverdict",
    name: "ReadVerdict",
    productionUrl: "https://readverdict.app",
    repository: "Bigshiz55/ReadVerdict",
    deploymentProvider: "Vercel",
    analyticsSource: "mock:analytics (real provider TBD)",
    databaseSource: "Supabase (ReadVerdict project)",
    lifecycleStage: "pre_launch",
    revenueModel: "Freemium → monthly subscription + WatchVerdict bundle",
    primaryActivationEvent: "Reader DNA completed",
    primaryRetentionEvent: "Return verdict within 14 days",
    coreFunnel: [
      "impression",
      "click",
      "landing_visit",
      "signup",
      "dna_started",
      "dna_completed",
      "first_verdict",
      "successful_recommendation",
      "return_visit",
      "referral",
      "subscription",
    ],
    goals: [
      {
        id: "rv-goal-waitlist",
        product: "readverdict",
        metric: "Launch waitlist signups",
        target: 2000,
        current: 315,
        unit: "count",
        dueBy: "2026-10-15T00:00:00.000Z",
      },
    ],
    costLimits: { dailyLlmUsdCeiling: 3, dailyJobRunCeiling: 300, maxAiCostPerActiveUserUsd: 0.05 },
    accent: "read",
  },
};

export const PRODUCT_LIST: Product[] = Object.values(PRODUCTS);

export function getProduct(id: string): Product | undefined {
  return PRODUCTS[id];
}
