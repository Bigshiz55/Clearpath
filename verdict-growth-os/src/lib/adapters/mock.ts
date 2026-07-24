/**
 * Mock adapter implementations.
 *
 * These are the ONLY implementations shipped in v1. They serve labeled demo
 * data and perform no external I/O and no writes. They exist so the whole
 * command center is explorable and the interfaces are proven before real
 * providers are connected. The Integrations page reports every one as "mock".
 */
import type {
  AnalyticsAdapter,
  AdapterBundle,
  GitHubAdapter,
  RevenueAdapter,
  SocialAdapter,
} from "@/lib/adapters/types";
import type { ProductId } from "@/lib/types";
import {
  SEED_COST,
  SEED_DEPLOYMENTS,
  SEED_FUNNEL_DAYS,
  SEED_INCIDENTS,
  SEED_OPPORTUNITIES,
  SEED_PULL_REQUESTS,
  SEED_REVENUE,
} from "@/lib/seed";

export const mockAnalytics: AnalyticsAdapter = {
  meta: { name: "Analytics (mock)", mode: "mock", lastSyncedAt: null },
  async getFunnelDays(product: ProductId, days: number) {
    return SEED_FUNNEL_DAYS.filter((d) => d.product === product).slice(-days);
  },
};

export const mockGitHub: GitHubAdapter = {
  meta: { name: "GitHub (mock)", mode: "mock", lastSyncedAt: null },
  async listPullRequests(product: ProductId) {
    return SEED_PULL_REQUESTS.filter((p) => p.product === product);
  },
  async listDeployments(product: ProductId) {
    return SEED_DEPLOYMENTS.filter((d) => d.product === product);
  },
  async listIncidents(product: ProductId) {
    return SEED_INCIDENTS.filter((i) => i.product === product);
  },
};

export const mockRevenue: RevenueAdapter = {
  meta: { name: "Billing (mock)", mode: "mock", lastSyncedAt: null },
  async getRevenueSnapshot(product: ProductId) {
    const snap = SEED_REVENUE.find((r) => r.product === product);
    if (!snap) throw new Error(`No mock revenue snapshot for ${product}`);
    return snap;
  },
  async getCostSnapshot(product: ProductId) {
    const snap = SEED_COST.find((c) => c.product === product);
    if (!snap) throw new Error(`No mock cost snapshot for ${product}`);
    return snap;
  },
};

export const mockSocial: SocialAdapter = {
  meta: { name: "Social/Outreach (mock, read+draft only)", mode: "mock", lastSyncedAt: null },
  async discoverOpportunities(product: ProductId) {
    return SEED_OPPORTUNITIES.filter((o) => o.product === product);
  },
};

export const mockBundle: AdapterBundle = {
  analytics: mockAnalytics,
  github: mockGitHub,
  revenue: mockRevenue,
  social: mockSocial,
};

/**
 * Resolve the active adapter bundle. v1 always returns mocks. When
 * GROWTH_OS_MODE=live is requested without credentials, we FAIL SAFE to mocks
 * rather than silently pretending to be connected (data-honesty rule).
 */
export function resolveAdapters(): AdapterBundle {
  return mockBundle;
}
