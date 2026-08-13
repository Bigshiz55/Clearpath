/**
 * THE FINAL COMPARATIVE ORDERING — GC6. One decision, every term explicit.
 *
 * ── WHAT THE AUDIT FOUND (see docs/CRITIC-SHIP.md for the full table) ─────
 * `FinderItem.matchScore` is NOT a raw quality number. It is
 *
 *     clamp(computeGeneralScore(meta, providers) + Σ rule[trait].weight)
 *
 * i.e. general quality plus the user's DURABLE, EXPLICIT preference rules. On
 * the Ask surface that is the whole of the personalization: `/api/ask` never
 * calls `rankByDna`, so the canonical event-derived DNA reaches Ask ordering
 * nowhere at all.
 *
 * ── WHY THE RAW PREFERENCE NUDGE IS NOT A THIRD TERM HERE ─────────────────
 * Because `buildPlan` ALREADY consumes canonical DNA. Its targets are
 * `effectiveTaste(dna)[axis].pref` — the plan's whole job is deciding what to
 * preserve/improve/avoid FOR THIS USER. Adding the raw per-axis preference
 * nudge beside it would apply the same canonical DNA twice: once choosing the
 * plan's targets, once again as an independent axis term. That is double
 * counting in the only sense that matters — the same evidence moving the same
 * candidate twice — and it would be invisible in the output, because both terms
 * are bounded and the result would simply look more confident.
 *
 * So:
 *
 *     decisionScore = matchScore + planNudge(candidate, plan)
 *
 * where `planNudge` is bounded ±CRITIC_NUDGE_MAX and scaled by objective
 * authority. `matchScore` carries general quality + durable taste; the plan
 * carries THIS REQUEST. Nothing else is added.
 *
 * ── THREE CONCEPTS, KEPT APART ────────────────────────────────────────────
 *   GENERAL QUALITY   `generalScore` — the deterministic judgment of the title
 *   DURABLE MATCH     `matchScore`   — what we know about this user, lastingly
 *   REQUEST DECISION  `criticNudge`  — what makes this the answer TO THIS ASK
 *
 * The third is NOT the first two and must never be written back into either.
 * `decisionScore` orders the list; it is not a rating, it is not displayed as
 * one, and it does not persist. A one-off request does not change who the user
 * is.
 *
 * ── ABSENT MEANS ABSENT ───────────────────────────────────────────────────
 * No plan, zero authority, or no cached fingerprint for a candidate → that
 * candidate's critic contribution is exactly 0 and the incoming order is
 * preserved. A missing fingerprint is never read as a neutral 50, which would
 * be an invented opinion wearing a number.
 *
 * PURE. No I/O, no model call. The caller hydrates dimensions cache-only.
 */

import type { TitleDimensions } from '@/lib/scoring/dimensions';
import { planNudge, CRITIC_NUDGE_MAX, type CriticAxisContribution } from './nudge';
import type { CriticPlan } from './plan';

export interface CriticCandidate {
  id: number;
  mediaType: 'movie' | 'tv';
  /** The Finder's displayed Match: general quality + durable preference rules. */
  matchScore: number;
  /** The deterministic quality judgment, carried for attribution. */
  generalScore: number;
  /** Cache-only canonical fingerprint. Absent = this candidate stays silent. */
  dims?: TitleDimensions;
}

/** Every term that produced the order, inspectable. No mystery addition. */
export interface CriticDecision {
  id: number;
  mediaType: 'movie' | 'tv';
  /** Composite identity — `mediaType-tmdbId`, never a title string. */
  key: string;
  /** GENERAL QUALITY. */
  generalScore: number;
  /** DURABLE MATCH — displayed on the card, unchanged by anything here. */
  matchScore: number;
  /** REQUEST-SPECIFIC. Bounded ±CRITIC_NUDGE_MAX, scaled by authority. */
  criticNudge: number;
  /** Which axes actually moved it. */
  criticAxes: string[];
  /**
   * The per-axis decomposition that PRODUCED `criticNudge`.
   *
   * Carried on the decision so GC7 explains the ranking that actually happened
   * rather than reconstructing a plausible one from `relation + anchor names`.
   * One arithmetic, one story.
   */
  contributions: CriticAxisContribution[];
  /** Whether a cached fingerprint existed for this candidate at all. */
  fingerprinted: boolean;
  /** ORDERING ONLY. Never displayed as a rating, never persisted. */
  decisionScore: number;
}

export interface CriticRankResult {
  decisions: CriticDecision[];
  /**
   * DID THE PLAN ACTUALLY MOVE ANYTHING?
   *
   * True only when at least one candidate received a NON-ZERO plan-derived
   * contribution. Standing is not influence: a plan can be well-formed, carry
   * instructions and hold positive authority while every candidate is missing
   * its cached fingerprint, or while every contribution lands at exactly 0. In
   * both cases the returned order is the incoming order, and reporting
   * `applied: true` would let `finalRankingConsumesPlan` imply a causal
   * influence that never occurred.
   */
  applied: boolean;
  /**
   * The weaker, separate notion: the plan had STANDING to act — it exists, has
   * instructions, and authority is positive. `eligible && !applied` is the
   * honest description of "we were ready to reason and had nothing to reason
   * about", which is a different fact from "there was no comparison".
   */
  eligible: boolean;
  authority: number;
}

export const candidateKey = (mediaType: 'movie' | 'tv', id: number): string =>
  `${mediaType}-${id}`;

/**
 * Order candidates for a comparative request.
 *
 * Returns the SAME candidates, never a subset — retrieval decided membership
 * (GC5) and this decides order. The two stay separable, which is what lets a
 * test prove GC6 caused a result rather than GC5.
 */
export function rankCriticCandidates(
  candidates: readonly CriticCandidate[],
  plan: CriticPlan | undefined,
): CriticRankResult {
  const authority = Math.max(0, Math.min(1, plan?.authority ?? 0));

  const base = (
    c: CriticCandidate,
    nudge: number,
    axes: string[],
    fp: boolean,
    contributions: CriticAxisContribution[] = [],
  ): CriticDecision => ({
    id: c.id,
    mediaType: c.mediaType,
    key: candidateKey(c.mediaType, c.id),
    generalScore: c.generalScore,
    matchScore: c.matchScore,
    criticNudge: nudge,
    criticAxes: axes,
    contributions,
    fingerprinted: fp,
    decisionScore: c.matchScore + nudge,
  });

  /* NOTHING TO SAY → EXACT EXISTING BEHAVIOUR. Not "a very small nudge", not a
     re-sort that happens to agree: the incoming order is returned untouched, so
     a request with no objective is byte-identical to what shipped before. */
  const eligible = !!plan && plan.instructions.length > 0 && authority > 0;
  if (!eligible) {
    return {
      decisions: candidates.map((c) => base(c, 0, [], c.dims != null)),
      applied: false,
      eligible: false,
      authority,
    };
  }

  const decisions = candidates.map((c) => {
    if (!c.dims) return base(c, 0, [], false); // silent, not neutral
    const contribution = planNudge({ dims: c.dims }, plan);
    return base(c, contribution.nudge, contribution.axes, true, contribution.contributions);
  });

  /* INFLUENCE, NOT STANDING. Measured from the contributions that actually
     landed rather than from the plan's own paperwork. Ordering below is
     unchanged either way — this only decides what we CLAIM happened. */
  const applied = decisions.some((d) => d.criticNudge !== 0);

  /* STABLE AND DETERMINISTIC. `index` is the final tie-break so two candidates
     the critic cannot separate keep the order retrieval gave them, rather than
     depending on sort implementation. */
  const withIndex = decisions.map((d, index) => ({ d, index }));
  withIndex.sort((a, b) => {
    const byDecision = b.d.decisionScore - a.d.decisionScore;
    if (byDecision !== 0) return byDecision;
    const byMatch = b.d.matchScore - a.d.matchScore;
    if (byMatch !== 0) return byMatch;
    return a.index - b.index;
  });

  return { decisions: withIndex.map((x) => x.d), applied, eligible, authority };
}

/** The bound, re-exported so callers cannot invent a different one. */
export { CRITIC_NUDGE_MAX };
