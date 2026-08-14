/**
 * WHAT CREDIT A SENTENCE ASKS FOR.
 *
 * ── WHY THIS IS NOT IN THE EXECUTION LAYER ────────────────────────────────
 * It was, and that was the defect. `requestedRoleFor` shipped inside
 * `people/constraint.ts` — regexes over user prose living in the module whose
 * entire job is to EXECUTE a decision already made. That is the
 * parallel-semantics problem this codebase keeps paying for, installed one
 * layer lower than usual: two places would read the same words, and the one
 * closest to TMDB would quietly win.
 *
 * So the boundary is: language is read HERE and a TYPED role crosses into
 * execution. `people/constraint.ts` cannot infer a role, and a test asserts it
 * has no prose in it at all.
 *
 * ── AND WHY IT IS NOT THE PERMANENT HOME EITHER ───────────────────────────
 * `src/lib/interpret/` is the canonical semantic front door and already models
 * `CreditRole` on `CanonicalIntent.people[]`. When that layer is wired, this
 * reader should be deleted and its callers should take the role off the intent
 * — not kept alongside it. It exists now because the execution capability had
 * to land before the interpreter was wired, and the alternative was leaving the
 * inference where it did the most harm.
 *
 * Returns the role AS ASKED FOR, including roles the engine cannot execute.
 * Refusing those is `roleSupport`'s job, and it cannot refuse what it was never
 * told.
 *
 * PURE. No I/O.
 */

export type RequestedCreditRole = 'actor' | 'director' | 'writer' | 'creator';

export function requestedCreditRole(text: string): RequestedCreditRole | null {
  const t = (text ?? '').toLowerCase();
  if (/\bdirected\s+by\b|\bdirector\b|\bfilms?\s+of\b/.test(t)) return 'director';
  if (/\bwritten\s+by\b|\bwriter\b|\bscreenplay\s+by\b/.test(t)) return 'writer';
  if (/\bcreated\s+by\b|\bcreator\b/.test(t)) return 'creator';
  if (/\bstarring\b|\bwith\b|\bfeaturing\b|\bactor\b|\bcast\s+of\b/.test(t)) return 'actor';
  return null;
}
