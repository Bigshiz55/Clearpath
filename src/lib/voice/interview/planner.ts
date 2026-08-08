/**
 * TOPIC PLANNER.
 *
 * Given the confidence state and what has already been asked, pick the axis with
 * the most to gain: the one whose weight × remaining-uncertainty is highest and
 * that we have not spent a question on yet. This is why the interview spends its
 * early questions on the core axes (they weigh 3×) and only drifts to the niche
 * once the important stuff is settled. Returns `null` when every axis is either
 * satisfied or already asked — the "we're done here" signal.
 *
 * Pure. Deterministic tie-breaking by canonical category order.
 */
import type { ConfidenceState, TasteCategory } from './types';
import { TASTE_CATEGORIES } from './types';
import { CATEGORY_META } from './categories';

/** Confidence at or above which an axis counts as satisfied. */
export const SATISFIED_THRESHOLD = 0.7;

/** The value of asking about an axis: its weight scaled by remaining uncertainty. */
export function axisValue(state: ConfidenceState, category: TasteCategory): number {
  return CATEGORY_META[category].weight * (1 - state[category].confidence);
}

/**
 * The highest-value axis still worth asking about that has not been asked and is
 * not already satisfied. `null` when there is nothing left to usefully explore.
 */
export function nextCategory(
  state: ConfidenceState,
  asked: TasteCategory[],
  threshold = SATISFIED_THRESHOLD,
): TasteCategory | null {
  const askedSet = new Set(asked);
  let best: TasteCategory | null = null;
  let bestValue = -Infinity;
  for (const category of TASTE_CATEGORIES) {
    if (askedSet.has(category)) continue;
    if (state[category].confidence >= threshold) continue;
    const value = axisValue(state, category);
    if (value > bestValue) {
      bestValue = value;
      best = category;
    }
  }
  return best;
}

/**
 * The top-`n` low-confidence axes worth steering toward this turn (regardless of
 * whether they have been asked). Ordered by value, deterministic on ties.
 */
export function focusCategories(state: ConfidenceState, n: number, threshold = SATISFIED_THRESHOLD): TasteCategory[] {
  return TASTE_CATEGORIES.filter((c) => state[c].confidence < threshold)
    .map((category) => ({ category, value: axisValue(state, category) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, Math.max(0, n))
    .map((x) => x.category);
}

/** The axes we now understand well enough to stop asking about. */
export function satisfiedCategories(state: ConfidenceState, threshold = SATISFIED_THRESHOLD): TasteCategory[] {
  return TASTE_CATEGORIES.filter((c) => state[c].confidence >= threshold);
}
