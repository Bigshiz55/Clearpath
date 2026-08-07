/**
 * THE CONFIDENCE MODEL.
 *
 * Per-axis confidence with diminishing returns: each fresh signal on an axis
 * raises confidence toward 1, but by less than the last, so a single answer can
 * never mint certainty and repeated, consistent answers are what settle an axis.
 * The overall roll-up is weighted by `CATEGORY_META`, so a high overall is only
 * reachable by covering the axes that define a viewer — nailing the niche ones
 * cannot get you there.
 *
 * Pure math. Time enters as an explicit `turn` argument; no clock is read.
 */
import type { ConfidenceState, CategoryConfidence, TasteSignal, TasteCategory } from './types';
import { TASTE_CATEGORIES } from './types';
import { CATEGORY_META } from './categories';

/** Head-room a strong (strength 1) first signal claims on a fresh axis. */
export const CONF_GAIN_BASE = 0.8;
/** How fast the per-axis gain decays as more signals land on the same axis. */
export const CONF_DECAY = 0.35;

const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

/** A fresh state: every axis at zero confidence, zero signals, turn zero. */
export function initConfidence(): ConfidenceState {
  const state = {} as ConfidenceState;
  for (const category of TASTE_CATEGORIES) {
    state[category] = { category, confidence: 0, signalCount: 0, lastUpdatedTurn: 0 };
  }
  return state;
}

/**
 * The per-signal gain for an axis: scaled by the signal's strength and decayed
 * by how much evidence the axis already carries. Exposed for tests + tuning.
 */
export function gainFor(strength: number, signalCount: number): number {
  return (clamp01(strength) * CONF_GAIN_BASE) / (1 + CONF_DECAY * Math.max(0, signalCount));
}

/**
 * Fold one signal into the confidence state. Each category the signal names has
 * its confidence raised by `(1 - confidence) * gain` (so it approaches, never
 * overshoots, 1), its signal count bumped, and its last-updated turn set.
 * Returns a NEW state; unnamed axes are carried through untouched. Never throws
 * on an empty or malformed category list.
 */
export function applySignal(state: ConfidenceState, signal: TasteSignal, turn: number): ConfidenceState {
  const next: ConfidenceState = { ...state };
  const strength = clamp01(signal.strength);
  const seen = new Set<TasteCategory>();
  for (const category of signal.categories ?? []) {
    const cur = next[category];
    if (!cur || seen.has(category)) continue; // unknown axis / duplicate → skip
    seen.add(category);
    const gain = gainFor(strength, cur.signalCount);
    const confidence = Math.min(1, cur.confidence + (1 - cur.confidence) * gain);
    next[category] = {
      category,
      confidence,
      signalCount: cur.signalCount + 1,
      lastUpdatedTurn: turn,
    };
  }
  return next;
}

/**
 * The weighted overall confidence, 0..1. Uses `CATEGORY_META` weights so the
 * core axes dominate; capped at 1. The completion bar reads this.
 */
export function overallConfidence(state: ConfidenceState): number {
  let weightSum = 0;
  let acc = 0;
  for (const category of TASTE_CATEGORIES) {
    const weight = CATEGORY_META[category].weight;
    weightSum += weight;
    acc += weight * state[category].confidence;
  }
  return weightSum > 0 ? Math.min(1, acc / weightSum) : 0;
}

/** Read a single axis (convenience for callers that don't want the whole map). */
export function confidenceOf(state: ConfidenceState, category: TasteCategory): CategoryConfidence {
  return state[category];
}
