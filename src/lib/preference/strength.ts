/**
 * DNA STRENGTH — an explainable, anti-gaming measure of how confidently AND
 * comprehensively WatchVerdict understands a user's taste. It is NOT "titles
 * rated": rating 100 near-identical action movies leaves comedy, animation,
 * romance, pacing tolerance, etc. unknown, so it must NOT reach 100%.
 *
 * Seven weighted categories, each 0..1, normalized over what is currently
 * MEASURABLE (a brand-new user with no post-watch outcomes isn't penalized for a
 * category that can't exist yet). Pure.
 */
import { DIMENSION_KEYS } from '@/lib/scoring/dimensions';
import type { ChannelProfile, DnaState } from './types';
import { evidenceConfidence, resolveConfidence } from './confidence';

export interface StrengthContext {
  /** 0..1 response reliability (from quality.ts). Omit ⇒ assumed reliable-ish. */
  reliability?: number;
  /** Post-watch recommendation outcomes available? Gates Outcome Calibration. */
  outcomeSamples?: number;
  /** 0..1 measured prediction accuracy (only trusted with enough samples). */
  predictionAccuracy?: number;
}

export interface StrengthCategory {
  key: string;
  label: string;
  weight: number; // nominal share
  score: number; // 0..1
  available: boolean; // counted in the normalized denominator
}

export interface StrengthResult {
  /** 0..100 "developed". */
  developed: number;
  categories: StrengthCategory[];
  /** A friendly, honest explanation of what's driving/limiting it. */
  summary: string;
}

const OUTCOME_MIN_SAMPLES = 10;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function channelDimEvidence(c: ChannelProfile): number {
  let s = 0;
  for (const k of DIMENSION_KEYS) s += c.dims[k]?.evidence ?? 0;
  return s;
}
function mapEvidence(m: Record<string, { evidence: number }>): number {
  let s = 0;
  for (const b of Object.values(m)) s += b.evidence;
  return s;
}

/** How much reliable WATCHED evidence we have (saturating). */
function experienceEvidence(state: DnaState): number {
  const ev = channelDimEvidence(state.experience) + mapEvidence(state.experience.genres);
  return evidenceConfidence(ev, 20); // ~20 evidence ⇒ ~63%
}

/**
 * Breadth: how much of the taste space we've actually mapped. The anti-gaming
 * lever — combines per-axis coverage (an axis counts once we have real evidence
 * on it, even if neutral) with genre diversity. Similar titles pile evidence on
 * a few axes/one genre and leave breadth low.
 */
function traitCoverage(state: DnaState): number {
  const AXIS_TARGET = 3; // evidence per axis to call it "mapped"
  let axisSum = 0;
  for (const k of DIMENSION_KEYS) {
    const ev = (state.experience.dims[k]?.evidence ?? 0) + (state.attraction.dims[k]?.evidence ?? 0);
    axisSum += Math.min(1, ev / AXIS_TARGET);
  }
  const axisCoverage = axisSum / DIMENSION_KEYS.length;

  const genres = new Set<string>([
    ...Object.keys(state.experience.genres),
    ...Object.keys(state.attraction.genres),
  ]);
  const GENRE_TARGET = 8;
  const genreDiversity = Math.min(1, genres.size / GENRE_TARGET);

  return clamp01(0.6 * axisCoverage + 0.4 * genreDiversity);
}

function attractionUnderstanding(state: DnaState): number {
  const ev = channelDimEvidence(state.attraction) + mapEvidence(state.attraction.genres);
  return evidenceConfidence(ev, 18);
}

/** How confidently we know what they RULE OUT. */
function negativeConfidence(state: DnaState): number {
  let mass = 0;
  for (const ch of [state.experience, state.attraction]) {
    for (const k of DIMENSION_KEYS) {
      const c = resolveConfidence(ch.dims[k] ?? { pref: 50, evidence: 0 });
      if (c.polarity < 0) mass += c.confidence;
    }
    for (const b of Object.values(ch.genres)) {
      const c = resolveConfidence(b);
      if (c.polarity < 0) mass += c.confidence;
    }
  }
  return evidenceConfidence(mass, 2.5);
}

function discoveryCoverage(state: DnaState): number {
  const ev = mapEvidence(state.discovery.genres) + state.discovery.novelty.evidence + channelDimEvidence(state.discovery);
  return evidenceConfidence(ev, 6);
}

/** Compute the explainable DNA Strength. */
export function dnaStrength(state: DnaState, ctx: StrengthContext = {}): StrengthResult {
  const reliability = typeof ctx.reliability === 'number' ? clamp01(ctx.reliability) : 0.85;
  const hasOutcomes = (ctx.outcomeSamples ?? 0) >= OUTCOME_MIN_SAMPLES && typeof ctx.predictionAccuracy === 'number';

  const categories: StrengthCategory[] = [
    { key: 'experience', label: 'Experience evidence', weight: 0.30, score: experienceEvidence(state), available: true },
    { key: 'coverage', label: 'Trait coverage', weight: 0.20, score: traitCoverage(state), available: true },
    { key: 'reliability', label: 'Response reliability', weight: 0.15, score: reliability, available: true },
    { key: 'attraction', label: 'Attraction understanding', weight: 0.10, score: attractionUnderstanding(state), available: true },
    { key: 'negative', label: 'Ruled-out confidence', weight: 0.10, score: negativeConfidence(state), available: true },
    { key: 'outcome', label: 'Outcome calibration', weight: 0.10, score: hasOutcomes ? clamp01(ctx.predictionAccuracy!) : 0, available: hasOutcomes },
    { key: 'discovery', label: 'Discovery coverage', weight: 0.05, score: discoveryCoverage(state), available: true },
  ];

  const denom = categories.reduce((s, c) => s + (c.available ? c.weight : 0), 0);
  const num = categories.reduce((s, c) => s + (c.available ? c.weight * c.score : 0), 0);
  const developed = denom > 0 ? Math.round((num / denom) * 100) : 0;

  return { developed, categories, summary: summarize(categories, developed) };
}

function summarize(categories: StrengthCategory[], developed: number): string {
  const weakest = categories
    .filter((c) => c.available)
    .sort((a, b) => a.score - b.score)
    .slice(0, 2)
    .map((c) => c.label.toLowerCase());
  if (developed >= 85) return 'Your Watch DNA is well developed.';
  if (weakest.length === 0) return `Your Watch DNA is ${developed}% developed.`;
  return `Your Watch DNA is ${developed}% developed — most room to grow in ${weakest.join(' and ')}.`;
}
