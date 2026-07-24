/**
 * Audit-event construction — PURE. No I/O.
 *
 * Architecture rule 5: every automated action must create an audit record.
 * This builds a well-formed, provenance-complete AuditEvent. Persistence is the
 * store's job; construction and validation are here so they can be unit-tested.
 */
import type { AuditEvent, ProductId } from "@/lib/types";

export interface AuditInput {
  id: string;
  at: string;
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  product: ProductId | "shared";
  metadata?: Record<string, unknown>;
}

export function buildAuditEvent(input: AuditInput): AuditEvent {
  if (!input.actor) throw new Error("audit: actor is required");
  if (!input.action) throw new Error("audit: action is required");
  if (!input.entityType) throw new Error("audit: entityType is required");
  if (!input.entityId) throw new Error("audit: entityId is required");
  if (!isValidTimestamp(input.at)) throw new Error("audit: `at` must be a valid ISO timestamp");
  return {
    id: input.id,
    at: input.at,
    actor: input.actor,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    product: input.product,
    metadata: input.metadata ?? {},
  };
}

export function isValidTimestamp(s: string): boolean {
  return typeof s === "string" && !Number.isNaN(Date.parse(s));
}
