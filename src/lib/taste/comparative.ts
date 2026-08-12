/**
 * A PAIRWISE CHOICE, EXPRESSED IN AXES INSTEAD OF AS A THUMBS-UP.
 *
 * THE DEFECT THIS EXISTS TO FIX, MEASURED. Showdown crossed into the canonical
 * log as one positive event about the WINNER, carrying that title's whole
 * fingerprint. Two things follow, and both are wrong:
 *
 *   IT CLAIMS TOO MUCH. The winner's fingerprint asserts every axis the film
 *   has, including all the ones the loser had too. The choice said nothing
 *   about those — both films offered them — and recording them as attraction is
 *   inventing agreement out of a comparison.
 *
 *   IT CLAIMS TOO LITTLE, in the direction that matters most. Only the winner
 *   is recorded, so a person can only ever accumulate evidence about axes the
 *   films they CHOOSE happen to assert. Someone who systematically avoids
 *   sentimental films never picks one, so no event ever carries
 *   `sentimentality`, so the belief stays at exactly 50 with exactly zero
 *   evidence — forever. Measured over 321 events across ten simulated sessions:
 *   `sentimentality` confidence 0.00, flat, while `darkness` reached 0.36.
 *   The engine could not learn a dislike from avoidance, which is how most
 *   dislikes are actually expressed.
 *
 * THE COMPARATIVE VECTOR FIXES BOTH. It records exactly what a choice means: on
 * each axis where the two films DIFFER, a move toward the winner's side, scaled
 * by how much of the choice is attributable to that axis. Axes they shared do
 * not move, because the choice was silent about them. Axes the LOSER carried
 * move down, because preferring the other film over one that offered them is
 * genuine evidence against them.
 *
 * HOW THE MAGNITUDE SURVIVES THE CROSSING WITHOUT A NEW ENGINE CONCEPT. The
 * preference engine already weights a dimension by how far it sits from
 * neutral — `bump(..., w * (info / 50))` where `info = |v - 50|`. So encoding
 * attribution as DISTANCE FROM 50 makes the engine apply it as a weight with no
 * change to the engine at all: a clean single-axis comparison writes a target of
 * 100, a four-way confounded one writes 65, and the engine's own arithmetic
 * turns that into full and quarter strength respectively. A confounded tap
 * cannot masquerade as a certainty because the number it writes is literally
 * closer to "no opinion".
 *
 * PURE. No I/O, no clock, no randomness.
 */

import type { TitleDimensions } from '@/lib/scoring/dimensions';
import { axisAttribution } from '@/lib/showdown/attribution';
import { TASTE_AXIS_KEYS } from './axes';
import type { TitleFingerprint } from './fingerprint';

/** Below this the two titles agree closely enough that the choice says nothing. */
export const MIN_AXIS_SPLIT = 0.15;

/**
 * AN ABSENT AXIS IS "UNREMARKABLE", NOT "UNKNOWN" — and getting this backwards
 * silently deleted the entire feature the first time.
 *
 * Requiring both fingerprints to assert an axis before comparing them sounds
 * like the careful choice. Measured, it took `weirdness`, `ambiguity`,
 * `horrorTolerance`, `character` and `sentimentality` from slow-but-rising to
 * flat 0.00 across 321 events — because the informative case is precisely the
 * one where ONE film is strange and the other simply is not described that way.
 * Demanding that both sides speak throws away every comparison worth making.
 *
 * So a missing value reads as the middle of the scale, and the resulting
 * observation is damped: it rests on an inference about one side rather than two
 * stated positions. Damped, not discarded — a weak observation is still an
 * observation, and discarding it is what produced the flat zeroes.
 */
export const INFERRED_DAMP = 0.7;

/**
 * HOW MANY AXES ONE TAP MAY SPEAK TO.
 *
 * Unbounded, a comparative vector carries every canonical axis either film
 * asserts — routinely twelve to fourteen. Attribution then divides the tap
 * between all of them and every axis lands on the floor, so a full twenty-round
 * session moved `darkness` to confidence 0.11 and the production ranker, whose
 * floor is 0.25, correctly declined to act on any of it. The payoff screen had
 * nothing to show because the evidence really was that thin.
 *
 * The fix is not to inflate the weights — it is to stop claiming so much. A
 * person choosing between two films is not making fourteen simultaneous
 * judgements; they are responding to the two or three things that actually
 * separate them. Keeping the strongest splits and dropping the trailing ones
 * concentrates the same tap into the axes it plausibly refers to, which is both
 * a truer reading of what happened and enough evidence to reach the ranker.
 *
 * FOUR, matching the reason-chip cap — the same claim about how many
 * distinctions a single choice can carry, made in two places that must agree.
 */
export const MAX_COMPARATIVE_AXES = 4;

export interface ComparativeResult {
  /** Canonical axis → target 0..100. Distance from 50 IS the evidence weight. */
  dims: TitleDimensions;
  /** How cleanly the pair isolated any single axis, 0..1. */
  attribution: number;
  /** Axes the pair genuinely split on, strongest first. */
  split: string[];
}

/**
 * What a preference for `winner` over `loser` says, axis by axis.
 *
 * Both fingerprints are in canonical 0..100 space, so this works for any
 * pairwise surface — Showdown today, a future voice interview, a "which of
 * these two" widget — without any of them needing its own crossing.
 */
export function comparativeDims(
  winner: TitleFingerprint,
  loser: TitleFingerprint,
): ComparativeResult {
  const deltas: Array<{ key: string; delta: number }> = [];
  for (const key of TASTE_AXIS_KEYS) {
    const w = winner.axes[key];
    const l = loser.axes[key];
    const hasW = typeof w === 'number';
    const hasL = typeof l === 'number';
    if (!hasW && !hasL) continue; // neither fingerprint speaks to it at all
    const damp = hasW && hasL ? 1 : INFERRED_DAMP;
    const delta = (((hasW ? w : 50) as number) - ((hasL ? l : 50) as number)) / 100;
    if (Math.abs(delta) < MIN_AXIS_SPLIT) continue;
    deltas.push({ key, delta: delta * damp });
  }

  /* Strongest splits only. The trailing axes are the ones the player almost
     certainly was not thinking about, and including them costs the leading axes
     most of their weight. */
  deltas.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
  deltas.splice(MAX_COMPARATIVE_AXES);

  const magnitudes = deltas.map((d) => Math.abs(d.delta));
  const dims: TitleDimensions = {};
  for (const { key, delta } of deltas) {
    /* THE SAME ATTRIBUTION FUNCTION SHOWDOWN'S OWN LEDGER USES. One definition
       of "how much of this tap belongs to this axis" — a second implementation
       here would drift from it and nobody would notice until the two disagreed
       about a person. */
    const attr = axisAttribution(Math.abs(delta), magnitudes);
    dims[key] = 50 + Math.sign(delta) * 50 * Math.min(1, attr);
  }

  const strongest = magnitudes.length > 0 ? Math.max(...magnitudes) : 0;
  return {
    dims,
    attribution: strongest > 0 ? axisAttribution(strongest, magnitudes) : 0,
    split: deltas.map((d) => d.key),
  };
}

/**
 * What a refusal of BOTH says: the shared ground is unwanted.
 *
 * The mirror of the above, and deliberately restricted to what the two films
 * AGREE on. Where they pull opposite ways, refusing both says nothing about
 * which side the person sits on, and inventing a direction there would fabricate
 * an opinion nobody expressed.
 */
export function sharedDims(
  a: TitleFingerprint,
  b: TitleFingerprint,
  direction: 1 | -1,
): TitleDimensions {
  const dims: TitleDimensions = {};
  for (const key of TASTE_AXIS_KEYS) {
    const av = a.axes[key];
    const bv = b.axes[key];
    // Shared ground requires BOTH to actually assert it. "Neither of these"
    // condemns what the two films have in common, and two silences have nothing
    // in common — that is the one place the strict reading is correct.
    if (typeof av !== 'number' || typeof bv !== 'number') continue;
    if (Math.abs(av - bv) / 100 >= MIN_AXIS_SPLIT) continue; // they disagree — stay silent
    const shared = (av + bv) / 2;
    if (Math.abs(shared - 50) < 15) continue; // neither asserts anything much
    /* The claim is about the SHARED POSITION, pushed the stated way. Refusing two
       bleak films is evidence against bleakness; refusing two sunny ones is
       evidence against sunniness, not for bleakness. */
    dims[key] = direction > 0 ? shared : 100 - shared;
  }
  return dims;
}
