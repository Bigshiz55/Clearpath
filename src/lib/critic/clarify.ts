/**
 * WHICH ONE DID YOU MEAN — the last mile of anchor identity.
 *
 * ── WHAT THIS FIXES ───────────────────────────────────────────────────────
 * GC2 refuses to guess, and that refusal is the safety win: five real films are
 * called "Furious", and picking the popular one is how the original bug worked.
 * But the product behaviour it produced was
 *
 *   "I couldn't pin down Furious — answering without the comparison."
 *
 * For a request whose entire point IS the comparison, quietly dropping it is a
 * different failure, not a fix. A person who names a title we cannot place has
 * given us a perfectly answerable question: WHICH ONE.
 *
 * So ambiguity becomes a QUESTION rather than a shrug. The refusal is
 * unchanged — nothing here picks a candidate — it just gets a way to be
 * resolved by the one party who actually knows.
 *
 * ── THE THING THAT MUST NOT BE LOST ───────────────────────────────────────
 * The rest of the request. Relation, the anchor that DID resolve, the explicit
 * modifiers, and every hard constraint the sentence stated all survive the
 * round trip in `PendingComparison`, so answering "the 2017 movie" resumes the
 * original comparison instead of starting a new search. The user never retypes.
 *
 * A resolved anchor is carried as its CANONICAL IDENTITY, not as the string
 * that produced it, so the continuation never searches for it again — and
 * therefore cannot resolve it differently the second time.
 *
 * PURE. No I/O, no model call.
 */

import type { AnchorOption, AnchorResolution } from './anchor';
import type { CriticRelation } from './objective';
import type { Modifiers } from './plan';

/** How many candidates a person can actually choose between at a glance. */
export const MAX_CLARIFY_OPTIONS = 4;

/** An identity the caller already established. Carried, never re-derived. */
export interface CarriedAnchor {
  spokenAs: string;
  tmdbId: number;
  mediaType: 'movie' | 'tv';
}

/** One thing we still need the user to settle. */
export interface PendingAnchor {
  spokenAs: string;
  /** `ambiguous` = we found several; `not_found` = we found none. */
  reason: 'ambiguous' | 'not_found';
  /** Bounded, real candidates. Empty for `not_found`. */
  options: AnchorOption[];
}

/**
 * Everything needed to resume the ORIGINAL request after one answer.
 *
 * Deliberately a plain data envelope the client echoes back: there is no
 * server-side conversation store to leak between users, matching how the
 * existing conversation state already works.
 */
export interface PendingComparison {
  /** The sentence as typed, for read-back only — never re-parsed for identity. */
  text: string;
  relation: CriticRelation;
  modifiers: Modifiers;
  unresolvedModifiers: string[];
  /** Anchors already placed. These are NOT searched again. */
  resolved: CarriedAnchor[];
  /** Anchors awaiting the user. Usually exactly one. */
  pending: PendingAnchor[];
}

export interface ClarificationRequest {
  question: string;
  pending: PendingAnchor;
  comparison: PendingComparison;
}

/** The user's answer: this spoken name is that canonical title. */
export interface ClarificationChoice {
  spokenAs: string;
  tmdbId: number;
  mediaType: 'movie' | 'tv';
}

/**
 * Rank the candidates a person is asked to choose between.
 *
 * NOT a guess and not a tie-break — every option shown is returned, this only
 * decides ORDER and trims a long tail nobody can scan. Newest first because a
 * recency prior is a defensible way to order a LIST; it would be indefensible
 * as a way to pick one, which is why nothing here picks.
 */
export function rankOptions(options: readonly AnchorOption[]): AnchorOption[] {
  return [...options]
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.tmdbId - b.tmdbId)
    .slice(0, MAX_CLARIFY_OPTIONS);
}

/** "Which Furious did you mean?" — the question, never an apology. */
export function clarificationQuestion(p: PendingAnchor): string {
  return p.reason === 'ambiguous'
    ? `Which ${p.spokenAs} did you mean?`
    : `I don't know a title called ${p.spokenAs} — which one did you mean?`;
}

/**
 * Decide whether a comparative request needs to ask something.
 *
 * Returns null when every anchor resolved, which is the common case and must
 * stay completely inert.
 */
export function needsClarification(
  text: string,
  relation: CriticRelation,
  modifiers: Modifiers,
  unresolvedModifiers: string[],
  resolutions: readonly AnchorResolution[],
): ClarificationRequest | null {
  const pending: PendingAnchor[] = [];
  const resolved: CarriedAnchor[] = [];

  for (const r of resolutions) {
    if (r.status === 'resolved') {
      resolved.push({
        spokenAs: r.anchor.spokenAs,
        tmdbId: r.anchor.tmdbId,
        mediaType: r.anchor.mediaType,
      });
    } else if (r.status === 'ambiguous') {
      pending.push({ spokenAs: r.spokenAs, reason: 'ambiguous', options: rankOptions(r.options) });
    } else {
      pending.push({ spokenAs: r.spokenAs, reason: 'not_found', options: [] });
    }
  }

  if (pending.length === 0) return null;

  /* ASK ABOUT ONE THING AT A TIME. Two questions at once is an interrogation,
     and the second is often answered by the first anyway. */
  const first = pending[0]!;
  return {
    question: clarificationQuestion(first),
    pending: first,
    comparison: { text, relation, modifiers, unresolvedModifiers, resolved, pending },
  };
}

/**
 * Fold the user's answer back in, producing the anchors to resume with.
 *
 * The chosen identity JOINS the ones already resolved; nothing is re-searched
 * and nothing is dropped. Anchors still pending after this answer stay pending,
 * so a two-ambiguity request converges one question at a time.
 */
export function applyChoice(
  comparison: PendingComparison,
  choice: ClarificationChoice,
): PendingComparison {
  const chosenName = choice.spokenAs;
  const stillPending = comparison.pending.filter((p) => p.spokenAs !== chosenName);
  const already = comparison.resolved.some((r) => r.spokenAs === chosenName);
  return {
    ...comparison,
    resolved: already
      ? comparison.resolved
      : [...comparison.resolved, { spokenAs: chosenName, tmdbId: choice.tmdbId, mediaType: choice.mediaType }],
    pending: stillPending,
  };
}

/** True when the round trip is over and the comparison can run. */
export const isSettled = (c: PendingComparison): boolean => c.pending.length === 0;

/**
 * DETERMINISTIC CONTEXT ONLY.
 *
 * If the request itself already identifies one candidate — a stated year, a
 * stated media type — honour it rather than asking a question the user has
 * already answered. This is not a heuristic short-cut around clarification:
 * it fires only when the stated fact leaves EXACTLY ONE candidate standing.
 * Anything less certain asks.
 */
export function disambiguateFromContext(
  options: readonly AnchorOption[],
  ctx: { year?: number | null; mediaType?: 'movie' | 'tv' | null },
): AnchorOption | null {
  let pool = [...options];
  if (ctx.mediaType) pool = pool.filter((o) => o.mediaType === ctx.mediaType);
  if (ctx.year != null) pool = pool.filter((o) => o.year === ctx.year);
  return pool.length === 1 ? pool[0]! : null;
}
