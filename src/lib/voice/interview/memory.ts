/**
 * INTERVIEW MEMORY.
 *
 * Every signal leaves a durable `Claim` the interviewer can recall later — to
 * dig back in ("earlier you mentioned…"), and, crucially, to catch a later
 * signal contradicting an earlier one. Claims dedupe on subject+sentiment,
 * keeping the strongest statement, so ten mumbles about horror collapse into the
 * one that mattered.
 *
 * Pure. No clock — a claim carries the turn the signal did.
 */
import type { Claim, TasteSignal } from './types';
import { normalizeSubject } from './categories';

/** Turn a signal into the durable claim it leaves behind. */
export function claimFromSignal(signal: TasteSignal): Claim {
  return {
    id: `claim:${signal.id}`,
    turn: signal.turn,
    subject: signal.subject,
    categories: [...(signal.categories ?? [])],
    sentiment: signal.sentiment,
    strength: signal.strength,
    ...(signal.raw !== undefined ? { raw: signal.raw } : {}),
  };
}

export interface RecallQuery {
  subject?: string;
  category?: Claim['categories'][number];
}

/**
 * Recall claims matching a subject (case-insensitive) and/or a category. With no
 * filter, returns all claims. Order is preserved (oldest first).
 */
export function recall(claims: Claim[], query: RecallQuery): Claim[] {
  const wantSubject = query.subject !== undefined ? normalizeSubject(query.subject) : null;
  return claims.filter((c) => {
    if (wantSubject !== null && normalizeSubject(c.subject) !== wantSubject) return false;
    if (query.category !== undefined && !c.categories.includes(query.category)) return false;
    return true;
  });
}

/** The dedupe key: a claim is "the same" if it is the same subject + sentiment. */
function claimKey(claim: Claim): string {
  return `${normalizeSubject(claim.subject)}|${claim.sentiment}`;
}

/**
 * Add a claim, deduped by subject+sentiment. When a claim with the same key
 * already exists the stronger of the two is kept (ties keep the incoming, later
 * one). Returns a NEW array; the input is never mutated.
 */
export function addClaim(claims: Claim[], claim: Claim): Claim[] {
  const key = claimKey(claim);
  const idx = claims.findIndex((c) => claimKey(c) === key);
  if (idx === -1) return [...claims, claim];
  const existing = claims[idx]!;
  const winner = claim.strength >= existing.strength ? claim : existing;
  const next = claims.slice();
  next[idx] = winner;
  return next;
}
