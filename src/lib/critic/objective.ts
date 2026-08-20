/**
 * THE RECOMMENDATION OBJECTIVE — what the user actually asked for, in a shape
 * ranking can read.
 *
 * ── WHY THIS TYPE EXISTS ──────────────────────────────────────────────────
 * `FinderQuery` has genres, keywords, providers, runtime, ratings — every
 * SEARCH parameter and no RELATIONSHIP. So "better than Furious or Widows Bay"
 * and "something like Furious or Widows Bay" produce byte-identical queries,
 * and the comparative half of the request is gone before retrieval starts. An
 * anchor survives only as up to six TMDB keyword strings merged into a shared
 * keyword bag, plus `q.similarTo` — a caption that ranking never reads.
 *
 * This is the missing noun. It carries the RELATION and the RESOLVED ANCHORS
 * far enough down the pipeline that the ranker can act on them.
 *
 * ── WHAT IT IS NOT ────────────────────────────────────────────────────────
 * Not a parallel recommender. It produces a BOUNDED adjustment to the existing
 * score; the deterministic Watchability objective stays authoritative and Taste
 * DNA stays the personalization source. An anchor is a lens on the user's own
 * profile, never a substitute for it.
 *
 * PURE DATA. No I/O.
 */

import type { TitleDimensions } from '@/lib/scoring/dimensions';

/**
 * The relation the user expressed between what they named and what they want.
 *
 * `better_than` is the one that shipped broken, but it is deliberately a member
 * of a set rather than a special case — section 11 of the brief is explicit that
 * the mechanism must generalise, and a boolean `isBetterThan` would guarantee
 * the next relation gets bolted on beside it.
 */
export type CriticRelation =
  /** "something like X" — resemblance is the goal. */
  | 'like'
  /** "better than X" — the anchors are a BAR to clear, not a template. */
  | 'better_than'
  /** "X but faster", "less depressing than X" — resemblance with a stated shift. */
  | 'like_but'
  /** "X meets Y" — blend two anchors rather than beat them. */
  | 'blend';

/**
 * A title the user NAMED, resolved to a real entity.
 *
 * `titleId` is the canonical engine key (`movie:807`), never a display string,
 * because two people can type the same eight characters and mean different
 * films. Resolution happens in `anchor.ts` and refuses rather than guesses.
 */
export interface ResolvedAnchor {
  titleId: string;
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  /** What the user typed, kept for explanation copy. */
  spokenAs: string;
  /**
   * The anchor's fingerprint — the SAME axes `preferenceNudge` reasons in.
   * Absent when the title has no cached fingerprint, which must reduce this
   * anchor's authority rather than being silently treated as neutral.
   */
  dims?: TitleDimensions;
  /** 0..1 — how sure we are this is the title they meant. */
  confidence: number;
}

export interface CriticObjective {
  relation: CriticRelation;
  anchors: ResolvedAnchor[];
  /**
   * 0..1 — how much authority the critic signal has earned overall.
   *
   * Uncertainty must REDUCE authority (an explicit architectural requirement),
   * so this multiplies the bounded contribution rather than gating it on/off.
   * A half-resolved anchor should half-count, not count fully or not at all.
   */
  authority: number;
}

/**
 * AN ANCHOR IS NEVER ITS OWN ANSWER — a MEMBERSHIP rule, applied by the
 * caller that assembles candidates (GC5 territory), never inside the ranker
 * (`rankCriticCandidates` contractually returns the same candidates it was
 * given).
 *
 * Measured on production (taste-dna-proof, 2026-08-20): "lighter than
 * Whiplash" returned Whiplash itself at #5. The anchor is the comparison's
 * reference point — a title cannot be lighter, darker, or better than itself,
 * and "something like X" naming X back tells the user what they just typed.
 * Matched on composite identity (mediaType + tmdbId), never a title string.
 */
export function excludeAnchorCandidates<T extends { id: number; mediaType: 'movie' | 'tv' }>(
  items: readonly T[],
  anchors: readonly ResolvedAnchor[],
): T[] {
  if (anchors.length === 0) return [...items];
  const banned = new Set(anchors.map((a) => `${a.mediaType}-${a.tmdbId}`));
  return items.filter((i) => !banned.has(`${i.mediaType}-${i.id}`));
}

/** Authority derived from what actually resolved. Pure, and honest about gaps. */
export function objectiveAuthority(anchors: readonly ResolvedAnchor[]): number {
  const usable = anchors.filter((a) => a.dims && Object.keys(a.dims).length > 0);
  if (usable.length === 0) return 0; // nothing to reason from — contribute nothing
  const mean = usable.reduce((s, a) => s + a.confidence, 0) / usable.length;
  /* PARTIAL RESOLUTION IS PARTIAL AUTHORITY. Resolving one of two named titles
     is genuinely less information than resolving both, and rounding that up to
     full confidence is how a system starts asserting things it was never told. */
  const coverage = usable.length / Math.max(1, anchors.length);
  return Math.max(0, Math.min(1, mean * coverage));
}
