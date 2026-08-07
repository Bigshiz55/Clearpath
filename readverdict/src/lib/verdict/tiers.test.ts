import { describe, it, expect } from 'vitest';
import { tierForScore, isPositive, TIERS } from './tiers';

describe('tierForScore', () => {
  it('maps representative scores to the right tier', () => {
    expect(tierForScore(92).tier).toBe('Must Read');
    expect(tierForScore(85).tier).toBe('Must Read');
    expect(tierForScore(75).tier).toBe('Strong Yes');
    expect(tierForScore(60).tier).toBe('Worth a Look');
    expect(tierForScore(45).tier).toBe('Maybe');
    expect(tierForScore(10).tier).toBe('Probably Pass');
  });

  it('is total: every 0–100 score resolves to exactly one tier', () => {
    for (let s = 0; s <= 100; s++) {
      expect(tierForScore(s)).toBeDefined();
    }
  });

  it('clamps out-of-range and NaN scores', () => {
    expect(tierForScore(150).tier).toBe('Must Read');
    expect(tierForScore(-20).tier).toBe('Probably Pass');
    expect(tierForScore(Number.NaN).tier).toBe('Probably Pass');
  });

  it('is monotonic — a higher score never yields a weaker tier', () => {
    const rank = (t: string) => TIERS.findIndex((x) => x.tier === t);
    let prev = tierForScore(0).tier;
    for (let s = 1; s <= 100; s++) {
      const cur = tierForScore(s).tier;
      // Lower index = stronger tier; rank must never increase as score rises.
      expect(rank(cur)).toBeLessThanOrEqual(rank(prev));
      prev = cur;
    }
  });

  it('classifies positive vs non-positive tiers', () => {
    expect(isPositive('Must Read')).toBe(true);
    expect(isPositive('Worth a Look')).toBe(true);
    expect(isPositive('Maybe')).toBe(false);
    expect(isPositive('Probably Pass')).toBe(false);
  });
});
