/**
 * QUICK DNA — the trait vocabulary.
 *
 * The old calibration produced genre scores, and genre scores are the reason it
 * felt like a survey: "Horror 1, Crime 9" is what a form learns, not what a
 * person means. Someone can rate horror a 1 and still love The Silence of the
 * Lambs, because what they dislike is the SUPERNATURAL, not the fear.
 *
 * So Quick DNA reasons in latent traits — the things that actually predict
 * whether a person will enjoy a title — and treats genres as one of several
 * ways to observe them. Every probe and every movie reaction updates traits,
 * which is what lets a movie do the work of five questions: reacting to Zodiac
 * says something about investigation, darkness, grounding AND patience at once.
 *
 * Each trait is a 0..100 belief with an evidence weight, using the SAME
 * `accumulate` weighted mean the preference engine uses, so nothing here needs
 * a second theory of confidence and evidence can never be destroyed — only
 * added to and outweighed.
 *
 * PURE. No I/O, no clock, no randomness.
 */

import { accumulate } from '@/lib/preference/confidence';
import type { TraitBelief } from '@/lib/preference/types';

/**
 * The traits worth learning in eighty seconds. Chosen to be (a) observable from
 * a one-word answer or a single movie reaction, (b) genuinely discriminating —
 * real people split on them — and (c) non-redundant.
 */
export const QUICK_TRAITS = {
  investigation: 'Investigation & mystery-solving',
  crime: 'Crime & criminal worlds',
  trueCrime: 'Real cases over invented ones',
  legal: 'Courtroom & legal process',
  psychological: 'Psychological tension',
  supernatural: 'Ghosts & the supernatural',
  horrorTolerance: 'Appetite for fear',
  darkness: 'Comfort with dark material',
  action: 'Action & spectacle',
  comedy: 'Humour as the point',
  romance: 'Romance as the point',
  scifi: 'Science fiction',
  fantasy: 'Fantasy & the impossible',
  grounded: 'Grounded over fantastical',
  patience: 'Patience for a slow build',
  complexity: 'Appetite for demanding stories',
  documentary: 'True stories & documentary',
  international: 'Non-English-language titles',
  subtitles: 'Willingness to read subtitles',
  vintage: 'Older films',
} as const;

export type TraitKey = keyof typeof QUICK_TRAITS;
export const TRAIT_KEYS = Object.keys(QUICK_TRAITS) as TraitKey[];

export type TraitProfile = Partial<Record<TraitKey, TraitBelief>>;

const NEUTRAL: TraitBelief = { pref: 50, evidence: 0 };

/**
 * QUICK DNA HAS ITS OWN CONFIDENCE CURVE, and the distinction matters.
 *
 * Two different questions are being asked of the same number. "How much does
 * this count against everything else we know about you?" is the EVIDENCE
 * WEIGHT, and it stays on the shared ladder — a calibration answer must never
 * outrank a title you actually watched. "Have we heard enough to stop asking
 * about this?" is CONFIDENCE, and it is local to a run.
 *
 * The engine's `CONFIDENCE_K` of 8 answers the first question over a lifetime
 * of events. Applied here it says a whole eighty-second run is worth about 0.2
 * confidence in anything, so the planner would never consider a trait settled
 * and the summary would never be sure enough to say a word. K of 1.2 matches
 * the scale this actually operates on: one clear observation is a lean, two
 * agreeing ones are enough to move on and say something.
 */
export const QUICK_CONFIDENCE_K = 1.2;

export function quickConfidence(evidence: number): number {
  return evidence > 0 ? 1 - Math.exp(-evidence / QUICK_CONFIDENCE_K) : 0;
}

export function traitBelief(profile: TraitProfile, key: TraitKey): TraitBelief {
  return profile[key] ?? NEUTRAL;
}

/** Fold one observation into a trait. Weighted mean — order does not matter. */
export function observe(
  profile: TraitProfile,
  key: TraitKey,
  target: number,
  weight: number,
): TraitProfile {
  if (!(weight > 0) || !Number.isFinite(target)) return profile;
  return { ...profile, [key]: accumulate(traitBelief(profile, key), target, weight) };
}

/** Fold several at once — one movie reaction touches many traits. */
export function observeAll(
  profile: TraitProfile,
  observations: Array<{ key: TraitKey; target: number; weight: number }>,
): TraitProfile {
  let next = profile;
  for (const o of observations) next = observe(next, o.key, o.target, o.weight);
  return next;
}

/**
 * How sure are we about this trait? Drives the planner: the next question is
 * the one that reduces the most uncertainty, so a confident trait is never
 * asked about again.
 */
export function traitConfidence(profile: TraitProfile, key: TraitKey): number {
  return quickConfidence(traitBelief(profile, key).evidence);
}

/**
 * How much is still unknown, 0..1. This is the quantity the planner maximises
 * over — "uncertainty × how much this question would resolve it" is the whole
 * of the information-gain heuristic, and it is deliberately simple arithmetic
 * rather than anything that needs a model.
 */
export function traitUncertainty(profile: TraitProfile, key: TraitKey): number {
  return 1 - traitConfidence(profile, key);
}

/** Total evidence across every trait — a rough "how much do we know" number. */
export function totalEvidence(profile: TraitProfile): number {
  return TRAIT_KEYS.reduce((sum, k) => sum + traitBelief(profile, k).evidence, 0);
}

/** Traits we are confident about AND that lean decisively, strongest first. */
export function decidedTraits(
  profile: TraitProfile,
  minConfidence = 0.3,
  minLean = 18,
): Array<{ key: TraitKey; pref: number; confidence: number }> {
  return TRAIT_KEYS.map((key) => ({
    key,
    pref: traitBelief(profile, key).pref,
    confidence: traitConfidence(profile, key),
  }))
    .filter((t) => t.confidence >= minConfidence && Math.abs(t.pref - 50) >= minLean)
    .sort((a, b) => Math.abs(b.pref - 50) * b.confidence - Math.abs(a.pref - 50) * a.confidence);
}
