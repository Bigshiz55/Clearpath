/**
 * Executive briefing assembly — PURE. No I/O.
 *
 * Composes the command-center homepage answer to: what grew, what declined,
 * what's broken, what opportunities appeared, what threatens revenue, and the
 * top actions today. Takes already-fetched data and produces a view model.
 */
import type {
  IncidentRecord,
  Observation,
  Opportunity,
  Recommendation,
  Timestamp,
} from "@/lib/types";
import { rankOpportunities } from "@/lib/domain/scoring";
import { topActions, type RankedRecommendation } from "@/lib/domain/ranking";

export interface BriefingInput {
  now: Timestamp;
  observations: Observation[];
  opportunities: Opportunity[];
  recommendations: Recommendation[];
  incidents: IncidentRecord[];
}

export interface Briefing {
  grew: Observation[];
  declined: Observation[];
  broken: IncidentRecord[];
  newOpportunities: Opportunity[];
  revenueThreats: Observation[];
  topActions: RankedRecommendation[];
  generatedAt: Timestamp;
}

const REVENUE_METRIC_HINTS = ["mrr", "arr", "churn", "conversion", "subscription", "revenue", "cac"];

export function buildBriefing(input: BriefingInput): Briefing {
  const grew = input.observations
    .filter((o) => o.direction === "up")
    .sort((a, b) => b.severity - a.severity);

  const declined = input.observations
    .filter((o) => o.direction === "down")
    .sort((a, b) => b.severity - a.severity);

  const broken = input.incidents
    .filter((i) => i.status !== "resolved")
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity));

  const revenueThreats = declined.filter((o) =>
    REVENUE_METRIC_HINTS.some((h) => o.metric.toLowerCase().includes(h) || o.summary.toLowerCase().includes(h)),
  );

  const newOpportunities = rankOpportunities(input.opportunities).slice(0, 5);

  return {
    grew: grew.slice(0, 5),
    declined: declined.slice(0, 5),
    broken,
    newOpportunities,
    revenueThreats,
    topActions: topActions(input.recommendations, input.now, 5),
    generatedAt: input.now,
  };
}

function severityRank(s: IncidentRecord["severity"]): number {
  return s === "sev1" ? 0 : s === "sev2" ? 1 : 2;
}
