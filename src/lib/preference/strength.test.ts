import { describe, it, expect } from 'vitest';
import { DIMENSION_KEYS } from '@/lib/scoring/dimensions';
import type { TitleDimensions } from '@/lib/scoring/dimensions';
import { dnaStrength } from './strength';
import { deriveDna } from './engine';
import type { PreferenceEvent, PrimaryAction } from './types';

function dims(over: Record<string, number> = {}): TitleDimensions {
  const d: TitleDimensions = {};
  for (const k of DIMENSION_KEYS) d[k] = 50;
  return { ...d, ...over };
}
const ev = (i: number, action: PrimaryAction, d: TitleDimensions, genres: string[]): PreferenceEvent => ({
  id: `e${i}`, at: 0, titleId: `t${i}`, action, dims: d, genres,
});

describe('DNA Strength', () => {
  it('an empty profile is near zero', () => {
    expect(dnaStrength(deriveDna([], 0)).developed).toBeLessThan(20);
  });

  it('returns an integer 0..100 with explainable categories', () => {
    const r = dnaStrength(deriveDna([ev(0, 'seen_liked', dims({ pacing: 90 }), ['crime'])], 0));
    expect(Number.isInteger(r.developed)).toBe(true);
    expect(r.developed).toBeGreaterThanOrEqual(0);
    expect(r.developed).toBeLessThanOrEqual(100);
    expect(r.categories.length).toBe(7);
    expect(r.summary).toMatch(/Watch DNA/);
  });

  it('does NOT reach high strength from a pile of near-identical titles (anti-gaming)', () => {
    const actionOnly = deriveDna(
      Array.from({ length: 40 }, (_, i) => ev(i, 'seen_liked', dims({ violence: 85, pacing: 85, stakes: 80 }), ['action'])),
      0,
    );
    const r = dnaStrength(actionOnly);
    expect(r.developed).toBeLessThan(70); // comedy, romance, animation, … still unknown
    // Trait coverage is the lever holding it down.
    const coverage = r.categories.find((c) => c.key === 'coverage')!;
    expect(coverage.score).toBeLessThan(0.4);
  });

  it('a broad profile beats a narrow one at the SAME volume', () => {
    const genres = ['crime', 'comedy', 'drama', 'horror', 'animation', 'documentary', 'romance', 'scifi', 'fantasy', 'thriller', 'family', 'war'];
    const broad = deriveDna(
      Array.from({ length: 40 }, (_, i) => {
        const g = genres[i % genres.length]!;
        const action: PrimaryAction = i % 4 === 0 ? 'unseen_not_interested' : i % 3 === 0 ? 'unseen_interested' : 'seen_liked';
        return ev(i, action, dims({ pacing: (i * 37) % 100, darkness: (i * 53) % 100, humor: (i * 29) % 100, violence: (i * 17) % 100 }), [g]);
      }),
      0,
    );
    const narrow = deriveDna(
      Array.from({ length: 40 }, (_, i) => ev(i, 'seen_liked', dims({ violence: 85, pacing: 85 }), ['action'])),
      0,
    );
    expect(dnaStrength(broad).developed).toBeGreaterThan(dnaStrength(narrow).developed);
  });

  it('Outcome Calibration is excluded for a new user, included with enough samples', () => {
    const state = deriveDna([ev(0, 'seen_liked', dims({ pacing: 90 }), ['crime'])], 0);
    const newUser = dnaStrength(state);
    expect(newUser.categories.find((c) => c.key === 'outcome')!.available).toBe(false);

    const withOutcomes = dnaStrength(state, { outcomeSamples: 24, predictionAccuracy: 0.87 });
    expect(withOutcomes.categories.find((c) => c.key === 'outcome')!.available).toBe(true);
  });

  it('lower response reliability lowers strength', () => {
    const state = deriveDna(Array.from({ length: 10 }, (_, i) => ev(i, 'seen_liked', dims({ pacing: 90 }), ['crime'])), 0);
    expect(dnaStrength(state, { reliability: 0.3 }).developed).toBeLessThan(dnaStrength(state, { reliability: 0.95 }).developed);
  });
});
