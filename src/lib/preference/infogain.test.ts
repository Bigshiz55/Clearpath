import { describe, it, expect } from 'vitest';
import { DIMENSION_KEYS } from '@/lib/scoring/dimensions';
import type { TitleDimensions } from '@/lib/scoring/dimensions';
import { axisUncertainty, expectedInfoGain, pickNextTitles } from './infogain';
import { deriveDna, emptyDna } from './engine';
import type { PreferenceEvent } from './types';

function dims(over: Record<string, number> = {}): TitleDimensions {
  const d: TitleDimensions = {};
  for (const k of DIMENSION_KEYS) d[k] = 50;
  return { ...d, ...over };
}
const ev = (over: Partial<PreferenceEvent>): PreferenceEvent => ({
  id: Math.random().toString(36).slice(2), at: 0, titleId: 'movie:1', action: 'skip', ...over,
});

describe('information-gain selection', () => {
  it('an empty profile is maximally uncertain on every axis', () => {
    const u = axisUncertainty(emptyDna());
    for (const k of DIMENSION_KEYS) expect(u[k]).toBe(1);
  });

  it('a neutral title teaches nothing; an extreme title teaches a lot', () => {
    const u = axisUncertainty(emptyDna());
    expect(expectedInfoGain(dims(), u)).toBe(0); // all axes at 50
    const extreme = expectedInfoGain(dims(Object.fromEntries(DIMENSION_KEYS.map((k) => [k, 0]))), u);
    expect(extreme).toBeCloseTo(DIMENSION_KEYS.length, 5); // info 1 × uncertainty 1 per axis
  });

  it('picks the most informative title first', () => {
    const state = emptyDna();
    const pool = [
      { titleId: 'neutral', dims: dims() },
      { titleId: 'one-axis', dims: dims({ pacing: 0 }) },
      { titleId: 'two-axis', dims: dims({ pacing: 0, darkness: 100 }) },
    ];
    const [first] = pickNextTitles(pool, state, { count: 1 });
    expect(first!.titleId).toBe('two-axis');
    expect(first!.infoGain).toBeGreaterThan(0);
  });

  it('diversifies: the second pick targets a DIFFERENT uncertainty gap', () => {
    const state = emptyDna();
    const pool = [
      { titleId: 'A', dims: dims({ pacing: 0, darkness: 100 }) }, // strongest
      { titleId: 'B', dims: dims({ pacing: 0 }) }, // same axis as A
      { titleId: 'C', dims: dims({ violence: 100 }) }, // a fresh axis
    ];
    const picks = pickNextTitles(pool, state, { count: 2 });
    expect(picks[0]!.titleId).toBe('A');
    // After A teaches pacing+darkness, C (violence) beats B (pacing again).
    expect(picks[1]!.titleId).toBe('C');
  });

  it('already-known axes lower a title\'s value', () => {
    const learned = deriveDna(
      Array.from({ length: 8 }, (_, i) => ev({ id: `p${i}`, action: 'seen_liked', experienceGrade: 'loved', dims: dims({ pacing: 95 }) })),
      0,
    );
    const u = axisUncertainty(learned);
    // We now know pacing well, so a pacing-only title is worth less than when unknown.
    const pacingTitle = dims({ pacing: 0 });
    expect(expectedInfoGain(pacingTitle, u)).toBeLessThan(expectedInfoGain(pacingTitle, axisUncertainty(emptyDna())));
  });

  it('respects the exclude set', () => {
    const pool = [
      { titleId: 'A', dims: dims({ pacing: 0, darkness: 100 }) },
      { titleId: 'B', dims: dims({ violence: 100 }) },
    ];
    const picks = pickNextTitles(pool, emptyDna(), { count: 2, exclude: new Set(['A']) });
    expect(picks.map((p) => p.titleId)).toEqual(['B']);
  });
});
