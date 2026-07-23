import { describe, it, expect } from 'vitest';
import { computeAcclaim, type SourceReading } from './acclaim';

describe('computeAcclaim', () => {
  it('returns the neutral prior with low confidence when no sources are present', () => {
    const r = computeAcclaim([]);
    expect(r.score).toBe(55);
    expect(r.confidence).toBe('low');
    expect(r.coverage).toBe(0);
    expect(r.trust).toBe(0);
  });

  it('trusts a high-volume rating and lands near its value', () => {
    const readings: SourceReading[] = [
      { key: 'openLibrary', value: 86, sampleSize: 950 },
    ];
    const r = computeAcclaim(readings);
    expect(r.confidence).toBe('high');
    // With ~975 effective samples vs K=25, trust ≈ 0.97 → score pulled only
    // slightly toward neutral.
    expect(r.score).toBeGreaterThan(82);
    expect(r.score).toBeLessThanOrEqual(86);
  });

  it('shrinks a thinly-sampled extreme rating toward neutral', () => {
    const strong: SourceReading[] = [{ key: 'openLibrary', value: 100, sampleSize: 3 }];
    const r = computeAcclaim(strong);
    // 3 ratings should NOT yield a near-100 score.
    expect(r.score).toBeLessThan(75);
    expect(r.confidence).not.toBe('high');
  });

  it('is monotonic in sample size for a fixed value', () => {
    const few = computeAcclaim([{ key: 'openLibrary', value: 90, sampleSize: 10 }]);
    const many = computeAcclaim([{ key: 'openLibrary', value: 90, sampleSize: 5000 }]);
    expect(many.score).toBeGreaterThan(few.score);
    expect(many.trust).toBeGreaterThan(few.trust);
  });

  it('reports contribution weights that sum to 1 across present sources', () => {
    const r = computeAcclaim([
      { key: 'openLibrary', value: 80, sampleSize: 500 },
      { key: 'goodreads', value: 70, sampleSize: 500 },
    ]);
    const total = r.contributions.reduce((a, c) => a + c.weight, 0);
    expect(total).toBeCloseTo(1, 5);
    expect(r.coverage).toBe(2);
  });

  it('clamps out-of-range values into 0..100', () => {
    const r = computeAcclaim([{ key: 'openLibrary', value: 250, sampleSize: 1000 }]);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.score).toBeGreaterThanOrEqual(0);
  });
});
