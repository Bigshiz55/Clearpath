import { describe, it, expect } from 'vitest';
import { focusCategories, nextCategory, satisfiedCategories } from './planner';
import { initConfidence } from './confidence';
import type { ConfidenceState, TasteCategory } from './types';
import { TASTE_CATEGORIES } from './types';

function withConfidence(values: Partial<Record<TasteCategory, number>>): ConfidenceState {
  const state = initConfidence();
  for (const [k, v] of Object.entries(values)) {
    state[k as TasteCategory] = { category: k as TasteCategory, confidence: v as number, signalCount: 1, lastUpdatedTurn: 1 };
  }
  return state;
}

describe('nextCategory', () => {
  it('picks a core, weight-3 axis first from a fresh state', () => {
    expect(nextCategory(initConfidence(), [])).toBe('genres');
  });

  it('excludes already-asked axes', () => {
    expect(nextCategory(initConfidence(), ['genres'])).toBe('themes');
  });

  it('prefers a high-weight low-confidence axis over a niche one', () => {
    // genres already confident → the next core axis wins, never a niche one.
    const state = withConfidence({ genres: 0.9 });
    const picked = nextCategory(state, ['genres']);
    expect(picked).not.toBeNull();
    expect(['musicals', 'holiday', 'sports', 'westerns', 'blackAndWhite']).not.toContain(picked);
  });

  it('returns null when every axis is satisfied', () => {
    const all = Object.fromEntries(TASTE_CATEGORIES.map((c) => [c, 1])) as Record<TasteCategory, number>;
    expect(nextCategory(withConfidence(all), [])).toBeNull();
  });

  it('returns null when every axis has been asked', () => {
    expect(nextCategory(initConfidence(), [...TASTE_CATEGORIES])).toBeNull();
  });
});

describe('focusCategories', () => {
  it('returns the top-n highest-value axes', () => {
    expect(focusCategories(initConfidence(), 3)).toEqual(['genres', 'themes', 'pacing']);
  });
});

describe('satisfiedCategories', () => {
  it('lists axes at or above the threshold', () => {
    const state = withConfidence({ genres: 0.8, pacing: 0.5 });
    const satisfied = satisfiedCategories(state);
    expect(satisfied).toContain('genres');
    expect(satisfied).not.toContain('pacing');
  });
});
