import { describe, it, expect } from 'vitest';
import { leanOverlap, pairwiseOverlaps } from './founderCompare';

describe('founder comparison (pure)', () => {
  it('computes shared / distinct / jaccard, case-insensitively', () => {
    const o = leanOverlap(['Fast-paced', 'Grounded', 'Dark'], ['grounded', 'Light', 'Dark']);
    expect(o.shared.sort()).toEqual(['Dark', 'Grounded']);
    expect(o.onlyA).toEqual(['Fast-paced']);
    expect(o.onlyB).toEqual(['Light']);
    // union = {fast-paced, grounded, dark, light} = 4, inter = 2
    expect(o.jaccard).toBeCloseTo(0.5, 5);
  });

  it('identical sets overlap fully; disjoint sets not at all', () => {
    expect(leanOverlap(['A', 'B'], ['a', 'b']).jaccard).toBe(1);
    expect(leanOverlap(['A'], ['B']).jaccard).toBe(0);
    expect(leanOverlap([], []).jaccard).toBe(0);
  });

  it('enumerates all unordered founder pairs', () => {
    const pairs = pairwiseOverlaps([
      { key: 'scott', leans: ['A', 'B'] },
      { key: 'heather', leans: ['B', 'C'] },
      { key: 'amy', leans: ['A', 'C'] },
    ]);
    expect(pairs.map((p) => `${p.aKey}-${p.bKey}`)).toEqual(['scott-heather', 'scott-amy', 'heather-amy']);
    expect(pairs[0]!.overlap.shared).toEqual(['B']);
  });
});
