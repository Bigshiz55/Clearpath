/**
 * Approval enforcement — PURE. No I/O.
 *
 * Architecture rule 6: every externally visible or financially consequential
 * action must initially require human approval. This module is the single
 * source of truth for (a) whether an action needs approval and (b) whether a
 * given approval record is in a state that permits execution.
 *
 * The state machine is intentionally strict: an action may only be executed
 * from the `approved` decision, exactly once.
 */
import type { ApprovalActionType, ApprovalDecision, ApprovalRequest } from "@/lib/types";

/**
 * Action types that ALWAYS require human approval in v1. This is a denylist by
 * design: if a new externally-visible action type is added and someone forgets
 * to classify it, `requiresApproval` still defaults to requiring approval.
 */
export const ALWAYS_REQUIRE_APPROVAL: ReadonlySet<ApprovalActionType> = new Set([
  "public_social_post",
  "paid_campaign",
  "budget_increase",
  "influencer_outreach",
  "journalist_outreach",
  "partnership_outreach",
  "customer_email",
  "pricing_change",
  "production_deployment",
  "major_experiment",
  "data_deletion",
  "policy_sensitive",
]);

/**
 * Only these are considered safe to run without a human in v1: purely
 * internal, reversible, non-financial reads/analyses. Anything not on this
 * allowlist requires approval.
 */
const AUTO_SAFE_ACTIONS: ReadonlySet<string> = new Set([
  "internal_analysis",
  "draft_generation",
  "metric_refresh",
  "observation_ingest",
]);

export function requiresApproval(actionType: string): boolean {
  if (AUTO_SAFE_ACTIONS.has(actionType)) return false;
  // Default-deny: unknown or listed externally-visible actions need approval.
  return true;
}

export class ApprovalError extends Error {
  constructor(
    message: string,
    readonly code:
      | "not_approved"
      | "already_executed"
      | "rejected"
      | "wrong_state",
  ) {
    super(message);
    this.name = "ApprovalError";
  }
}

/**
 * Guard that must be called immediately before any adapter executes an
 * approval-gated action. Throws `ApprovalError` if execution is not permitted.
 */
export function assertExecutable(req: ApprovalRequest): void {
  switch (req.decision) {
    case "approved":
      return;
    case "pending":
      throw new ApprovalError("Action is pending approval.", "not_approved");
    case "rejected":
      throw new ApprovalError("Action was rejected.", "rejected");
    case "executed":
      throw new ApprovalError("Action was already executed.", "already_executed");
    case "failed":
      throw new ApprovalError("Action previously failed; needs re-approval.", "wrong_state");
    default:
      throw new ApprovalError("Unknown approval state.", "wrong_state");
  }
}

export function canExecute(req: ApprovalRequest): boolean {
  return req.decision === "approved";
}

/** Valid decision transitions. Enforced by `transition`. */
const TRANSITIONS: Record<ApprovalDecision, ApprovalDecision[]> = {
  pending: ["approved", "rejected"],
  approved: ["executed", "failed"],
  rejected: [],
  executed: [],
  failed: ["pending"],
};

export function canTransition(from: ApprovalDecision, to: ApprovalDecision): boolean {
  return TRANSITIONS[from].includes(to);
}

export function transition(
  req: ApprovalRequest,
  to: ApprovalDecision,
  at: string,
  reason?: string,
): ApprovalRequest {
  if (!canTransition(req.decision, to)) {
    throw new ApprovalError(`Illegal transition ${req.decision} -> ${to}.`, "wrong_state");
  }
  return {
    ...req,
    decision: to,
    decisionReason: reason ?? req.decisionReason ?? null,
    decidedAt: to === "approved" || to === "rejected" ? at : req.decidedAt ?? null,
  };
}
