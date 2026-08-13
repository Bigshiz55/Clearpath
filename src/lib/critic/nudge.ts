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

/** Fewer shared axes than this and the comparison is noise, not a reading. */
const MIN_SHARED_AXES = 2;

export interface CriticContribution {
  /** Bounded points added to the candidate's score. */
  nudge: number;
  /** 0..1 mean normalized distance from the anchor position on shared axes. */
  distance: number;
  /** Axes that actually took part — the attribution trail. */
  axes: string[];
}

const INERT: CriticContribution = { nudge: 0, distance: 0, axes: [] };

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

import type { CriticPlan } from './plan';

export function planNudge(
  candidate: { dims?: TitleDimensions },
  plan: CriticPlan | undefined,
): CriticContribution {
  if (!plan || plan.instructions.length === 0) return INERT;
  const authority = Math.max(0, Math.min(1, plan.authority));
  if (authority <= 0 || !candidate.dims) return INERT;

  const cand = candidate.dims as Record<string, number | undefined>;
  const axes: string[] = [];
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
    weighted += agreement * ins.strength;
    mass += ins.strength;
  }

  if (mass <= 0) return INERT;
  const score = weighted / mass; // -1 .. +1

  return {
    nudge: Math.max(
      -CRITIC_NUDGE_MAX,
      Math.min(CRITIC_NUDGE_MAX, score * CRITIC_NUDGE_MAX * authority),
    ),
    distance: (1 - score) / 2,
    axes,
  };
}
