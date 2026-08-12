/**
 * THE SECOND AND THIRD THINGS A ROUND CAN ASK.
 *
 * Showdown collected exactly one kind of evidence: which of two. That is a
 * comparative statement, and two facts about it are structural rather than
 * fixable downstream:
 *
 *   IT IS CONFOUNDED. Se7en over Knives Out moves darkness, comedy, patience
 *   and complexity together, and one of them was the reason.
 *   IT IS NOT AN APPETITE. Winning a head-to-head is not wanting to watch
 *   something; it is wanting it more than the other one, which a person can
 *   feel about two films they would never choose.
 *
 * Attribution prices the first in and cannot resolve it. Nothing prices the
 * second in at all. So there are two follow-ups, each recovering exactly what
 * the pick could not carry, and each deliberately COMPLEMENTARY to it rather
 * than a second opinion about the same thing:
 *
 *   WHY  — names ONE axis out of the several the pair split on. Tops that axis
 *          up to what a clean single-axis matchup would have been worth, and no
 *          further, so asking upgrades the observation instead of inflating it.
 *
 *   HOW MUCH — an ABSOLUTE claim about the winner, recorded only on the axes
 *          the two films AGREED on. Those are precisely the axes the comparison
 *          was silent about, so the two evidence types cannot double-count by
 *          construction — not by tuning, by disjoint domains.
 *
 * THE INTERRUPTION BUDGET IS THE POINT. A follow-up on every round turns a
 * sixty-second game into a form, so most rounds must advance in 160ms with no
 * question at all. `chooseFollowUp` spends a fixed budget on the rounds where
 * the answer is worth most — the confounded ones — and stays silent otherwise.
 *
 * PURE. No I/O, no clock, no randomness.
 */

import type { DiagnosticTitle } from '@/lib/voice/quickdna/definition';
import type { TraitKey } from '@/lib/voice/quickdna/traits';
import {
  MAX_PERMANENT_WEIGHT,
  attributionConfidence,
  axisAttribution,
  permanentWeight,
} from './attribution';
import type { PermanentTraitEvidence, SessionContextEvidence } from './evidence';
import { pull, separation } from './matchup';
import { GUT_CALL, REASON_ATTRIBUTION, reasonsFor, shouldAskWhy, type ReasonChip } from './reasons';

/** The two titles a follow-up is about. Narrower than `Matchup` on purpose. */
export interface Pair {
  readonly left: DiagnosticTitle;
  readonly right: DiagnosticTitle;
}

/* ------------------------------------------------------------------ *
 * WHY — a stated reason
 * ------------------------------------------------------------------ */

/** What a clean single-axis observation is worth. The ceiling a reason reaches. */
export const REASON_CEILING = permanentWeight({
  separation: 1,
  attribution: REASON_ATTRIBUTION,
  informationValue: 1,
});

/**
 * Evidence from a named reason — a TOP-UP, never an addition.
 *
 * The pick already wrote something on this axis, attenuated because it could
 * have been any of several. Being told which one it was does not make that
 * observation happen twice; it makes the ONE observation clean. So the reason
 * contributes only the shortfall between what the confounded pick paid and what
 * a Twist would have paid, which gives the invariant worth having:
 *
 *   confounded pick + stated reason  ==  a clean single-axis matchup
 *
 * Adding a full-strength write on top instead would let a four-axis guess plus
 * one tap outweigh a genuinely clean comparison, which is the exact inversion
 * `attribution.ts` exists to prevent.
 */
export function reasonEvidence(
  chip: ReasonChip,
  alreadyWritten: number,
): PermanentTraitEvidence[] {
  if (chip.id === GUT_CALL.id) return [];
  const topUp = REASON_CEILING - Math.max(0, alreadyWritten);
  if (!(topUp > 0)) return [];
  return [
    {
      kind: 'permanent',
      key: chip.key,
      target: chip.high ? 100 : 0,
      weight: topUp,
      attribution: REASON_ATTRIBUTION,
    },
  ];
}

/** How much a decision's permanent evidence already put on one axis. */
export function writtenOn(
  evidence: readonly PermanentTraitEvidence[],
  key: TraitKey,
): number {
  return evidence.filter((e) => e.key === key).reduce((sum, e) => sum + e.weight, 0);
}

/** Tonight's version: a stated reason is a full-strength tilt, nothing permanent. */
export function reasonLean(chip: ReasonChip, step: number): SessionContextEvidence[] {
  if (chip.id === GUT_CALL.id) return [];
  return [{ kind: 'session', key: chip.key, lean: (chip.high ? 1 : -1) * step }];
}

/* ------------------------------------------------------------------ *
 * HOW MUCH — a stated appetite
 * ------------------------------------------------------------------ */

/**
 * What the player says about the film they just picked.
 *
 * `relative` is not a skip and not a shrug — it is the honest description of
 * most head-to-head picks, and recording it as such is what stops the other two
 * meaning nothing. If every pick were filed as "interested" the grade would
 * carry no information; letting someone say "it was just the better of two"
 * is what makes "watching that tonight" a real claim.
 */
export type Intensity = 'must' | 'keen' | 'relative';

/**
 * Ceiling per intensity.
 *
 * `must` reaches the same ceiling as a clean comparison because it is the same
 * order of statement — a person naming a title they want, unprompted by an
 * alternative. `relative` is exactly zero: it asserts nothing beyond the pick
 * that was already recorded, and manufacturing evidence from it would be
 * inventing an opinion out of a disclaimer.
 */
export const INTENSITY_BASE: Record<Intensity, number> = {
  must: MAX_PERMANENT_WEIGHT,
  keen: MAX_PERMANENT_WEIGHT * 0.45,
  relative: 0,
};

/** Axes both films assert the same way — the ones the comparison was silent on. */
export function agreedAxes(pair: Pair, winner: DiagnosticTitle): TraitKey[] {
  const keys = new Set<TraitKey>();
  for (const e of winner.traits) keys.add(e.key);
  return [...keys].filter(
    (k) => separation(pair.left, pair.right, k) === 0 && pull(winner, k) !== 0,
  );
}

/**
 * Evidence from a stated appetite.
 *
 * ONLY ON THE AGREED AXES. The comparison already spoke for every axis the pair
 * split on, and speaking again there would be one tap counted twice. What it
 * could not speak for is everything the two films had in common — which, for a
 * pair the planner deliberately built to be far apart, is the shared ground
 * nothing else in the game ever reaches.
 */
export function intensityEvidence(
  pair: Pair,
  winner: DiagnosticTitle,
  intensity: Intensity,
): PermanentTraitEvidence[] {
  const base = INTENSITY_BASE[intensity];
  if (!(base > 0)) return [];
  const axes = agreedAxes(pair, winner);
  const strengths = axes.map((k) => Math.min(1, Math.abs(pull(winner, k))));
  const out: PermanentTraitEvidence[] = [];
  for (const key of axes) {
    const strength = Math.min(1, Math.abs(pull(winner, key)));
    const attribution = axisAttribution(strength, strengths);
    const weight = permanentWeight({
      separation: strength,
      attribution,
      informationValue: 1,
      base,
    });
    if (weight <= 0) continue;
    out.push({
      kind: 'permanent',
      key,
      target: pull(winner, key) > 0 ? 100 : 0,
      weight,
      attribution,
    });
  }
  return out;
}

/** How confounded a stated appetite is — reported so canonical grading can price it. */
export function intensityAttribution(pair: Pair, winner: DiagnosticTitle): number {
  const strengths = agreedAxes(pair, winner).map((k) => Math.min(1, Math.abs(pull(winner, k))));
  return strengths.length > 0 ? attributionConfidence(strengths) : 0;
}

/** Tonight's version: appetite tilts the shared ground for the night only. */
export function intensityLean(
  pair: Pair,
  winner: DiagnosticTitle,
  intensity: Intensity,
  step: number,
): SessionContextEvidence[] {
  const scale = intensity === 'must' ? 1 : intensity === 'keen' ? 0.45 : 0;
  if (scale === 0) return [];
  return agreedAxes(pair, winner).map((key) => ({
    kind: 'session' as const,
    key,
    lean: Math.sign(pull(winner, key)) * step * scale * Math.min(1, Math.abs(pull(winner, key))),
  }));
}

/* ------------------------------------------------------------------ *
 * WHICH follow-up, if any
 * ------------------------------------------------------------------ */

export type FollowUp =
  | { kind: 'why'; chips: ReasonChip[] }
  | { kind: 'intensity'; title: DiagnosticTitle }
  | null;

/**
 * How many rounds out of twenty may be interrupted.
 *
 * SIX, NOT TWENTY. The follow-ups are the highest-quality evidence the game can
 * collect, which is an argument for asking always and a bad one: a game that
 * asks twice per round takes three minutes and gets abandoned, and evidence
 * from a session nobody finishes is worth nothing at all. Six is roughly ten
 * extra seconds spread over the run, spent on the rounds where the comparative
 * evidence is weakest.
 */
export const FOLLOWUP_BUDGET = 6;

/** Appetite is asked on this cadence, so it never crowds out the WHY rounds. */
export const INTENSITY_EVERY = 5;

/** Below this many shared axes a stated appetite would barely record anything. */
export const INTENSITY_MIN_AGREED = 2;

export interface FollowUpContext {
  pair: Pair;
  /** 'left' | 'right' — a refusal of both has no winner to ask about. */
  winner: DiagnosticTitle | null;
  /** Attribution of the pick that was just made. */
  attribution: number;
  /** Which decision this was, 1-based. */
  decisionIndex: number;
  /** Follow-ups already spent this session. */
  spent: number;
  /** Was the previous round interrupted? Two in a row reads as an interrogation. */
  backToBack: boolean;
}

/**
 * The follow-up worth interrupting for, or null — which is the common case.
 *
 * WHY OUTRANKS HOW MUCH. Disambiguating a confounded pick recovers information
 * that is otherwise unrecoverable; an appetite is a bonus on top of a pick that
 * already stands on its own. When both are eligible the ambiguous one wins.
 */
export function chooseFollowUp(ctx: FollowUpContext): FollowUp {
  if (!ctx.winner) return null;
  if (ctx.spent >= FOLLOWUP_BUDGET) return null;
  if (ctx.backToBack) return null;

  const loser = ctx.winner.id === ctx.pair.left.id ? ctx.pair.right : ctx.pair.left;
  const chips = reasonsFor(ctx.winner, loser);
  if (shouldAskWhy(ctx.attribution, chips)) return { kind: 'why', chips };

  if (
    ctx.decisionIndex % INTENSITY_EVERY === 0 &&
    agreedAxes(ctx.pair, ctx.winner).length >= INTENSITY_MIN_AGREED
  ) {
    return { kind: 'intensity', title: ctx.winner };
  }
  return null;
}
