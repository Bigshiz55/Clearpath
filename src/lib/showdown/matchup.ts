/**
 * DNA SHOWDOWN — choosing the matchup, on the canonical dimensions.
 *
 * Two posters and a tap is trivial. The feature is WHICH two, and the answer is
 * the pair whose outcome we can least predict on the axis we least understand.
 *
 * WHAT MAKES A PAIR WORTH ASKING
 *
 *   SEPARATION  — the two titles must actually disagree on an axis. A pair that
 *                 agrees everywhere is a coin toss that teaches nothing.
 *   UNCERTAINTY — the axis must still be open. Re-asking a settled question is
 *                 how a quiz signals it is not listening.
 *   UNPREDICTABILITY — we must not already know the answer. A pair whose winner
 *                 the profile can call confidently teaches nothing when it wins.
 *
 * LEAD-AXIS GAIN, NOT A SUM. Summing separation×uncertainty over every axis
 * rewards pairs that differ in many small ways, which is exactly the confounded
 * comparison this game exists to avoid — and it makes the planner nearly
 * identical for every player, because a long vector of small differences is a
 * property of the CATALOGUE rather than of the person. Leading with the single
 * most open axis and damping the rest keeps the choice attributable and lets two
 * players diverge after one answer.
 *
 * THE TWIST IS A ROUND TYPE, NOT A SUBSYSTEM. A pair whose disagreement is
 * concentrated on ONE axis is a controlled comparison: everything else is held
 * roughly constant, so the answer is attributable to that axis. The planner
 * simply notices when a candidate pair has that shape and labels it — the same
 * scoring, the same pool, one extra classification. `verdict.ts` then grants it
 * the stronger attribution it has earned.
 *
 * PURE. No I/O, no clock, no randomness — same inputs always give the same pair.
 */

import { DIMENSION_KEYS, type TitleDimensions } from '@/lib/scoring/dimensions';
import { axisUncertainty } from '@/lib/preference/infogain';
import type { DnaState } from '@/lib/preference/types';

/** A title the Showdown can put up. Mirrors what the calibration pool yields. */
export interface ShowdownTitle {
  /** Stable canonical key, e.g. "movie:603". */
  key: string;
  title: string;
  year: number | null;
  posterPath: string | null;
  mediaType: 'movie' | 'tv';
  dims: TitleDimensions;
}

/**
 * How much the secondary axes count once the leading one is chosen.
 *
 * Load-bearing. At 1.0 the score is a plain sum and the planner picks the same
 * "generally diagnostic" pairs for everyone; at 0 it ignores real secondary
 * information. 0.35 keeps the lead axis decisive while letting a genuinely
 * broad pair outrank a narrow one.
 */
export const SECONDARY = 0.35;

/**
 * How concentrated a pair's disagreement must be to count as a Twist.
 *
 * The share of total separation carried by the single largest axis. At 0.55 the
 * lead axis must carry more than half of everything that differs between the
 * two titles — enough that "they chose the one that is "faster"" is a fair
 * reading rather than a guess dressed up as one.
 */
export const TWIST_DOMINANCE = 0.55;

/** A Twist also needs the controlled axis to differ enough to be perceptible. */
export const TWIST_MIN_SEPARATION = 0.3;

/** Axes closer together than this are treated as agreeing. */
export const MIN_SEPARATION = 0.12;

export type MatchupKind = 'pair' | 'twist';

export interface Matchup {
  left: ShowdownTitle;
  right: ShowdownTitle;
  /** Axes this pair is being asked to resolve, strongest first. */
  testing: string[];
  /** Expected information gain. */
  gain: number;
  /**
   * `twist` when the disagreement is concentrated on `testing[0]`, so the
   * answer is attributable to that one axis.
   */
  kind: MatchupKind;
}

/** How hard two titles disagree on one axis, 0..1. */
export function separation(a: TitleDimensions, b: TitleDimensions, key: string): number {
  const av = a[key];
  const bv = b[key];
  if (typeof av !== 'number' || typeof bv !== 'number') return 0;
  return Math.abs(av - bv) / 100;
}

/**
 * What the profile currently believes about an axis, 0..100, and how strongly.
 *
 * Reads the canonical channels directly — there is no second profile here, and
 * deliberately so: a planner that consulted its own model would drift away from
 * the one the recommendations actually use.
 */
function belief(state: DnaState, key: string): { pref: number; evidence: number } {
  const e = state.experience.dims[key];
  const a = state.attraction.dims[key];
  const evidence = (e?.evidence ?? 0) + (a?.evidence ?? 0);
  if (evidence <= 0) return { pref: 50, evidence: 0 };
  const pref = ((e?.pref ?? 50) * (e?.evidence ?? 0) + (a?.pref ?? 50) * (a?.evidence ?? 0)) / evidence;
  return { pref, evidence };
}

/**
 * How confidently the profile already predicts this pair's winner, 0..1.
 *
 * Uncertainty about the AXES is a property of the model; uncertainty about the
 * ANSWER is a property of this person facing these two titles. Without this, two
 * users with opposite taste get shown almost the same pairs, because "generally
 * diagnostic" is the same for everybody. With it, each player's pairs bend
 * toward their own decision boundary and the sessions diverge.
 */
export function predictability(a: TitleDimensions, b: TitleDimensions, state: DnaState): number {
  let lead = 0;
  for (const k of DIMENSION_KEYS) {
    const av = a[k];
    const bv = b[k];
    if (typeof av !== 'number' || typeof bv !== 'number') continue;
    const { pref, evidence } = belief(state, k);
    if (evidence <= 0) continue;
    const decisiveness = Math.abs(pref - 50) / 50;
    // Which side this axis favours, and by how much.
    const favours = (Math.abs(av - pref) - Math.abs(bv - pref)) / 100;
    lead += favours * decisiveness * Math.min(1, evidence / 4);
  }
  return Math.min(1, Math.abs(lead));
}

export interface GainResult {
  gain: number;
  testing: string[];
  kind: MatchupKind;
}

/**
 * What this pair would teach, about what, and whether it is controlled.
 */
export function matchupGain(
  a: TitleDimensions,
  b: TitleDimensions,
  uncertainty: Record<string, number>,
  state: DnaState,
): GainResult {
  const scored: Array<{ key: string; value: number; sep: number }> = [];
  let totalSeparation = 0;

  for (const k of DIMENSION_KEYS) {
    const sep = separation(a, b, k);
    if (sep < MIN_SEPARATION) continue;
    totalSeparation += sep;
    const value = sep * (uncertainty[k] ?? 1);
    if (value > 0) scored.push({ key: k, value, sep });
  }
  if (scored.length === 0) return { gain: 0, testing: [], kind: 'pair' };

  scored.sort((x, y) => y.value - x.value);
  const lead = scored[0]!;
  const rest = scored.slice(1).reduce((s, x) => s + x.value, 0);

  // Concentration is measured on SEPARATION, not on gain: whether the pair is a
  // controlled comparison is a fact about the two titles, not about what we
  // happen to be uncertain about today.
  const dominance = totalSeparation > 0 ? lead.sep / totalSeparation : 0;
  const kind: MatchupKind =
    dominance >= TWIST_DOMINANCE && lead.sep >= TWIST_MIN_SEPARATION ? 'twist' : 'pair';

  const boundary = 1 - 0.85 * predictability(a, b, state);
  // A controlled pair is worth more per answer because its answer is
  // attributable; the bonus is modest so the planner cannot be gamed into
  // showing only twists while the broad axes stay unexplored.
  const controlled = kind === 'twist' ? 1.25 : 1;

  return {
    gain: (lead.value + SECONDARY * rest) * boundary * controlled,
    testing: scored.slice(0, 3).map((x) => x.key),
    kind,
  };
}

export interface MatchupContext {
  pool: readonly ShowdownTitle[];
  state: DnaState;
  /** Title keys already shown this session or in an earlier one. */
  seen: readonly string[];
  /** Pair keys already asked — never repeat a matchup. */
  askedPairs: readonly string[];
}

/** Order-independent identity for a pair. */
export function pairKey(a: string, b: string): string {
  return [a, b].sort().join('|');
}

/**
 * The most informative pair still worth asking, or null.
 *
 * Returning null is a real outcome the caller must handle: once everything that
 * separates the remaining titles is settled, another round is theatre.
 */
export function nextMatchup(ctx: MatchupContext, floor = 0.04): Matchup | null {
  const uncertainty = axisUncertainty(ctx.state);
  const pool = ctx.pool.filter((t) => !ctx.seen.includes(t.key));
  const asked = new Set(ctx.askedPairs);

  let best: Matchup | null = null;
  let bestGain = floor;

  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const a = pool[i]!;
      const b = pool[j]!;
      if (asked.has(pairKey(a.key, b.key))) continue;
      const { gain, testing, kind } = matchupGain(a.dims, b.dims, uncertainty, ctx.state);
      if (gain > bestGain) {
        bestGain = gain;
        best = { left: a, right: b, testing, gain, kind };
      }
    }
  }
  return best;
}
