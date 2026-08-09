import { describe, it, expect } from 'vitest';
import { parseGroupedAnswer, parseSingleValue, extractValues, normalizeAnswer } from './numberParse';

/**
 * The rapid-fire interview is only as good as its ability to hear "10, 7, 3"
 * the way a person says it. Every case here is a real phrasing a user can
 * produce for a three-item question.
 */

const THREE = [['crime'], ['comedy', 'comedies'], ['sci-fi', 'scifi', 'science fiction']];

describe('grouped 1-10 answers', () => {
  it('reads bare digits', () => {
    const r = parseGroupedAnswer('10, 7, 3', THREE);
    expect(r.values).toEqual([10, 7, 3]);
    expect(r.complete).toBe(true);
  });

  it('reads number words, including repeats', () => {
    expect(parseGroupedAnswer('ten ten seven', THREE).values).toEqual([10, 10, 7]);
  });

  it('reads sentiment shorthand mixed with a number', () => {
    const r = parseGroupedAnswer('love it, six, absolutely not', THREE);
    expect(r.values[0]).toBeGreaterThanOrEqual(9);
    expect(r.values[1]).toBe(6);
    expect(r.values[2]).toBe(1);
    expect(r.complete).toBe(true);
  });

  it('does not read "absolutely not" as a positive', () => {
    expect(parseGroupedAnswer('absolutely not, absolutely not, absolutely not', THREE).values).toEqual([1, 1, 1]);
  });

  it('uses the labels when the user echoes them', () => {
    const r = parseGroupedAnswer('crime ten, comedy seven, sci-fi three', THREE);
    expect(r.values).toEqual([10, 7, 3]);
    expect(r.strategy).toBe('label');
  });

  it('respects labels over word order when answered out of order', () => {
    // Positional parsing would record crime=3, which inverts the user's taste.
    const r = parseGroupedAnswer('sci-fi three, crime ten, comedy seven', THREE);
    expect(r.values).toEqual([10, 7, 3]);
    expect(r.strategy).toBe('label');
  });

  it('clamps out-of-scale numbers instead of storing them', () => {
    expect(parseGroupedAnswer('100, 7, 0', THREE).values[0]).toBeLessThanOrEqual(10);
  });

  it('reports a short answer rather than guessing the rest', () => {
    const r = parseGroupedAnswer('8', THREE);
    expect(r.complete).toBe(false);
    expect(r.missing).toEqual([1, 2]);
    expect(r.values).toHaveLength(1);
  });

  it('returns nothing usable for an answer with no values in it', () => {
    const r = parseGroupedAnswer('hmm, I dunno really', THREE);
    expect(r.strategy).toBe('none');
    expect(r.complete).toBe(false);
  });

  it('never treats a digit inside a word as a score', () => {
    expect(extractValues(normalizeAnswer('se7en was great')).map((t) => t.value)).not.toContain(7);
  });

  it('reads a single value for a re-ask', () => {
    expect(parseSingleValue('about a seven')).toBe(7);
    expect(parseSingleValue('nothing here')).toBeNull();
  });
});
