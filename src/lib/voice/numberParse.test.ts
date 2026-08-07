import { describe, it, expect } from 'vitest';
import { parseScores } from './numberParse';

/** The numeric-answer cases the spec requires the interview to handle. */
describe('parseScores — the required numeric STT cases (3 items unless noted)', () => {
  const three: Array<[string, number[]]> = [
    ['10, 7, 3', [10, 7, 3]],
    ['nine, eight, two', [9, 8, 2]],
    ['ten ten seven', [10, 10, 7]],
    ['one, eight, nine', [1, 8, 9]],
    ['five, eight, seven', [5, 8, 7]],
    ['10 10 10', [10, 10, 10]],
    ['love it, six, absolutely not', [10, 6, 1]],
    ['crime ten, drama seven, comedy three', [10, 7, 3]],
    ['nine, maybe six, absolutely not', [9, 6, 1]],
  ];
  for (const [text, expected] of three) {
    it(`"${text}" → ${JSON.stringify(expected)} in display order`, () => {
      const r = parseScores(text, 3);
      expect(r.values).toEqual(expected);
      expect(r.countMismatch).toBe(false);
    });
  }

  it('all-clean-number answers are maximally confident', () => {
    expect(parseScores('10, 7, 3', 3).confidence).toBe(1);
    expect(parseScores('ten ten seven', 3).confidence).toBe(1);
  });

  it('sentiment-mapped answers carry lower confidence than spoken numbers', () => {
    const r = parseScores('love it, six, absolutely not', 3);
    expect(r.values).toEqual([10, 6, 1]);
    expect(r.confidence).toBeLessThan(1);
    expect(r.confidence).toBeGreaterThan(0.4);
  });
});

describe('parseScores — count mismatch drives a repair, never a silent guess', () => {
  it('too few values leaves trailing slots null and flags a mismatch', () => {
    const r = parseScores('ten, seven', 3);
    expect(r.values).toEqual([10, 7, null]);
    expect(r.countMismatch).toBe(true);
    expect(r.confidence).toBeLessThan(0.8);
  });
  it('too many values keeps the first N but flags the mismatch', () => {
    const r = parseScores('10 7 3 9', 3);
    expect(r.values).toEqual([10, 7, 3]);
    expect(r.ordered).toEqual([10, 7, 3, 9]);
    expect(r.countMismatch).toBe(true);
  });
  it('an empty / unparseable answer yields all nulls (caller re-asks)', () => {
    const r = parseScores('um, I dunno', 3);
    expect(r.values).toEqual([null, null, null]);
    expect(r.countMismatch).toBe(true);
  });
});

describe('parseScores — scale coercion and single-item repairs', () => {
  it('clamps out-of-range numbers into 1..10', () => {
    expect(parseScores('12, 0, 5', 3).values).toEqual([10, 1, 5]);
  });
  it('supports a one-item repair ("was action six or eight" → the correction "eight")', () => {
    expect(parseScores('eight', 1).values).toEqual([8]);
    expect(parseScores('eight', 1).countMismatch).toBe(false);
  });
});
