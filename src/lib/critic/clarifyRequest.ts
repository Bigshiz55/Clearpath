/**
 * READING A CLARIFICATION ANSWER OFF THE WIRE.
 *
 * The pending comparison travels to the client and back, exactly as the
 * conversation state already does: there is no server-side store, so nothing
 * can leak between users and a stale tab cannot resurrect someone else's turn.
 *
 * THE ECHOED ENVELOPE IS UNTRUSTED INPUT. It is shaped by whoever holds the
 * page, so every field is validated and bounded here rather than believed. The
 * worst a forged envelope can do is compare against a title the sender chose,
 * which is precisely what typing that title would have done anyway — but it may
 * not become a way to smuggle unbounded arrays or odd types into the pipeline.
 *
 * PURE. No I/O.
 */

import type { CriticRelation } from './objective';
import type { Modifiers } from './plan';
import type { CarriedAnchor, ClarificationChoice, PendingAnchor, PendingComparison } from './clarify';

export { needsClarification, applyChoice, isSettled, rankOptions, MAX_CLARIFY_OPTIONS } from './clarify';
export type { PendingComparison, ClarificationChoice } from './clarify';

const RELATIONS: readonly CriticRelation[] = ['like', 'better_than', 'like_but', 'blend'];
const MAX_ANCHORS = 4;
const MAX_NAME = 120;

const str = (v: unknown, max = MAX_NAME): string | null =>
  typeof v === 'string' && v.trim().length > 0 ? v.trim().slice(0, max) : null;

const mediaType = (v: unknown): 'movie' | 'tv' | null =>
  v === 'movie' || v === 'tv' ? v : null;

const tmdbId = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v > 0 && v < 1e9 ? v : null;

function anchor(v: unknown): CarriedAnchor | null {
  const o = v as Partial<CarriedAnchor> | null;
  if (!o || typeof o !== 'object') return null;
  const spokenAs = str(o.spokenAs);
  const id = tmdbId(o.tmdbId);
  const mt = mediaType(o.mediaType);
  return spokenAs && id != null && mt ? { spokenAs, tmdbId: id, mediaType: mt } : null;
}

function pendingAnchor(v: unknown): PendingAnchor | null {
  const o = v as Partial<PendingAnchor> | null;
  if (!o || typeof o !== 'object') return null;
  const spokenAs = str(o.spokenAs);
  if (!spokenAs) return null;
  const reason = o.reason === 'not_found' ? 'not_found' : 'ambiguous';
  /* Options are only ever redisplayed, never trusted as identity — the CHOICE
     carries the id that matters — so they are bounded and otherwise ignored. */
  return { spokenAs, reason, options: [] };
}

function modifiers(v: unknown): Modifiers {
  const out: Modifiers = {};
  if (!v || typeof v !== 'object') return out;
  for (const [k, val] of Object.entries(v as Record<string, unknown>).slice(0, 8)) {
    if (val === 'higher' || val === 'lower') out[k.slice(0, 40)] = val;
  }
  return out;
}

export function sanitizePendingComparison(v: unknown): PendingComparison | null {
  const o = v as Partial<PendingComparison> | null;
  if (!o || typeof o !== 'object') return null;
  const relation = RELATIONS.find((r) => r === o.relation);
  if (!relation) return null;
  const resolved = (Array.isArray(o.resolved) ? o.resolved : [])
    .map(anchor)
    .filter((a): a is CarriedAnchor => a !== null)
    .slice(0, MAX_ANCHORS);
  const pending = (Array.isArray(o.pending) ? o.pending : [])
    .map(pendingAnchor)
    .filter((p): p is PendingAnchor => p !== null)
    .slice(0, MAX_ANCHORS);
  if (resolved.length === 0 && pending.length === 0) return null;
  return {
    text: str(o.text, 300) ?? '',
    relation,
    modifiers: modifiers(o.modifiers),
    unresolvedModifiers: (Array.isArray(o.unresolvedModifiers) ? o.unresolvedModifiers : [])
      .map((x) => str(x, 60))
      .filter((x): x is string => x !== null)
      .slice(0, 4),
    resolved,
    pending,
  };
}

export function sanitizeChoice(v: unknown): ClarificationChoice | null {
  return anchor(v);
}

/**
 * A clarification answer, or null when this is an ordinary request.
 *
 * Both halves must be present and valid: an envelope with no choice is not an
 * answer, and a choice with no envelope has nothing to resume.
 */
export function readClarification(
  body: unknown,
): { comparison: PendingComparison; choice: ClarificationChoice } | null {
  const b = body as { pendingComparison?: unknown; comparisonChoice?: unknown } | null;
  if (!b || typeof b !== 'object') return null;
  const comparison = sanitizePendingComparison(b.pendingComparison);
  const choice = sanitizeChoice(b.comparisonChoice);
  return comparison && choice ? { comparison, choice } : null;
}
