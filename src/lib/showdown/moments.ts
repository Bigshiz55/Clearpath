/**
 * WHAT THE ENGINE IS DOING, SAID OUT LOUD.
 *
 * Twelve visually identical screens is what makes a calibration feel like a
 * survey, and the usual fix — sprinkling labels like "CURVEBALL!" on random
 * rounds — is worse than none: players work out inside three rounds that the
 * words are decoration, and from then on the whole screen reads as decoration.
 *
 * So every moment here is DERIVED FROM THE MATCHUP THE PLANNER ACTUALLY CHOSE
 * and is false if the engine is not doing that thing. "LET'S TEST THAT" appears
 * when the pair was selected to press on a belief that is forming. "CLOSE CALL"
 * appears when the engine's own prediction says this person will find the two
 * films nearly equally appealing — which is exactly when the answer is worth
 * most, and exactly when a player feels the game reading them. "CURVEBALL" is a
 * genuinely unusual pair the planner reached for because the ordinary ones had
 * stopped teaching it anything.
 *
 * The words are a WINDOW ONTO THE MODEL, not a costume on top of it. That is
 * the entire difference between "this thing is figuring me out" and "this thing
 * has a hype man".
 *
 * PURE. No I/O, no clock, no randomness.
 */

import type { TraitProfile } from '@/lib/voice/quickdna/traits';
import { traitConfidence } from '@/lib/voice/quickdna/traits';
import type { Matchup } from './matchup';
import { phaseFor, predictedAppeal, type ScanPhase } from './scanner';

export type MomentKind =
  | 'instinct'
  | 'test-that'
  | 'curveball'
  | 'close-call'
  | 'caught-something'
  | 'final-test';

export interface Moment {
  kind: MomentKind;
  /** Shown above the matchup. Short enough to read in the half-second before tapping. */
  label: string;
  /** One line of why, when it is worth saying. Never generic. */
  detail: string | null;
}

/** How close the predicted appeals must be for the engine to call it a close call. */
export const CLOSE_CALL_GAP = 0.12;

/** How confident an axis must be before pressing on it counts as testing a belief. */
export const FORMING_MIN = 0.3;
/** Above this the belief is settled, and re-asking is confirmation rather than a test. */
export const FORMING_MAX = 0.8;

/** Recognition below which a pair counts as off the beaten track. */
export const CURVEBALL_RECOGNITION = 0.45;

export interface MomentContext {
  matchup: Matchup;
  profile: TraitProfile;
  /** 0-based index of the decision about to be made. */
  decisionIndex: number;
  total: number;
  /** True when a discovery is ready to be surfaced instead of a matchup. */
  discoveryReady?: boolean;
}

/**
 * Which moment this round is, or null for the ordinary case.
 *
 * NULL IS THE COMMON ANSWER and that is deliberate. A label on every round is
 * the same as a label on none: it stops carrying information and starts being
 * chrome. Most rounds are two posters and a tap.
 */
export function momentFor(ctx: MomentContext): Moment | null {
  const { matchup, profile, decisionIndex, total } = ctx;
  const phase: ScanPhase = phaseFor(decisionIndex, total);

  if (ctx.discoveryReady) {
    return {
      kind: 'caught-something',
      label: 'We caught something',
      detail: null,
    };
  }

  // The opening rounds genuinely are instinct: nothing is known, so the planner
  // is sweeping the universe rather than testing anything.
  if (decisionIndex === 0) {
    return { kind: 'instinct', label: 'Go with your gut', detail: 'No wrong answers yet.' };
  }

  const lastQuarter = decisionIndex >= total - Math.max(2, Math.round(total * 0.15));
  if (lastQuarter && phase === 'resolve') {
    return {
      kind: 'final-test',
      label: 'Final test',
      detail: 'The closest call we can build for you.',
    };
  }

  /* CLOSE CALL — the engine predicts this person will want both about equally.
     Computed from the profile the player has actually built, so it is only ever
     true when the model really is unsure, and it is the highest-information
     round in the game. */
  const gap = Math.abs(predictedAppeal(matchup.left, profile) - predictedAppeal(matchup.right, profile));
  const known = matchup.testing.some((k) => traitConfidence(profile, k) >= FORMING_MIN);
  if (known && gap <= CLOSE_CALL_GAP) {
    return {
      kind: 'close-call',
      label: 'Close call',
      detail: 'We think you’d take either. Prove us wrong.',
    };
  }

  /* CURVEBALL — a deliberately unusual pair. The planner reaches for these when
     the well-known titles have stopped separating anything, so the label is
     true by construction rather than by a coin flip. */
  const recognition = Math.min(matchup.left.recognition, matchup.right.recognition);
  if (recognition <= CURVEBALL_RECOGNITION) {
    return { kind: 'curveball', label: 'Curveball', detail: 'Off the beaten track.' };
  }

  /* LET'S TEST THAT — the pair presses on a belief that is forming but not
     settled. Both bounds matter: below the floor there is no hypothesis to test,
     above the ceiling we are asking a question we already know the answer to. */
  if (phase !== 'sweep') {
    const lead = matchup.testing[0];
    if (lead) {
      const c = traitConfidence(profile, lead);
      if (c >= FORMING_MIN && c <= FORMING_MAX) {
        return { kind: 'test-that', label: 'Let’s test that', detail: null };
      }
    }
  }

  return null;
}
