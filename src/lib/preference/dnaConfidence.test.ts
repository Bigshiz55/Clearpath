import { describe, it, expect } from 'vitest';
import {
  computeDnaConfidence,
  dnaConfidencePercent,
  emptyTally,
  SIGNAL_MODEL,
  RAW_WEIGHT_TOTAL,
  type DnaSignalTally,
} from './dnaConfidence';

function tally(p: Partial<DnaSignalTally>): DnaSignalTally {
  return { ...emptyTally(), ...p };
}

describe('DNA Confidence (pure)', () => {
  it('is 0 for an empty tally', () => {
    expect(dnaConfidencePercent(emptyTally())).toBe(0);
  });

  it('never exceeds 100 even with enormous counts on every signal', () => {
    const huge = emptyTally();
    for (const m of SIGNAL_MODEL) (huge as unknown as Record<string, number>)[m.key] = 100_000;
    expect(dnaConfidencePercent(huge)).toBe(100);
  });

  it('calibration answers alone saturate around ~60 at the finite 20 (never 100)', () => {
    const c20 = dnaConfidencePercent(tally({ calibrationAnswers: 20 }));
    expect(c20).toBeGreaterThanOrEqual(56);
    expect(c20).toBeLessThanOrEqual(64);
    // Even infinite calibration answers alone can't reach 100 — breadth required.
    const cInf = dnaConfidencePercent(tally({ calibrationAnswers: 100_000 }));
    expect(cInf).toBeLessThan(70);
  });

  it('is independent of quiz progress: 20 answers => ~60, not 100', () => {
    // Quiz progress would be 100% at 20/20; confidence must NOT mirror it.
    expect(dnaConfidencePercent(tally({ calibrationAnswers: 20 }))).toBeLessThan(90);
  });

  it('is monotonic non-decreasing in every signal count', () => {
    for (const m of SIGNAL_MODEL) {
      const lo = dnaConfidencePercent(tally({ [m.key]: 1 } as Partial<DnaSignalTally>));
      const hi = dnaConfidencePercent(tally({ [m.key]: 5 } as Partial<DnaSignalTally>));
      expect(hi).toBeGreaterThanOrEqual(lo);
    }
  });

  it('rewards breadth: many signal types beat one type piled high', () => {
    const piled = dnaConfidencePercent(tally({ calibrationAnswers: 40 }));
    const broad = dnaConfidencePercent(
      tally({ calibrationAnswers: 20, watched: 8, ratings: 6, saved: 5, wouldWatch: 5, corrections: 3, searches: 4 }),
    );
    expect(broad).toBeGreaterThan(piled);
  });

  it('grows as more diverse signals arrive (confidence improves over time)', () => {
    const start = dnaConfidencePercent(tally({ calibrationAnswers: 10 }));
    const mid = dnaConfidencePercent(tally({ calibrationAnswers: 20, watched: 3, ratings: 3 }));
    const later = dnaConfidencePercent(
      tally({ calibrationAnswers: 20, watched: 10, ratings: 10, saved: 8, completed: 6, corrections: 4, recsAccepted: 8, packAnswers: 8 }),
    );
    expect(mid).toBeGreaterThan(start);
    expect(later).toBeGreaterThan(mid);
  });

  it('a rejection ("Not for me") is real signal and raises confidence', () => {
    expect(dnaConfidencePercent(tally({ notForMe: 5 }))).toBeGreaterThan(0);
  });

  it('exposes evidence contributions sorted richest-first', () => {
    const r = computeDnaConfidence(tally({ calibrationAnswers: 20, watched: 5 }));
    expect(r.contributions[0]!.key).toBe('calibrationAnswers');
    expect(r.contributions.find((c) => c.key === 'watched')!.points).toBeGreaterThan(0);
    expect(r.breadth).toBe(2);
  });

  it('raw weight total exceeds 100 so full engagement can reach the cap', () => {
    expect(RAW_WEIGHT_TOTAL).toBeGreaterThan(100);
  });

  it('after a full 20/20 calibration, confidence keeps rising as OTHER signals arrive — with calibration frozen at 20', () => {
    // Quiz Progress is answered/20; once calibration hits 20 it never grows.
    const base = tally({ calibrationAnswers: 20 });
    const cBase = dnaConfidencePercent(base);
    // More engagement of every OTHER kind — calibrationAnswers stays 20 (Quiz
    // Progress stays 100%), yet confidence climbs.
    const later = tally({
      calibrationAnswers: 20,
      watched: 6, ratings: 6, saved: 4, completed: 4, corrections: 3,
      recsAccepted: 5, recsRejected: 3, packAnswers: 6, searches: 4,
    });
    expect(later.calibrationAnswers).toBe(20); // never exceeds the finite 20
    expect(dnaConfidencePercent(later)).toBeGreaterThan(cBase);
  });
});
