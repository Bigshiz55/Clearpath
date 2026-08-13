/**
 * WHY THIS ONE WON — GC7. Grounded comparative explanation.
 *
 * GC6 answers "which candidate wins this request". This answers "why", from THE
 * SAME EVIDENCE and THE SAME ARITHMETIC: every sentence below is generated from
 * a `CriticAxisContribution` produced by `planNudge` while it was ranking. There
 * is no second calculation, no reconstruction from `relation + anchor names`,
 * and no request-path model call. An explanation derived independently of the
 * decision is free to drift from it, and a drifting explanation is worse than
 * none — it is a confident account of something that did not happen.
 *
 * ── THE LANGUAGE RULE THAT MATTERS MOST ───────────────────────────────────
 * NEVER CLAIM THE USER LIKED SOMETHING THEY DID NOT SAY THEY LIKED.
 *
 *   UNSAFE   "Keeps the tension you liked in Furious."
 *   WHY      "Better than Furious" names a title. It does not say they liked
 *            Furious, and it certainly does not say they liked its tension.
 *            Wanting BETTER than something is, if anything, mild evidence
 *            against having loved it.
 *   GROUNDED "Keeps Furious's high suspense, which fits your taste."
 *
 * Three fact classes, kept separate exactly as GC4 recorded them, because the
 * whole point of that separation was to make this sentence honest:
 *
 *   ANCHOR FACT   Furious is high on suspense          (from the fingerprint)
 *   USER FACT     your DNA favours suspense            (from Taste DNA)
 *   REQUEST FACT  you asked for faster                 (from the sentence)
 *
 * Two facts never combine into a third that was never observed. `evidence`
 * selects the phrasing; it is not decoration.
 *
 * ── ANCHOR NAMING ─────────────────────────────────────────────────────────
 * `readAnchors` averages across anchors, so an instruction backed by two
 * anchors belongs to BOTH of them and naming one would be invented specificity.
 * With several resolved anchors the copy names them collectively or not at all.
 * That is also what keeps `blend` honest: nothing here can assign a trait to a
 * particular anchor, because the data does not establish which one contributed
 * it. Silence beats invented specificity.
 *
 * Only RESOLVED anchors are ever named, and never re-searched by string.
 *
 * PURE. No I/O, no model call.
 */

import type { CriticAxisContribution } from './nudge';
import type { CriticRelation, ResolvedAnchor } from './objective';

/** A request-specific reason, kept apart from durable Match reasons. */
export interface ComparativeExplanation {
  /** Section heading the UI renders. */
  heading: string;
  /** Reasons this candidate answers THIS request well. */
  helped: string[];
  /** Honest cautions — only from real negative contributions. */
  cautions: string[];
  /** The resolved anchors this reasoning is about, as the user spoke them. */
  anchors: string[];
  relation: CriticRelation;
  /** Development-only detail; never rendered as prose. */
  axes: { axis: string; kind: string; points: number; evidence: string[] }[];
}

/** Human labels for the canonical axes. No axis key ever reaches the user. */
const AXIS_LABEL: Record<string, string> = {
  pacing: 'pacing',
  darkness: 'darkness',
  warmth: 'warmth',
  humor: 'humour',
  suspense: 'suspense',
  emotion: 'sentiment',
  complexity: 'complexity',
  realism: 'realism',
  character: 'character focus',
  stakes: 'stakes',
  morality: 'moral ambiguity',
  violence: 'violence',
  attention: 'demand on your attention',
  serialized: 'serialisation',
  romance: 'romance',
};

const label = (axis: string): string => AXIS_LABEL[axis] ?? axis;

/** How strong a value reads in prose. Never a number — see the magnitude rule. */
const level = (v: number): string => (v >= 70 ? 'high' : v <= 30 ? 'low' : 'moderate');

/** Which way an instruction is pushing, relative to where the anchors sit. */
const direction = (c: CriticAxisContribution): 'more' | 'less' =>
  c.target >= c.candidateValue ? 'more' : 'less';

/**
 * A contribution only earns a sentence when it MATERIALLY moved the score.
 * Below this the axis is noise, and listing it would pad the explanation with
 * things that did not actually decide anything.
 */
const MATERIAL_POINTS = 0.5;

/** At most this many sentences per section — an explanation, not an inventory. */
const MAX_REASONS = 3;

const has = (c: CriticAxisContribution, p: string): boolean => c.evidence.includes(p as never);

/** Name the anchors without ever attributing a trait to one of several. */
function anchorPhrase(anchors: readonly ResolvedAnchor[]): string | null {
  const names = anchors.map((a) => a.spokenAs).filter(Boolean);
  if (names.length === 0) return null;
  if (names.length === 1) return names[0]!;
  /* COLLECTIVE, DELIBERATELY. The instruction was derived from the mean across
     these anchors — and `buildPlan` refuses to emit one at all when they
     disagree — so "A and B" is precisely as specific as the evidence. */
  return names.length === 2 ? `${names[0]} and ${names[1]}` : names.slice(0, 2).join(', ');
}

/** One grounded sentence for a contribution that HELPED. */
function positiveLine(c: CriticAxisContribution, anchor: string | null): string {
  const ax = label(c.axis);

  /* REQUEST FACT FIRST — it is the only class the user stated outright, so it
     gets the strongest, most direct phrasing and is never dressed up as
     something we inferred about them. */
  if (has(c, 'request')) {
    return `Moves toward ${direction(c) === 'more' ? 'more' : 'less'} ${ax} — the change you asked for.`;
  }

  const fitsTaste = has(c, 'user_dna');

  if (c.kind === 'preserve') {
    if (anchor && fitsTaste && c.anchorValue != null) {
      // `preserve` targets the anchor's own value, so the two agree here — but
      // the anchor's reading is still the honest source for a claim about it.
      return `Keeps ${anchor}'s ${level(c.anchorValue)} ${ax}, which fits your taste.`;
    }
    if (anchor) return `Tracks ${anchor} closely on ${ax}.`;
    return fitsTaste ? `Holds the ${ax} your profile favours.` : `Holds a comparable level of ${ax}.`;
  }

  if (c.kind === 'avoid') {
    /* NOTE THE SHAPE: the anchor HAS the trait (an anchor fact) and the user's
       profile runs against it (a user fact). Neither says the user disliked the
       anchor, and the sentence must not imply they watched it. */
    /* THE ANCHOR'S OWN VALUE, NEVER A STAND-IN FOR IT. Describing the level
       from `target` (where we want the candidate) or from `candidateValue`
       (where it landed) produces a confident sentence about the wrong title —
       "drops the LOW humour of Furious" when Furious is high on humour is
       precisely the invented anchor fact this gate exists to prevent. With no
       anchor reading, the claim is simply not made. */
    if (anchor && fitsTaste && c.anchorValue != null) {
      return `Drops the ${level(c.anchorValue)} ${ax} of ${anchor}, which tends to work against it for you.`;
    }
    return `Avoids the ${ax} your profile tends to reject.`;
  }

  // improve
  if (fitsTaste) return `Moves toward the ${ax} your profile favours.`;
  return `Shifts the ${ax} relative to ${anchor ?? 'the titles you named'}.`;
}

/** One grounded sentence for a contribution that HURT. */
function negativeLine(c: CriticAxisContribution, anchor: string | null): string {
  const ax = label(c.axis);
  if (has(c, 'request')) return `Doesn't move much on ${ax} — the shift you asked for.`;
  if (has(c, 'user_dna')) {
    return c.kind === 'avoid'
      ? `Still carries the ${ax} your profile tends to reject.`
      : `Sits further from the ${ax} your profile favours.`;
  }
  return `Diverges from ${anchor ?? 'the titles you named'} on ${ax}.`;
}

const HEADING: Record<CriticRelation, string> = {
  better_than: 'For this request',
  like: 'For this request',
  like_but: 'For this request',
  blend: 'For this request',
};

export interface ExplainInput {
  relation: CriticRelation;
  /** RESOLVED anchors only. An unresolved one may never be spoken of. */
  anchors: readonly ResolvedAnchor[];
  /** The trail `planNudge` produced while ranking THIS candidate. */
  contributions: readonly CriticAxisContribution[];
  /** The bounded points this candidate actually received. */
  nudge: number;
}

/**
 * Build the request-specific explanation, or return null.
 *
 * NULL IS THE IMPORTANT CASE. No contribution, no fingerprint, zero authority,
 * or a nudge of exactly 0 means the comparison did not decide anything for this
 * candidate — and "Why this beats X" must never appear merely because the user
 * typed a comparison. Ranking position is not evidence.
 */
export function buildComparativeExplanation(input: ExplainInput): ComparativeExplanation | null {
  const { relation, anchors, contributions, nudge } = input;
  if (contributions.length === 0) return null;
  if (nudge === 0) return null;

  const resolved = anchors.filter((a) => a.titleId && a.spokenAs);
  const anchor = anchorPhrase(resolved);

  const material = contributions.filter((c) => Math.abs(c.points) >= MATERIAL_POINTS);
  if (material.length === 0) return null;

  /* THE REQUESTED SHIFT LEADS, ALWAYS.
     A modifier is the one thing the user said outright, so it outranks
     inferences no matter how large their contribution. Sorting purely by points
     buried "faster — the change you asked for" beneath three inferred axes that
     happened to agree more strongly, which reads as not having listened. */
  const requestFirst = (a: CriticAxisContribution, b: CriticAxisContribution): number => {
    const ra = has(a, 'request') ? 1 : 0;
    const rb = has(b, 'request') ? 1 : 0;
    if (ra !== rb) return rb - ra;
    return b.points - a.points;
  };

  const helpedSource = material
    .filter((c) => c.points > 0)
    .sort(requestFirst)
    .slice(0, MAX_REASONS);
  /* CAUTIONS COME FROM REAL NEGATIVE POINTS ONLY. A candidate is not criticised
     for placing second — ranking position says nothing about any axis. */
  const cautionSource = material
    .filter((c) => c.points < 0)
    .sort((a, b) => a.points - b.points)
    .slice(0, MAX_REASONS);

  const helped = helpedSource.map((c) => positiveLine(c, anchor));
  const cautions = cautionSource.map((c) => negativeLine(c, anchor));
  if (helped.length === 0 && cautions.length === 0) return null;

  return {
    heading: HEADING[relation],
    helped,
    cautions,
    anchors: resolved.map((a) => a.spokenAs),
    relation,
    axes: material.map((c) => ({
      axis: c.axis,
      kind: c.kind,
      points: Number(c.points.toFixed(3)),
      evidence: [...c.evidence],
    })),
  };
}
