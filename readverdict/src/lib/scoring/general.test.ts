import { describe, it, expect } from 'vitest';
import { computeGeneralScore, acclaimReadings } from './general';
import { classicBook, emptyBook, weakBook } from './fixtures';

const REF = { refYear: 2026 };

describe('computeGeneralScore', () => {
  it('scores an acclaimed enduring classic highly with high confidence', () => {
    const r = computeGeneralScore(classicBook(), REF);
    expect(r.score).toBeGreaterThanOrEqual(75);
    expect(r.confidence).toBe('high');
    expect(r.breakdown.acclaim).toBeGreaterThan(75);
    expect(r.breakdown.stayingPower).toBeGreaterThan(80);
  });

  it('scores a weak, thinly-rated doorstop well below a classic', () => {
    const weak = computeGeneralScore(weakBook(), REF);
    const classic = computeGeneralScore(classicBook(), REF);
    expect(weak.score).toBeLessThan(classic.score);
    expect(weak.breakdown.readability).toBeLessThan(classic.breakdown.readability);
  });

  it('never fabricates a rating: an unrated book has no available source', () => {
    const r = computeGeneralScore(emptyBook(), REF);
    expect(r.sources[0]?.available).toBe(false);
    expect(r.sources[0]?.value).toBeNull();
    expect(r.confidence).toBe('low');
    // Acclaim falls back to the neutral prior rather than inventing a number.
    expect(r.breakdown.acclaim).toBe(55);
  });

  it('produces a bounded 0..100 score for all fixtures', () => {
    for (const meta of [emptyBook(), classicBook(), weakBook()]) {
      const r = computeGeneralScore(meta, REF);
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
    }
  });

  it('is deterministic — identical input yields identical output', () => {
    const a = computeGeneralScore(classicBook(), REF);
    const b = computeGeneralScore(classicBook(), REF);
    expect(a).toEqual(b);
  });

  it('rewards more editions with higher staying power', () => {
    const few = computeGeneralScore(classicBook({ editionCount: 3 }), REF);
    const many = computeGeneralScore(classicBook({ editionCount: 200 }), REF);
    expect(many.breakdown.stayingPower).toBeGreaterThan(few.breakdown.stayingPower);
  });

  it('acclaimReadings omits sources with zero ratings', () => {
    expect(acclaimReadings(emptyBook())).toHaveLength(0);
    expect(acclaimReadings(classicBook())).toHaveLength(1);
  });
});
