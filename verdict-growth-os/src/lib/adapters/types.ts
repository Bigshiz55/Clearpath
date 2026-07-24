/**
 * Provider adapter interfaces.
 *
 * Architecture rule 3: external systems are reached ONLY through these
 * interfaces so a provider can be swapped without touching domain logic or UI.
 * v1 ships mock implementations (see ./mock). Every adapter is READ-ONLY or
 * DRAFT-ONLY in v1 — none performs an externally visible or financial write.
 *
 * Adapters return data already stamped with Provenance so the OS can honor the
 * "never present as production truth" rule.
 */
import type {
  CostSnapshot,
  DeploymentRecord,
  FunnelDay,
  IncidentRecord,
  Opportunity,
  ProductId,
  PullRequestRecord,
  RevenueSnapshot,
} from "@/lib/types";

export interface AdapterMeta {
  /** Human label shown on the Integrations page. */
  name: string;
  /** "mock" until real credentials are wired. Drives the UI health badge. */
  mode: "mock" | "live";
  /** Present for live adapters only. */
  lastSyncedAt?: string | null;
}

export interface AnalyticsAdapter {
  meta: AdapterMeta;
  /** Daily funnel counts for a product over the last `days`. */
  getFunnelDays(product: ProductId, days: number): Promise<FunnelDay[]>;
}

export interface GitHubAdapter {
  meta: AdapterMeta;
  listPullRequests(product: ProductId): Promise<PullRequestRecord[]>;
  listDeployments(product: ProductId): Promise<DeploymentRecord[]>;
  listIncidents(product: ProductId): Promise<IncidentRecord[]>;
}

export interface RevenueAdapter {
  meta: AdapterMeta;
  getRevenueSnapshot(product: ProductId): Promise<RevenueSnapshot>;
  getCostSnapshot(product: ProductId): Promise<CostSnapshot>;
}

/**
 * Social/outreach adapter. v1 exposes ONLY read + draft. There is deliberately
 * no `publish` method — auto-posting is out of scope until the Approval Center
 * executes it through a separately-audited path.
 */
export interface SocialAdapter {
  meta: AdapterMeta;
  discoverOpportunities(product: ProductId): Promise<Opportunity[]>;
}

export interface AdapterBundle {
  analytics: AnalyticsAdapter;
  github: GitHubAdapter;
  revenue: RevenueAdapter;
  social: SocialAdapter;
}
