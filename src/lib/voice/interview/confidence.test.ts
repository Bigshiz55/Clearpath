import { describe, it, expect } from 'vitest';
import { applySignal, initConfidence, overallConfidence } from './confidence';
import type { TasteSignal, TasteCategory } from './types';
import { TASTE_CATEGORIES } from './types';

function signal(id: string, categories: TasteCategory[], strength = 1): TasteSignal {
  return { id, turn: 1, kind: 'element', subject: id, sentiment: 'love', strength, categories };
}

describe('initConfidence', () => {
  it('starts every axis at zero', () => {
    const state = initConfidence();
    expect(Object.keys(state)).toHaveLength(36);
    for (const c of TASTE_CATEGORIES) {
      expect(state[c]).toEqual({ category: c, confidence: 0, signalCount: 0, lastUpdatedTurn: 0 });
    }
  });
});

describe('applySignal', () => {
  it('a single strong signal moves exactly its axes', () => {
    const state = initConfidence();
    const next = applySignal(state, signal('s1', ['horrorTolerance', 'genres']), 1);
    expect(next.horrorTolerance.confidence).toBeGreaterThan(0.5);
    expect(next.genres.confidence).toBeGreaterThan(0.5);
    expect(next.horrorTolerance.signalCount).toBe(1);
    expect(next.horrorTolerance.lastUpdatedTurn).toBe(1);
    // untouched axes stay put
    expect(next.pacing.confidence).toBe(0);
  });

  it('is immutable — the input state is unchanged', () => {
    const state = initConfidence();
    applySignal(state, signal('s1', ['pacing']), 1);
    expect(state.pacing.confidence).toBe(0);
  });

  it('shows diminishing returns on repeated signals to the same axis', () => {
    let state = initConfidence();
    const deltas: number[] = [];
    let prev = 0;
    for (let i = 0; i < 4; i++) {
      state = applySignal(state, signal(`s${i}`, ['crime']), i + 1);
      deltas.push(state.crime.confidence - prev);
      prev = state.crime.confidence;
    }
    // each increment is strictly smaller than the last
    for (let i = 1; i < deltas.length; i++) {
      expect(deltas[i]!).toBeLessThan(deltas[i - 1]!);
    }
    expect(state.crime.confidence).toBeLessThan(1);
  });

  it('a weak signal moves an axis less than a strong one', () => {
    const weak = applySignal(initConfidence(), signal('w', ['mood'], 0.2), 1);
    const strong = applySignal(initConfidence(), signal('s', ['mood'], 1), 1);
    expect(weak.mood.confidence).toBeLessThan(strong.mood.confidence);
  });

  it('ignores unknown categories without throwing', () => {
    const next = applySignal(initConfidence(), signal('x', ['not-a-real-axis' as TasteCategory]), 1);
    expect(overallConfidence(next)).toBe(0);
  });
});

describe('overallConfidence', () => {
  it('is weighted — nailing only niche axes barely moves it', () => {
    let niche = initConfidence();
    for (const c of ['musicals', 'holiday', 'sports', 'westerns', 'blackAndWhite'] as TasteCategory[]) {
      for (let i = 0; i < 4; i++) niche = applySignal(niche, signal(`n${c}${i}`, [c]), i + 1);
    }
    let core = initConfidence();
    for (const c of ['genres', 'pacing', 'mood', 'horrorTolerance', 'complexity'] as TasteCategory[]) {
      for (let i = 0; i < 4; i++) core = applySignal(core, signal(`c${c}${i}`, [c]), i + 1);
    }
    expect(overallConfidence(core)).toBeGreaterThan(overallConfidence(niche));
  });

  it('reaches >= 0.95 only after broad coverage, and never exceeds 1', () => {
    // A handful of axes is not enough.
    let partial = initConfidence();
    for (const c of ['genres', 'pacing', 'mood'] as TasteCategory[]) {
      for (let i = 0; i < 4; i++) partial = applySignal(partial, signal(`p${c}${i}`, [c]), i + 1);
    }
    expect(overallConfidence(partial)).toBeLessThan(0.95);

    // Broad coverage across every axis clears the bar.
    let broad = initConfidence();
    for (let round = 0; round < 4; round++) {
      for (const c of TASTE_CATEGORIES) broad = applySignal(broad, signal(`b${c}${round}`, [c]), round + 1);
    }
    const overall = overallConfidence(broad);
    expect(overall).toBeGreaterThanOrEqual(0.95);
    expect(overall).toBeLessThanOrEqual(1);
  });
});
