/**
 * Belief + confidence math — the heart of "never overreact to one answer;
 * require repeated evidence." Every trait (a dimension axis, a genre, a person)
 * is a running evidence-weighted mean (`pref`) plus a total evidence weight
 * (`evidence`). Confidence in a directional claim ("likes X") saturates on
 * evidence and scales with how decisive the lean is — so a single tap can never
 * mint a "strong" trait, and repeated, consistent taps do.
 *
 * Pure math. Mirrors the semantics already used in `scoring/dimensions.ts`
 * (evidence curve + decisiveness) so the new engine reads consistently with the
 * authoritative one, but keeps its own state so scoring stays untouched.
 */
import type { TraitBelief, TraitConfidence } from './types';

/** Evidence needed for the confidence curve to reach ~63%. Higher = more skeptical. */
export const CONFIDENCE_K = 8;
/** Below this the trait is treated as "no lean / unknown" for polarity. */
export const NEUTRAL_BAND = 6; // |pref-50| within this ⇒ polarity 0

export function emptyBelief(): TraitBelief {
  return { pref: 50, evidence: 0 };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Fold one observation (a target position 0..100 with a weight ≥ 0) into a
 * belief as an evidence-weighted running mean. Order-independent and associative
 * in evidence, so re-deriving from an event log is deterministic.
 */
export function accumulate(belief: TraitBelief, target: number, weight: number): TraitBelief {
  if (!(weight > 0) || !Number.isFinite(target)) return belief;
  const t = clamp(target, 0, 100);
  const nextEvidence = belief.evidence + weight;
  // Weighted mean: seed at 50 carries zero evidence, so the first real
  // observation moves pref toward the target rather than sitting half-way.
  const pref = (belief.pref * belief.evidence + t * weight) / nextEvidence;
  return { pref, evidence: nextEvidence };
}

/** 0..1 — how much total evidence we have on this trait (saturating). */
export function evidenceConfidence(evidence: number, k = CONFIDENCE_K): number {
  if (!(evidence > 0)) return 0;
  return 1 - Math.exp(-evidence / k);
}

/** 0..1 — how far the lean sits from neutral. */
export function decisiveness(pref: number): number {
  return clamp(Math.abs(pref - 50) / 50, 0, 1);
}

function tierFor(confidence: number): TraitConfidence['tier'] {
  if (confidence >= 0.66) return 'strong';
  if (confidence >= 0.4) return 'moderate';
  if (confidence >= 0.15) return 'weak';
  return 'learning';
}

/**
 * Resolve a belief into a confidence read-out. `confidence` is the confidence in
 * the DIRECTIONAL claim: evidence × decisiveness. A pile of evidence with no lean
 * (pref≈50) still reads low-confidence ("we don't know"), and a strong lean from
 * one tap still reads low ("not enough evidence yet").
 */
export function resolveConfidence(belief: TraitBelief, k = CONFIDENCE_K): TraitConfidence {
  const evConf = evidenceConfidence(belief.evidence, k);
  const dec = decisiveness(belief.pref);
  const confidence = clamp(evConf * dec, 0, 1);
  const lean = belief.pref - 50;
  const polarity: -1 | 0 | 1 = Math.abs(lean) < NEUTRAL_BAND ? 0 : lean > 0 ? 1 : -1;
  return {
    pref: belief.pref,
    evidence: belief.evidence,
    confidence,
    decisiveness: dec,
    polarity,
    tier: tierFor(confidence),
  };
}

/** Confidence as a friendly whole-number percent, e.g. 97. */
export function confidencePct(belief: TraitBelief, k = CONFIDENCE_K): number {
  return Math.round(resolveConfidence(belief, k).confidence * 100);
}
