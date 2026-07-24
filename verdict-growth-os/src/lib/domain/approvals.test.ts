import { describe, expect, it } from "vitest";
import {
  ALWAYS_REQUIRE_APPROVAL,
  ApprovalError,
  assertExecutable,
  canExecute,
  canTransition,
  requiresApproval,
  transition,
} from "@/lib/domain/approvals";
import type { ApprovalRequest } from "@/lib/types";

function req(over: Partial<ApprovalRequest>): ApprovalRequest {
  return {
    id: "a", product: "watchverdict", actionType: "public_social_post", proposedAction: "x",
    evidence: [], expectedImpact: "y", risk: "low", costUsd: 0, reversibility: "reversible",
    generatedContent: null, requestedApprover: "founder", decision: "pending", decisionReason: null,
    executionResult: null, createdAt: "2026-07-24T00:00:00.000Z", decidedAt: null, ...over,
  };
}

describe("requiresApproval (default-deny)", () => {
  it("requires approval for every externally-visible action type", () => {
    for (const t of ALWAYS_REQUIRE_APPROVAL) expect(requiresApproval(t)).toBe(true);
  });
  it("requires approval for unknown action types", () => {
    expect(requiresApproval("some_new_action")).toBe(true);
  });
  it("allows only explicitly safe internal actions", () => {
    expect(requiresApproval("internal_analysis")).toBe(false);
    expect(requiresApproval("draft_generation")).toBe(false);
  });
});

describe("assertExecutable", () => {
  it("permits execution only when approved", () => {
    expect(() => assertExecutable(req({ decision: "approved" }))).not.toThrow();
    expect(canExecute(req({ decision: "approved" }))).toBe(true);
  });
  it("blocks pending, rejected, executed, failed", () => {
    for (const decision of ["pending", "rejected", "executed", "failed"] as const) {
      expect(() => assertExecutable(req({ decision }))).toThrow(ApprovalError);
      expect(canExecute(req({ decision }))).toBe(false);
    }
  });
  it("blocks double execution with an already_executed code", () => {
    try {
      assertExecutable(req({ decision: "executed" }));
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as ApprovalError).code).toBe("already_executed");
    }
  });
});

describe("transition state machine", () => {
  it("allows legal transitions", () => {
    expect(canTransition("pending", "approved")).toBe(true);
    expect(canTransition("pending", "rejected")).toBe(true);
    expect(canTransition("approved", "executed")).toBe(true);
  });
  it("forbids illegal transitions", () => {
    expect(canTransition("rejected", "approved")).toBe(false);
    expect(canTransition("executed", "approved")).toBe(false);
    expect(canTransition("pending", "executed")).toBe(false);
  });
  it("throws on an illegal transition and records decidedAt on approve", () => {
    expect(() => transition(req({ decision: "rejected" }), "approved", "2026-07-24T01:00:00.000Z")).toThrow(ApprovalError);
    const approved = transition(req({ decision: "pending" }), "approved", "2026-07-24T01:00:00.000Z", "ok");
    expect(approved.decision).toBe("approved");
    expect(approved.decidedAt).toBe("2026-07-24T01:00:00.000Z");
    expect(approved.decisionReason).toBe("ok");
  });
});
