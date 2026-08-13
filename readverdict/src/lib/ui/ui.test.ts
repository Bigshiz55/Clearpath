import { describe, it, expect } from 'vitest';
import { initialsOf, avatarPaletteIndex, AVATAR_PALETTE_SIZE } from './initials';
import { dialGeometry } from './dial';
import { starBreakdown, MAX_STARS } from './stars';

describe('initialsOf', () => {
  it('takes first + last initial for multi-word names', () => {
    expect(initialsOf('Jane Austen')).toBe('JA');
    expect(initialsOf('Gabriel García Márquez')).toBe('GM');
  });

  it('takes two letters for a single word', () => {
    expect(initialsOf('Homer')).toBe('HO');
  });

  it('handles empty / whitespace input', () => {
    expect(initialsOf('   ')).toBe('?');
    expect(initialsOf('')).toBe('?');
  });
});

describe('avatarPaletteIndex', () => {
  it('is deterministic and within range', () => {
    const a = avatarPaletteIndex('Heather');
    const b = avatarPaletteIndex('Heather');
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(AVATAR_PALETTE_SIZE);
  });
});

describe('dialGeometry', () => {
  it('fills zero arc at 0 and full circumference at 100', () => {
    expect(dialGeometry(0).dash).toBeCloseTo(0, 5);
    const full = dialGeometry(100);
    expect(full.dash).toBeCloseTo(full.circumference, 5);
    expect(full.gap).toBeCloseTo(0, 5);
  });

  it('clamps out-of-range and NaN scores', () => {
    expect(dialGeometry(150).dash).toBeCloseTo(dialGeometry(100).dash, 5);
    expect(dialGeometry(-20).dash).toBeCloseTo(0, 5);
    expect(dialGeometry(Number.NaN).dash).toBeCloseTo(0, 5);
  });

  it('dash + gap always equals the circumference', () => {
    for (const score of [10, 33, 50, 78, 99]) {
      const g = dialGeometry(score);
      expect(g.dash + g.gap).toBeCloseTo(g.circumference, 5);
    }
  });
});

describe('starBreakdown', () => {
  it('rounds to the nearest half and always totals 5', () => {
    for (const v of [0, 1.2, 2.5, 3.7, 4.9, 5]) {
      const b = starBreakdown(v);
      expect(b.full + b.half + b.empty).toBe(MAX_STARS);
    }
  });

  it('produces a half star only near .25–.75', () => {
    expect(starBreakdown(4.2)).toEqual({ full: 4, half: 0, empty: 1 });
    expect(starBreakdown(4.3)).toEqual({ full: 4, half: 1, empty: 0 });
    expect(starBreakdown(4.75)).toEqual({ full: 5, half: 0, empty: 0 });
  });

  it('clamps out-of-range input', () => {
    expect(starBreakdown(-3)).toEqual({ full: 0, half: 0, empty: 5 });
    expect(starBreakdown(99)).toEqual({ full: 5, half: 0, empty: 0 });
  });
});
