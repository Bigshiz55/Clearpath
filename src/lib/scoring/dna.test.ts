import { describe, it, expect } from 'vitest';
import { cosine, weightedCentroid, buildTasteDna, dnaScore } from './dna';

describe('cosine', () => {
  it('is 1 for identical direction, 0 for orthogonal, -1 for opposite', () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosine([1, 0], [-1, 0])).toBeCloseTo(-1);
  });
  it('is scale-invariant', () => {
    expect(cosine([2, 0], [5, 0])).toBeCloseTo(1);
  });
  it('returns 0 on a zero vector', () => {
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });
});

describe('weightedCentroid', () => {
  it('averages by weight and skips non-positive weights', () => {
    const c = weightedCentroid([
      { vector: [10, 0], weight: 3 },
      { vector: [0, 10], weight: 1 },
      { vector: [99, 99], weight: 0 },
    ]);
    expect(c).not.toBeNull();
    expect(c![0]).toBeCloseTo(7.5); // (10*3 + 0*1)/4
    expect(c![1]).toBeCloseTo(2.5); // (0*3 + 10*1)/4
  });
  it('is null when nothing qualifies', () => {
    expect(weightedCentroid([{ vector: [1], weight: 0 }])).toBeNull();
  });
});

describe('buildTasteDna', () => {
  it('separates loves (>=7) from pans (<=4) and ignores the middle', () => {
    const dna = buildTasteDna([
      { vector: [1, 0], rating: 9 },
      { vector: [1, 0], rating: 8 },
      { vector: [0, 1], rating: 2 },
      { vector: [0.5, 0.5], rating: 5 }, // ignored
    ]);
    expect(dna.sampleSize).toBe(4);
    // liked centroid points toward [1,0]; disliked toward [0,1]
    expect(cosine(dna.liked!, [1, 0])).toBeGreaterThan(0.9);
    expect(cosine(dna.disliked!, [0, 1])).toBeGreaterThan(0.9);
  });
});

describe('dnaScore', () => {
  const liked = [1, 0];
  const disliked = [0, 1];
  const dna = buildTasteDna([
    { vector: liked, rating: 10 },
    { vector: disliked, rating: 1 },
  ]);

  it('scores a title near your loves higher than one near your pans', () => {
    const hit = dnaScore([1, 0.05], dna, 60, 2).score;
    const miss = dnaScore([0.05, 1], dna, 60, 2).score;
    expect(hit).toBeGreaterThan(miss);
  });

  it('falls back to the objective score when there is no taste data', () => {
    const empty = buildTasteDna([]);
    const r = dnaScore([1, 0], empty, 72);
    expect(r.score).toBe(72);
    expect(r.confidence).toBe(0);
  });

  it('falls back to objective when the title has no vector', () => {
    expect(dnaScore(null, dna, 55).score).toBe(55);
  });

  it('confidence ramps with sample size and blends toward taste', () => {
    // Few samples → mostly objective; the blend stays near objective.
    const few = dnaScore([1, 0], buildTasteDna([{ vector: liked, rating: 9 }]), 40, 20);
    expect(few.confidence).toBeCloseTo(0.05, 2);
    expect(few.score).toBeGreaterThanOrEqual(40); // taste pulls up only a little
    expect(few.score).toBeLessThan(60);
  });

  it('clamps to 0..100', () => {
    const r = dnaScore([1, 0], dna, 200, 2);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.score).toBeGreaterThanOrEqual(0);
  });
});
