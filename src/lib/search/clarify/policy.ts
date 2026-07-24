/**
 * Clarification policy — CANONICAL, language-independent. Thresholds are on the
 * confidence DISTRIBUTION (never on English wording):
 *   HIGH   (top ≥ 0.80)         → answer immediately, no clarification
 *   MEDIUM (0.55 ≤ top < 0.80)  → answer the top reading + show 2–3 alternatives
 *   LOW    (top < 0.55)         → ask ONE tap-based clarification
 * When nothing resolves at all → an honest "could not identify" with suggestions.
 */
import type { InterpretationSet } from './interpret';
import type { CanonicalInterpretation } from './canonical';

export const POLICY_THRESHOLDS = { high: 0.8, medium: 0.55 };

export type PolicyAction = 'answer' | 'answer_with_alternatives' | 'clarify' | 'could_not_identify';
export type ConfidenceBand = 'high' | 'medium' | 'low';

export interface ClarificationDecision {
  action: PolicyAction;
  band: ConfidenceBand;
  primary: CanonicalInterpretation | null;
  /** For medium: the alternate readings. For low: the tap options. Canonical. */
  options: CanonicalInterpretation[];
  topConfidence: number;
}

export function decidePolicy(set: InterpretationSet): ClarificationDecision {
  const top = set.interpretations[0] ?? null;
  const topConfidence = top?.confidence ?? 0;

  // Nothing meaningful resolved → honest could-not-identify (never a raw dead end).
  const nothingResolved = !top || top.intent === 'unknown' || (set.entities.entityType === 'none' && topConfidence < POLICY_THRESHOLDS.medium);
  if (nothingResolved) {
    return { action: 'could_not_identify', band: 'low', primary: null, options: set.interpretations.slice(0, 4), topConfidence };
  }

  if (topConfidence >= POLICY_THRESHOLDS.high) {
    return { action: 'answer', band: 'high', primary: top, options: [], topConfidence };
  }
  if (topConfidence >= POLICY_THRESHOLDS.medium) {
    return { action: 'answer_with_alternatives', band: 'medium', primary: top, options: set.interpretations.slice(1, 4), topConfidence };
  }
  // LOW → one tap-based clarification with the strongest distinct interpretations.
  return { action: 'clarify', band: 'low', primary: top, options: set.interpretations.slice(0, 4), topConfidence };
}
