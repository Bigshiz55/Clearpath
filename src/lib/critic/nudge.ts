/**
 * THE CRITIC'S CONTRIBUTION TO RANKING — the term that makes the request causal.
 *
 * ── WHAT THIS FIXES ───────────────────────────────────────────────────────
 * Before this existed, `rankWithPreference` had no way to know a comparison had
 * been requested. Two completely different anchor pairs produced a byte-
 * identical order — proved by the RED run of `materialDependence.test.ts`,
 * where "better than two bleak thrillers" and "better than two warm comedies"
 * both returned `['tense-thriller', 'warm-comedy']`.
 *
 * ── THE ONE IDEA ──────────────────────────────────────────────────────────
 * An anchor is a POSITION in the same fingerprint space the profile already
 * lives in, and the RELATION says what to do about that position:
 *
 *   like        resemblance is the goal -> reward proximity
 *   better_than the anchors are a BAR, not a template. Somebody asking for
 *               "better than X" is telling you X did not fully land, so
 *               reproducing X is the wrong answer -> reward departure
 *   like_but    resemblance with a stated shift -> mostly proximity, and the
 *               shift itself is applied by the objective's own constraints
 *   blend       "X meets Y" -> proximity to the midpoint of the anchors
 *
 * That is one mechanism over a relation, not a branch on the phrase "better
 * than" — the brief is explicit that the words must not be special-cased.
 *
 * ── WHY IT CANNOT RUN AWAY ────────────────────────────────────────────────
 *   BOUNDED         +/- CRITIC_NUDGE_MAX, on the same scale as the preference
 *                   nudge, so the deterministic Watchability objective stays
 *                   authoritative. A candidate 40 points ahead on merit cannot
 *                   be overtaken by a comparison.
 *   AUTHORITY-SCALED Multiplied by `objective.authority`, so an unresolved or
 *                   half-resolved anchor contributes proportionally less. An
 *                   anchor we could not fingerprint contributes exactly zero
 *                   rather than being treated as neutral, which would be a
 *                   guess wearing a number.
 *   SHARED AXES ONLY Only axes BOTH the candidate and the anchors assert are
 *                   compared. An axis one side is silent about is not evidence
 *                   of similarity or difference.
 *   ABSENT = INERT  No objective, no anchors, or zero authority returns exactly
 *                   0, so every existing caller is unchanged.
 *
 * NOT A PARALLEL RECOMMENDER. It adjusts the existing score. Taste DNA remains
 * the personalization source and is applied by `preferenceNudge` as before.
 *
 * PURE. No I/O, no AI call in the request path.
 */

import { DIMENSION_KEYS, type TitleDimensions } from '@/lib/scoring/dimensions';
import type { CriticObjective } from './objective';

/** Same order of magnitude as `PREF_NUDGE_MAX` — a lens, never the lens. */
export const CRITIC_NUDGE_MAX = 10;

/**
 * THE STATED DIRECTION'S SHARE OF A MIXED PLAN'S BUDGET.
 *
 * Measured against a real deployment (taste-dna-proof, 2026-08-20): "darker
 * than Whiplash" and "lighter than Whiplash" both ran at full authority and
 * returned heads sharing three of five titles, because the one instruction the
 * user TYPED (strength 0.95) was pooled into the same mass as five-plus
 * anchor-preserve instructions (0.5 apiece) — under a fifth of the budget, at
 * most ±2 points of ±10, which a quality head locked at 87/85/83 absorbs
 * without reordering. A comparison whose direction cannot move its own result
 * is decorative.
 *
 * So in a mixed plan the stated terms own this share of ±CRITIC_NUDGE_MAX
 * outright, and the anchor's inferred terms divide the remainder scaled by
 * what the anchor is worth. 0.7 makes the stated axis decisive over the
 * quality locks actually observed (±7 against a five-point spread) while the
 * anchor's shape still separates otherwise-equal candidates — dominant, not
 * exclusive.
 */
export const STATED_SHARE = 0.7;

/** Fewer shared axes than this and the comparison is noise, not a reading. */
const MIN_SHARED_AXES = 2;

/**
 * ONE AXIS'S SHARE OF THE NUDGE — the explanation's only source of truth.
 *
 * GC7 must explain the ranking it actually got, so this is a DECOMPOSITION of
 * `planNudge`'s arithmetic rather than a second, approximate reconstruction:
 * the `points` across contributions sum to the nudge (before clamping). A
 * separate explanation calculation would be free to drift from the ranking it
 * claims to describe, which is the failure mode that makes a grounded
 * explanation unfalsifiable.
 */
export interface CriticAxisContribution {
  axis: string;
  kind: 'preserve' | 'improve' | 'avoid';
  /** What the candidate actually is on this axis, 0..100. */
  candidateValue: number;
  /** What the plan asked for, 0..100. */
  target: number;
  /** Where the ANCHORS sit on this axis, when they expressed anything. */
  anchorValue?: number;
  /** The instruction's weight, 0..1. */
  strength: number;
  /** WHICH FACTS produced the instruction. This governs the wording. */
  evidence: Provenance[];
  /** −1 (as far from target as possible) .. +1 (exactly on it). */
  agreement: number;
  /** Signed points this axis contributed. Sums to `nudge`. */
  points: number;
}

export interface CriticContribution {
  /** Bounded points added to the candidate's score. */
  nudge: number;
  /** 0..1 mean normalized distance from the anchor position on shared axes. */
  distance: number;
  /** Axes that actually took part — the attribution trail. */
  axes: string[];
  /** Per-axis decomposition of `nudge`. Empty for the legacy centroid path. */
  contributions: CriticAxisContribution[];
}

const INERT: CriticContribution = { nudge: 0, distance: 0, axes: [], contributions: [] };

/** The anchors' shared position: per-axis mean over anchors that assert it. */
export function anchorCentroid(objective: CriticObjective): TitleDimensions {
  const sums = new Map<string, { total: number; n: number }>();
  for (const a of objective.anchors) {
    if (!a.dims) continue;
    for (const key of DIMENSION_KEYS) {
      const v = (a.dims as Record<string, number | undefined>)[key];
      if (typeof v !== 'number') continue;
      const cur = sums.get(key) ?? { total: 0, n: 0 };
      cur.total += v;
      cur.n += 1;
      sums.set(key, cur);
    }
  }
  const out: Record<string, number> = {};
  for (const [key, { total, n }] of sums) out[key] = total / n;
  return out as TitleDimensions;
}

export function criticNudge(
  candidate: { dims?: TitleDimensions },
  objective: CriticObjective | undefined,
): CriticContribution {
  if (!objective || objective.anchors.length === 0) return INERT;
  const authority = Math.max(0, Math.min(1, objective.authority));
  if (authority <= 0) return INERT;
  if (!candidate.dims) return INERT;

  const centroid = anchorCentroid(objective) as Record<string, number | undefined>;
  const cand = candidate.dims as Record<string, number | undefined>;

  const axes: string[] = [];
  let total = 0;
  for (const key of DIMENSION_KEYS) {
    const a = centroid[key];
    const c = cand[key];
    // SHARED AXES ONLY. Silence on either side is not evidence either way.
    if (typeof a !== 'number' || typeof c !== 'number') continue;
    axes.push(key);
    total += Math.abs(c - a) / 100;
  }
  if (axes.length < MIN_SHARED_AXES) return INERT;

  const distance = total / axes.length; // 0..1

  /* THE RELATION DECIDES THE SIGN, and that is the whole mechanism.
     `signed` is centred so a candidate sitting exactly as far from the anchors
     as an average title neither gains nor loses — otherwise every candidate
     would drift in one direction and the term would be a constant, which
     reorders nothing. */
  const centred = (distance - 0.5) * 2; // -1 .. +1
  let direction: number;
  switch (objective.relation) {
    case 'better_than':
      direction = centred; // depart from a bar that was not cleared
      break;
    case 'like':
    case 'like_but':
      direction = -centred; // resemble
      break;
    case 'blend':
      direction = -centred; // sit between them, so proximity to the midpoint
      break;
    default:
      return INERT;
  }

  return {
    nudge: Math.max(-CRITIC_NUDGE_MAX, Math.min(CRITIC_NUDGE_MAX, direction * CRITIC_NUDGE_MAX * authority)),
    distance,
    axes,
    /* The legacy centroid path has no per-axis instructions to decompose — it
       measures undirected distance. Empty rather than fabricated, so an
       explanation built from this path says nothing instead of guessing. */
    contributions: [],
  };
}

// ───────────────────────────────────────────────────────────────────────────
// PLAN-DRIVEN SCORING — GC4. This supersedes centroid distance as the
// authoritative critic input.
//
// `criticNudge` above measured how FAR a candidate sat from the anchors.
// `planNudge` measures how well it AGREES WITH THE PLAN — which of the
// anchors' qualities it keeps, which of the user's conflicts it fixes, which of
// their grounded dislikes it avoids. That is the difference between a geometry
// function and a critic.
//
// Distance still has a legitimate internal role for pure resemblance, and the
// plan expresses that directly: `like` emits `preserve` instructions at the
// anchor's own values, so agreement with the plan IS proximity for that
// relation. One mechanism, no special case.
//
// Everything GC8 pinned is preserved: bounded at ±CRITIC_NUDGE_MAX, scaled by
// authority, inert when there is nothing to say, and reporting which axes moved.
// ───────────────────────────────────────────────────────────────────────────

import type { CriticPlan, Provenance } from './plan';

export function planNudge(
  candidate: { dims?: TitleDimensions },
  plan: CriticPlan | undefined,
): CriticContribution {
  if (!plan || plan.instructions.length === 0) return INERT;
  const authority = Math.max(0, Math.min(1, plan.authority));
  if (!candidate.dims) return INERT;
  /* AUTHORITY IS ABOUT THE ANCHOR, NOT ABOUT THE SENTENCE.
     `objectiveAuthority` is zero whenever no anchor carries a cached
     fingerprint, and this used to return INERT on that alone — silencing the
     axis the user STATED along with everything inferred from the anchor.
     Measured against a real deployment: "I want something darker than Taken."
     resolved its anchor, ran the whole pipeline, and returned that build's
     unconstrained popularity head. "Darker than X" is two claims and only one
     of them needs to know anything about X. A plan with nothing but anchor
     inference and no authority is still completely inert — see below. */
  if (authority <= 0 && !plan.instructions.some((i) => i.evidence.includes('request'))) return INERT;

  const cand = candidate.dims as Record<string, number | undefined>;
  const axes: string[] = [];
  const parts: { ins: (typeof plan.instructions)[number]; value: number; agreement: number; weight: number }[] = [];
  let weighted = 0;
  let mass = 0;

  for (const ins of plan.instructions) {
    const v = cand[ins.axis];
    if (typeof v !== 'number') continue; // the candidate is silent here
    axes.push(ins.axis);

    /* AGREEMENT, CENTRED. `1 - 2*|v - target|/100` runs +1 (exactly on target)
       to -1 (as far from it as possible), so a candidate that satisfies the
       plan gains and one that violates it loses. Centring matters: a score
       that only ever rewarded would shift every candidate equally and reorder
       nothing, which is the failure mode that makes a signal decorative. */
    const agreement = 1 - (2 * Math.abs(v - ins.target)) / 100;
    /* PER-TERM AUTHORITY. An instruction the user stated carries its own full
       weight; one inferred from the anchor is worth what the anchor is worth.
       When EVERY instruction is anchor-evidenced this is identical arithmetic
       to scaling the finished sum — `statedAxisAuthority.test.ts` pins that to
       nine decimals, because a fix that quietly re-weighted every existing
       comparison would be a different change wearing this one's clothes. */
    const weight = ins.evidence.includes('request') ? 1 : authority;
    weighted += agreement * ins.strength * weight;
    mass += ins.strength;
    parts.push({ ins, value: v, agreement, weight });
  }

  if (mass <= 0) return INERT;

  /* ── HOW THE PARTICIPATING TERMS DIVIDE THE BUDGET ─────────────────────
     A PURE plan — every term stated, or every term inferred from the anchor —
     keeps the shipped arithmetic to the last decimal: one pooled mass, each
     term weighted by its provenance. `statedAxisAuthority.test.ts` pins both
     cases to nine decimals, because silently re-weighting every existing
     comparison would be a different change wearing this one's clothes.

     A MIXED plan is where pooling failed on production: the anchor's many
     preserve terms outmassed the one instruction the user typed, so "darker"
     and "lighter" returned the same head (see STATED_SHARE above). Here the
     stated group owns its share of ±CRITIC_NUDGE_MAX outright and the anchor
     group divides the remainder × authority — dead anchor mass no longer
     votes, and each group is normalized by its OWN mass so neither dilutes
     the other. */
  const stated = parts.filter((p) => p.ins.evidence.includes('request'));
  const inferred = parts.filter((p) => !p.ins.evidence.includes('request'));

  let score: number;
  let pointsFor: (p: (typeof parts)[number]) => number;

  if (stated.length > 0 && inferred.length > 0) {
    const statedMass = stated.reduce((s, p) => s + p.ins.strength, 0);
    const inferredMass = inferred.reduce((s, p) => s + p.ins.strength, 0);
    const statedScore = stated.reduce((s, p) => s + p.agreement * p.ins.strength, 0) / statedMass;
    const inferredScore = inferred.reduce((s, p) => s + p.agreement * p.ins.strength, 0) / inferredMass;
    /* The anchor's slice shrinks with its authority; whatever it does not
       claim reverts to the stated terms rather than to nobody, so a
       half-known anchor half-counts instead of muting the user. */
    const inferredShare = (1 - STATED_SHARE) * authority;
    const statedShare = 1 - inferredShare;
    score = statedShare * statedScore + inferredShare * inferredScore;
    pointsFor = (p) =>
      p.ins.evidence.includes('request')
        ? ((p.agreement * p.ins.strength) / statedMass) * statedShare * CRITIC_NUDGE_MAX
        : ((p.agreement * p.ins.strength) / inferredMass) * inferredShare * CRITIC_NUDGE_MAX;
  } else {
    score = weighted / mass; // -1 .. +1
    const scale = CRITIC_NUDGE_MAX / mass;
    pointsFor = (p) => p.agreement * p.ins.strength * p.weight * scale;
  }

  return {
    nudge: Math.max(-CRITIC_NUDGE_MAX, Math.min(CRITIC_NUDGE_MAX, score * CRITIC_NUDGE_MAX)),
    distance: (1 - score) / 2,
    axes,
    /* THE SAME ARITHMETIC, SPLIT PER AXIS — `pointsFor` is literally the term
       each axis added to `score * MAX`, so these points sum to `nudge`
       whenever the clamp does not bite. GC7 explains from these and nothing
       else. */
    contributions: parts.map((p) => ({
      axis: p.ins.axis,
      kind: p.ins.kind,
      candidateValue: p.value,
      target: p.ins.target,
      anchorValue: p.ins.anchorValue,
      strength: p.ins.strength,
      evidence: [...p.ins.evidence],
      agreement: p.agreement,
      points: pointsFor(p),
    })),
  };
}
