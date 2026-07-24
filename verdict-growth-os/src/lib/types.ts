/**
 * Verdict Growth OS — shared domain types & enums.
 *
 * These mirror the Postgres schema in supabase/migrations/0001_init.sql.
 * Everything here is pure data — no I/O, no framework imports — so it can be
 * shared by the pure domain engine, the adapters, and the UI alike.
 */

// ── Shared primitives ────────────────────────────────────────────────────────

/** ISO-8601 timestamp string. */
export type Timestamp = string;

/** 0..1 confidence. Every derived/collected signal carries one. */
export type Confidence = number;

export type ProductId = "watchverdict" | "readverdict";

export type Department =
  | "growth"
  | "marketing"
  | "advertising"
  | "pr"
  | "partnerships"
  | "research"
  | "analytics"
  | "product"
  | "engineering"
  | "customer_success"
  | "revenue";

/**
 * Provenance is attached to every collected fact so nothing is ever presented
 * as production truth without an audit trail. Required by architecture rule 7.
 */
export interface Provenance {
  source: string;
  sourceUrl?: string | null;
  product: ProductId | "shared";
  collectedAt: Timestamp;
  confidence: Confidence;
  /** True for seed/demo data. The UI must label these; never present as real. */
  isDemo: boolean;
}

// ── Product registry ─────────────────────────────────────────────────────────

export type LifecycleStage =
  | "pre_launch"
  | "launched"
  | "early_traction"
  | "growth"
  | "scale";

export interface FunnelStepDef {
  key: FunnelStepKey;
  label: string;
}

export interface Product {
  id: ProductId;
  name: string;
  productionUrl: string;
  repository: string;
  deploymentProvider: string;
  analyticsSource: string;
  databaseSource: string;
  lifecycleStage: LifecycleStage;
  revenueModel: string;
  primaryActivationEvent: string;
  primaryRetentionEvent: string;
  coreFunnel: FunnelStepKey[];
  goals: ProductGoal[];
  costLimits: CostLimits;
  accent: "watch" | "read";
}

export interface ProductGoal {
  id: string;
  product: ProductId;
  metric: string;
  target: number;
  current: number;
  unit: string;
  dueBy: Timestamp;
}

export interface CostLimits {
  dailyLlmUsdCeiling: number;
  dailyJobRunCeiling: number;
  maxAiCostPerActiveUserUsd: number;
}

// ── Funnel & metrics ─────────────────────────────────────────────────────────

export type FunnelStepKey =
  | "impression"
  | "click"
  | "landing_visit"
  | "signup"
  | "dna_started"
  | "dna_completed"
  | "first_verdict"
  | "successful_recommendation"
  | "return_visit"
  | "referral"
  | "subscription";

export interface FunnelDay {
  product: ProductId;
  date: string; // YYYY-MM-DD
  counts: Record<FunnelStepKey, number>;
  provenance: Provenance;
}

// ── Observations → Opportunities → Recommendations → Actions ─────────────────

export type ObservationKind =
  | "metric_change"
  | "incident"
  | "community_signal"
  | "competitive_signal"
  | "cost_signal"
  | "revenue_signal";

export type Direction = "up" | "down" | "flat";

export interface Observation {
  id: string;
  product: ProductId | "shared";
  kind: ObservationKind;
  metric: string;
  summary: string;
  direction: Direction;
  /** Signed percentage change where meaningful (e.g. -18 = down 18%). */
  changePct?: number | null;
  severity: number; // 0..100
  provenance: Provenance;
}

export type OpportunityType =
  | "community_conversation"
  | "social_trend"
  | "creator"
  | "journalist_media"
  | "podcast"
  | "newsletter"
  | "seo"
  | "partnership"
  | "competitive_weakness"
  | "seasonal_campaign"
  | "complaint_pattern"
  | "product_led_growth";

export type Intent = "high" | "medium" | "low";
export type ApprovalState = "not_required" | "pending" | "approved" | "rejected";

export interface Opportunity {
  id: string;
  product: ProductId;
  type: OpportunityType;
  title: string;
  audience: string;
  intent: Intent;
  estimatedReach: number;
  competitiveDensity: number; // 0..1, higher = more crowded
  recommendedChannel: string;
  suggestedResponse: string;
  expectedOutcome: string;
  effort: Effort;
  risk: Risk;
  confidence: Confidence;
  approvalState: ApprovalState;
  outcome?: string | null;
  discoveredAt: Timestamp;
  provenance: Provenance;
  /** Populated by scoring engine; not persisted as source-of-truth. */
  score?: number;
}

export type Effort = "xs" | "s" | "m" | "l" | "xl";
export type Risk = "low" | "medium" | "high";

export interface Recommendation {
  id: string;
  product: ProductId;
  department: Department;
  problem: string;
  evidence: string[];
  recommendedAction: string;
  effort: Effort;
  expectedImpact: number; // 0..100 business-impact points
  confidence: Confidence;
  metricAffected: string;
  owner: string;
  approvalRequired: boolean;
  status: "proposed" | "queued" | "in_progress" | "done" | "dismissed";
  deadline: Timestamp;
  /** Optional link back to the opportunity/observation that generated it. */
  sourceOpportunityId?: string | null;
  createdAt: Timestamp;
  /** Populated by the ranking engine. */
  priorityScore?: number;
}

// ── Approvals ────────────────────────────────────────────────────────────────

export type ApprovalActionType =
  | "public_social_post"
  | "paid_campaign"
  | "budget_increase"
  | "influencer_outreach"
  | "journalist_outreach"
  | "partnership_outreach"
  | "customer_email"
  | "pricing_change"
  | "production_deployment"
  | "major_experiment"
  | "data_deletion"
  | "policy_sensitive";

export type ApprovalDecision = "pending" | "approved" | "rejected" | "executed" | "failed";
export type Reversibility = "reversible" | "partial" | "irreversible";

export interface ApprovalRequest {
  id: string;
  product: ProductId;
  actionType: ApprovalActionType;
  proposedAction: string;
  evidence: string[];
  expectedImpact: string;
  risk: Risk;
  costUsd: number;
  reversibility: Reversibility;
  generatedContent?: string | null;
  requestedApprover: string;
  decision: ApprovalDecision;
  decisionReason?: string | null;
  executionResult?: string | null;
  createdAt: Timestamp;
  decidedAt?: Timestamp | null;
}

// ── Campaigns ────────────────────────────────────────────────────────────────

export type CampaignStatus = "draft" | "in_review" | "approved" | "rejected" | "revision" | "archived";

export interface Campaign {
  id: string;
  product: ProductId;
  objective: string;
  audience: string;
  problemStatement: string;
  positioning: string;
  offer: string;
  channel: string;
  creativeConcept: string;
  hook: string;
  script: string;
  caption: string;
  thumbnailText: string;
  landingCopy: string;
  emailCopy: string;
  prPitch: string;
  creatorOutreach: string;
  redditResponse: string;
  variants: string[];
  trackingId: string;
  budgetUsd: number;
  status: CampaignStatus;
  approvalState: ApprovalState;
  createdAt: Timestamp;
}

// ── Experiments ──────────────────────────────────────────────────────────────

export interface Experiment {
  id: string;
  product: ProductId;
  hypothesis: string;
  funnelStep: FunnelStepKey;
  guardrailMetric: string;
  variants: ExperimentVariant[];
  status: "designing" | "running" | "concluded";
  decision?: string | null;
  createdAt: Timestamp;
}

export interface ExperimentVariant {
  key: string;
  label: string;
  exposures: number;
  conversions: number;
}

// ── Engineering ──────────────────────────────────────────────────────────────

export interface PullRequestRecord {
  id: string;
  product: ProductId;
  repository: string;
  number: number;
  title: string;
  state: "open" | "merged" | "closed";
  author: string;
  updatedAt: Timestamp;
  provenance: Provenance;
}

export interface DeploymentRecord {
  id: string;
  product: ProductId;
  environment: "production" | "preview";
  status: "success" | "failed" | "building";
  sha: string;
  createdAt: Timestamp;
  provenance: Provenance;
}

export interface IncidentRecord {
  id: string;
  product: ProductId;
  title: string;
  severity: "sev1" | "sev2" | "sev3";
  status: "open" | "mitigated" | "resolved";
  summary: string;
  createdAt: Timestamp;
  provenance: Provenance;
}

export interface CustomerFeedback {
  id: string;
  product: ProductId;
  kind: "bug" | "feature_request" | "complaint" | "praise";
  summary: string;
  count: number;
  createdAt: Timestamp;
  provenance: Provenance;
}

// ── Revenue & cost ───────────────────────────────────────────────────────────

export interface Plan {
  id: string;
  product: ProductId;
  name: string;
  priceUsdMonthly: number;
  trialDays: number;
}

export interface RevenueSnapshot {
  product: ProductId;
  date: string;
  mrrUsd: number;
  arrUsd: number;
  activeSubscriptions: number;
  trials: number;
  trialConversionPct: number;
  freeToPaidPct: number;
  churnPct: number;
  revenuePerActiveUserUsd: number;
  cacUsd: number;
  ltvUsd: number;
  provenance: Provenance;
}

export interface CostSnapshot {
  product: ProductId;
  date: string;
  llmCostUsd: number;
  infraCostUsd: number;
  activeUsers: number;
  provenance: Provenance;
}

// ── Jobs & audit ─────────────────────────────────────────────────────────────

export interface ScheduledJob {
  id: string;
  name: string;
  cron: string;
  costCeilingUsd: number;
  enabled: boolean;
}

export interface JobRun {
  jobId: string;
  /** Idempotency key — a repeat with the same key must not re-execute. */
  idempotencyKey: string;
  status: "running" | "succeeded" | "failed" | "skipped_duplicate" | "aborted_cost";
  startedAt: Timestamp;
  costUsd: number;
}

export interface AuditEvent {
  id: string;
  at: Timestamp;
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  product: ProductId | "shared";
  metadata: Record<string, unknown>;
}
