/**
 * THE DETERMINISTIC VALIDATOR — the reason AI cannot invent a listing.
 *
 * AI may normalize, match and dedupe. It may not originate facts. This module
 * is the enforcement: every claimed field must be traceable to the raw source
 * payload, or the claim is rejected. Nothing reaches the database that did not
 * come from somewhere we can point at.
 *
 * Pure by design. It takes the extracted claim and the raw text it was
 * supposedly extracted from, and answers one question: is this actually in
 * there? A normalizer that "helpfully" fills a missing date fails here.
 */

/** Fields that must never be invented — each is separately traceable. */
export type TraceableField =
  | 'date'
  | 'time'
  | 'service'
  | 'channel'
  | 'title'
  | 'episode'
  | 'season'
  | 'subscriptionState'
  | 'premiereStatus'
  | 'availability'
  | 'watchLink';

export interface FieldClaim {
  field: TraceableField;
  /** The normalized value we intend to store. */
  value: string;
  /**
   * The exact substring of the source the value was derived from. A normalizer
   * that cannot produce this has not extracted — it has guessed.
   */
  evidence: string | null;
}

export interface ValidationResult {
  accepted: FieldClaim[];
  rejected: Array<FieldClaim & { reason: string }>;
  ok: boolean;
}

/** Loose containment: normalization may reformat, but the evidence must be present verbatim. */
function evidencePresent(raw: string, evidence: string): boolean {
  if (!evidence.trim()) return false;
  return raw.toLowerCase().includes(evidence.trim().toLowerCase());
}

/**
 * Rejects any claim whose evidence is missing from the raw payload. A rejected
 * field is dropped, never defaulted — a missing date stays missing, because a
 * plausible-looking wrong date is worse than no date.
 */
export function validateClaims(rawSource: string, claims: FieldClaim[]): ValidationResult {
  const accepted: FieldClaim[] = [];
  const rejected: Array<FieldClaim & { reason: string }> = [];

  for (const c of claims) {
    if (c.evidence === null) {
      rejected.push({ ...c, reason: `${c.field} has no source evidence — not extracted, inferred.` });
      continue;
    }
    if (!evidencePresent(rawSource, c.evidence)) {
      rejected.push({ ...c, reason: `${c.field} evidence not found in the source payload.` });
      continue;
    }
    accepted.push(c);
  }

  return { accepted, rejected, ok: rejected.length === 0 };
}

/**
 * A claim from one source about one field, kept whole so a conflict can be
 * shown rather than silently resolved.
 */
export interface SourcedClaim {
  sourceKey: string;
  authority: number;
  value: string;
  sourceUrl: string;
  retrievedAt: string;
  confidence: number;
}

export interface ConflictRecord {
  field: TraceableField;
  claims: SourcedClaim[];
  /** Highest-authority claim — a DISPLAY preference, not a resolution. */
  leading: SourcedClaim;
  needsReview: boolean;
}

/**
 * When sources disagree, keep every claim. Authority ranks them for display;
 * it never deletes the losers, and a real disagreement always goes to review.
 * Silently picking one is how a guide starts lying confidently.
 */
export function preserveConflict(field: TraceableField, claims: SourcedClaim[]): ConflictRecord | null {
  if (claims.length === 0) return null;
  const distinct = new Set(claims.map((c) => c.value.trim().toLowerCase()));
  const ranked = [...claims].sort((a, b) => b.authority - a.authority || b.confidence - a.confidence);
  return {
    field,
    claims: ranked,
    leading: ranked[0]!,
    needsReview: distinct.size > 1,
  };
}
