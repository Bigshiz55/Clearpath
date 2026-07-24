/**
 * CASE UPDATE — the premium end-of-round reveal. Diffs the DNA before and after a
 * Case Round into human "New Evidence" and "Confidence Improved" lines, so points
 * are never shown without explaining what actually got sharper. Pure.
 */
import { DIMENSIONS, DIMENSION_KEYS } from '@/lib/scoring/dimensions';
import type { DnaState } from './types';
import { effectiveTaste } from './explain';
import { resolveConfidence } from './confidence';
import { RESOLVE_CONF } from './openQuestions';

const DIM_BY_KEY = new Map(DIMENSIONS.map((d) => [d.key, d]));

export interface ConfidenceDelta {
  key: string;
  label: string;
  deltaPct: number; // e.g. +8
}

export interface RecsDelta {
  movedUp?: number;
  movedDown?: number;
  ruledOut?: number;
  newTopMatches?: number;
}

export interface CaseUpdateResult {
  newEvidence: string[];
  confidenceImproved: ConfidenceDelta[];
  recs?: RecsDelta;
}

function dimSentence(key: string, leansHigh: boolean): string {
  const d = DIM_BY_KEY.get(key);
  if (!d) return `We learned more about ${key}.`;
  if (key === 'realism') return leansHigh ? 'You prefer grounded, realistic stories.' : 'You enjoy fantastical, unreal worlds.';
  if (key === 'romance') return leansHigh ? 'You like a central romance.' : 'Romance is best kept minimal for you.';
  if (key === 'pacing') return leansHigh ? 'You prefer a fast pace.' : 'You tolerate a slow burn.';
  if (key === 'darkness') return leansHigh ? 'You lean into dark, heavy themes.' : 'You prefer lighter, feel-good tones.';
  return leansHigh ? `You lean toward ${d.high.toLowerCase()}.` : `You lean toward ${d.low.toLowerCase()}.`;
}

/**
 * Compute the Case Update. `recs` (reranking counts) is supplied by the caller
 * from the actual recommendation diff — this module only formats the DNA change.
 */
export function caseUpdate(before: DnaState, after: DnaState, recs?: RecsDelta): CaseUpdateResult {
  const tb = effectiveTaste(before);
  const ta = effectiveTaste(after);

  const confidenceImproved: ConfidenceDelta[] = [];
  const newEvidence: string[] = [];

  for (const k of DIMENSION_KEYS) {
    const b = tb[k];
    const a = ta[k];
    if (!b || !a) continue;
    const delta = a.confidence - b.confidence;
    if (delta >= 0.01) {
      const d = DIM_BY_KEY.get(k);
      confidenceImproved.push({ key: k, label: d?.label ?? k, deltaPct: Math.round(delta * 100) });
    }
    // Newly crossed into "resolved & directional" ⇒ a fresh piece of evidence.
    if (b.confidence < RESOLVE_CONF && a.confidence >= RESOLVE_CONF && a.polarity !== 0) {
      newEvidence.push(dimSentence(k, a.polarity > 0));
    }
  }

  // Genres that newly became confidently negative are strong "ruled out" evidence.
  for (const g of Object.keys(after.attraction.genres)) {
    const ca = resolveConfidence(after.attraction.genres[g]!);
    const cbBelief = before.attraction.genres[g];
    const cb = cbBelief ? resolveConfidence(cbBelief).confidence : 0;
    if (cb < RESOLVE_CONF && ca.confidence >= RESOLVE_CONF && ca.polarity < 0) {
      newEvidence.push(`${g.replace(/[_-]+/g, ' ')} remains a strong negative.`);
    }
  }

  confidenceImproved.sort((a, b) => b.deltaPct - a.deltaPct);
  return { newEvidence, confidenceImproved: confidenceImproved.slice(0, 6), recs };
}
