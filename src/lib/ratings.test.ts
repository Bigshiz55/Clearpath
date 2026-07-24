import { describe, it, expect } from 'vitest';
import { imdbScore, pctScore } from './ratings';

describe('imdbScore — treats every "missing" shape as null, never a dash/zero', () => {
  it('returns null for null, undefined, empty string, and whitespace', () => {
    expect(imdbScore(null)).toBeNull();
    expect(imdbScore(undefined)).toBeNull();
    expect(imdbScore('')).toBeNull();
    expect(imdbScore('   ')).toBeNull();
  });
  it('returns null for 0, negatives, NaN, and non-finite', () => {
    expect(imdbScore(0)).toBeNull();
    expect(imdbScore(-3)).toBeNull();
    expect(imdbScore(Number.NaN)).toBeNull();
    expect(imdbScore(Number.POSITIVE_INFINITY)).toBeNull();
  });
  it('returns null for "N/A", "na", and every dash variant', () => {
    for (const s of ['N/A', 'n/a', 'NA', '-', '–', '—', 'null', 'undefined']) {
      expect(imdbScore(s), `"${s}" should be missing`).toBeNull();
    }
  });
  it('returns null for out-of-range values (>10)', () => {
    expect(imdbScore(11)).toBeNull();
    expect(imdbScore(99)).toBeNull();
  });
  it('returns the numeric value for a valid rating (number or string)', () => {
    expect(imdbScore(8.3)).toBe(8.3);
    expect(imdbScore(10)).toBe(10);
    expect(imdbScore('7.4')).toBe(7.4);
    expect(imdbScore(' 9.5 ')).toBe(9.5);
  });
  it('never yields a value that renders as a dash or zero', () => {
    const shown = [null, undefined, '', 0, Number.NaN, 'N/A', '-']
      .map(imdbScore)
      .filter((n): n is number => n != null)
      .map((n) => n.toFixed(1));
    expect(shown).toEqual([]); // nothing renders
  });
});

describe('pctScore — keeps a genuine 0% but rejects broken values', () => {
  it('keeps 0 (a real 0% critics/audience score)', () => {
    expect(pctScore(0)).toBe(0);
  });
  it('rounds and keeps in-range values', () => {
    expect(pctScore(86)).toBe(86);
    expect(pctScore(86.4)).toBe(86);
    expect(pctScore('72')).toBe(72);
  });
  it('rejects null, NaN, and out-of-range', () => {
    expect(pctScore(null)).toBeNull();
    expect(pctScore(Number.NaN)).toBeNull();
    expect(pctScore(-1)).toBeNull();
    expect(pctScore(101)).toBeNull();
  });
});
