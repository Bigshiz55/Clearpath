import { describe, it, expect } from 'vitest';
import { revealTimeline, JUROR_BASE_MS, JUROR_STEP_MS } from './verdictReveal';

describe('revealTimeline', () => {
  it('is strictly increasing within jurors, and within vetoes', () => {
    const t = revealTimeline(5, 4);
    for (let i = 1; i < t.jurorAt.length; i++) expect(t.jurorAt[i]).toBeGreaterThan(t.jurorAt[i - 1]!);
    for (let i = 1; i < t.vetoAt.length; i++) expect(t.vetoAt[i]).toBeGreaterThan(t.vetoAt[i - 1]!);
  });

  it('the winner always resolves LAST — after every juror and every veto', () => {
    for (const [j, v] of [[2, 0], [3, 2], [5, 4], [0, 0], [0, 3]] as const) {
      const t = revealTimeline(j, v);
      const lastJuror = t.jurorAt.at(-1) ?? -1;
      const lastVeto = t.vetoAt.at(-1) ?? -1;
      expect(t.winnerAt).toBeGreaterThan(lastJuror);
      expect(t.winnerAt).toBeGreaterThan(lastVeto);
      expect(t.totalMs).toBe(t.winnerAt);
    }
  });

  it('vetoes start only after every juror has revealed', () => {
    const t = revealTimeline(3, 2);
    const lastJuror = t.jurorAt.at(-1)!;
    expect(t.vetoAt[0]).toBeGreaterThan(lastJuror);
  });

  it('scales correctly for 2, 3 and 5 jurors', () => {
    for (const n of [2, 3, 5]) {
      const t = revealTimeline(n, 0);
      expect(t.jurorAt).toHaveLength(n);
      expect(t.jurorAt[0]).toBe(JUROR_BASE_MS);
      if (n > 1) expect(t.jurorAt[1]).toBe(JUROR_BASE_MS + JUROR_STEP_MS);
    }
  });

  it('handles zero jurors and zero vetoes without producing NaN', () => {
    const t = revealTimeline(0, 0);
    expect(t.jurorAt).toEqual([]);
    expect(t.vetoAt).toEqual([]);
    expect(Number.isFinite(t.winnerAt)).toBe(true);
    expect(t.winnerAt).toBeGreaterThan(0);
  });

  it('never produces a negative offset', () => {
    const t = revealTimeline(4, 3);
    for (const ms of [...t.jurorAt, ...t.vetoAt, t.winnerAt]) expect(ms).toBeGreaterThanOrEqual(0);
  });

  it('reducedMotion collapses every offset to zero — same order, no wait', () => {
    const t = revealTimeline(5, 3, true);
    expect(t.jurorAt.every((ms) => ms === 0)).toBe(true);
    expect(t.vetoAt.every((ms) => ms === 0)).toBe(true);
    expect(t.winnerAt).toBe(0);
    expect(t.totalMs).toBe(0);
    expect(t.jurorAt).toHaveLength(5);
    expect(t.vetoAt).toHaveLength(3);
  });

  it('is a pure function — same input, same output, called repeatedly', () => {
    expect(revealTimeline(3, 2)).toEqual(revealTimeline(3, 2));
  });
});
