/**
 * In-memory data store for v1.
 *
 * The command center reads from here so the whole app runs with zero external
 * dependencies (no Supabase required for local dev / build / demo). The Supabase
 * schema in supabase/migrations/0001_init.sql is the persistence target for the
 * next phase; the shapes are identical, so swapping this module for a Supabase
 * repository is a drop-in change behind the same functions.
 *
 * State is per-process and resets on restart — appropriate for a mock/demo tier.
 */
import type { ApprovalDecision, ApprovalRequest, AuditEvent } from "@/lib/types";
import { transition } from "@/lib/domain/approvals";
import { buildAuditEvent } from "@/lib/domain/audit";
import {
  SEED_APPROVALS,
  SEED_AUDIT,
  SEED_CAMPAIGNS,
  SEED_COST,
  SEED_EXPERIMENTS,
  SEED_FEEDBACK,
  SEED_INCIDENTS,
  SEED_JOBS,
  SEED_OBSERVATIONS,
  SEED_OPPORTUNITIES,
  SEED_PLANS,
  SEED_RECOMMENDATIONS,
  SEED_REVENUE,
} from "@/lib/seed";

// Mutable copies so approvals can be decided during a session.
interface Db {
  approvals: ApprovalRequest[];
  audit: AuditEvent[];
}

// Persist across hot-reloads in dev via globalThis.
const g = globalThis as unknown as { __growthDb?: Db };
function db(): Db {
  if (!g.__growthDb) {
    g.__growthDb = {
      approvals: SEED_APPROVALS.map((a) => ({ ...a })),
      audit: SEED_AUDIT.map((a) => ({ ...a })),
    };
  }
  return g.__growthDb;
}

// ── Read-only seed passthroughs ──────────────────────────────────────────────
export const store = {
  observations: () => SEED_OBSERVATIONS,
  opportunities: () => SEED_OPPORTUNITIES,
  recommendations: () => SEED_RECOMMENDATIONS,
  campaigns: () => SEED_CAMPAIGNS,
  experiments: () => SEED_EXPERIMENTS,
  incidents: () => SEED_INCIDENTS,
  feedback: () => SEED_FEEDBACK,
  revenue: () => SEED_REVENUE,
  cost: () => SEED_COST,
  plans: () => SEED_PLANS,
  jobs: () => SEED_JOBS,
  approvals: () => db().approvals,
  audit: () => [...db().audit].sort((a, b) => b.at.localeCompare(a.at)),
};

// ── Approval mutations (the one interactive write path in v1) ────────────────

let auditSeq = 1000;
function nextAuditId(): string {
  auditSeq += 1;
  return `aud-${auditSeq}`;
}

/**
 * Decide an approval and record an audit event. Uses the pure `transition`
 * guard so illegal state changes throw. `at` is injected for determinism/testing.
 */
export function decideApproval(
  id: string,
  decision: Extract<ApprovalDecision, "approved" | "rejected">,
  reason: string,
  actor = "founder",
  at: string = new Date().toISOString(),
): ApprovalRequest {
  const d = db();
  const idx = d.approvals.findIndex((a) => a.id === id);
  if (idx < 0) throw new Error(`Approval not found: ${id}`);
  const before = d.approvals[idx]!;
  const after = transition(before, decision, at, reason);
  d.approvals[idx] = after;
  d.audit.push(
    buildAuditEvent({
      id: nextAuditId(),
      at,
      actor,
      action: `approval.${decision}`,
      entityType: "approval",
      entityId: id,
      product: after.product,
      metadata: { reason, actionType: after.actionType },
    }),
  );
  return after;
}
