import { describe, expect, it } from "vitest";
import { buildAuditEvent, isValidTimestamp } from "@/lib/domain/audit";

const base = {
  id: "a1", at: "2026-07-24T00:00:00.000Z", actor: "founder", action: "approval.approved",
  entityType: "approval", entityId: "apr-1", product: "watchverdict" as const,
};

describe("buildAuditEvent", () => {
  it("builds a complete event with defaulted metadata", () => {
    const e = buildAuditEvent(base);
    expect(e.metadata).toEqual({});
    expect(e.action).toBe("approval.approved");
  });
  it("preserves supplied metadata", () => {
    const e = buildAuditEvent({ ...base, metadata: { reason: "ok" } });
    expect(e.metadata).toEqual({ reason: "ok" });
  });
  it("requires actor, action, entityType, entityId", () => {
    expect(() => buildAuditEvent({ ...base, actor: "" })).toThrow();
    expect(() => buildAuditEvent({ ...base, action: "" })).toThrow();
    expect(() => buildAuditEvent({ ...base, entityType: "" })).toThrow();
    expect(() => buildAuditEvent({ ...base, entityId: "" })).toThrow();
  });
  it("rejects an invalid timestamp", () => {
    expect(() => buildAuditEvent({ ...base, at: "not-a-date" })).toThrow();
  });
});

describe("isValidTimestamp", () => {
  it("accepts ISO strings and rejects garbage", () => {
    expect(isValidTimestamp("2026-07-24T00:00:00.000Z")).toBe(true);
    expect(isValidTimestamp("nope")).toBe(false);
  });
});
