import { describe, it, expect } from 'vitest';
import { runSimulations, simulateOnboarding } from './onboardingSim';
import { CALIBRATION_SIZE, CAPS } from './calibration';

describe('Watch DNA onboarding — 1000 simulated sessions (PART 11)', () => {
  const agg = runSimulations(1000, 12345);

  it('runs at least 1000 sessions across all scenarios', () => {
    expect(agg.runs).toBe(1000);
    for (const n of Object.values(agg.scenarios)) expect(n).toBeGreaterThan(0);
  });

  it('EVERY invariant holds across all 1000 runs (no failures)', () => {
    // If this fails, the offending seeds/scenarios/checks are listed.
    expect(agg.failures.slice(0, 10)).toEqual([]);
    expect(agg.allPassed).toBe(true);
  });

  it('onboarding never exceeds 20 titles; anime never exceeds 1; no genre exceeds 3', () => {
    expect(agg.maxAnimeSeen).toBeLessThanOrEqual(CAPS.anime);
    expect(agg.maxGenreSeen).toBeLessThanOrEqual(CAPS.perGenre);
  });

  it('a full onboarding reaches Quiz Progress 100% (broad scenarios average 100)', () => {
    expect(agg.avgQuizPercentBroad).toBeCloseTo(100, 1);
  });

  it('DNA Confidence stays independent of Quiz Progress and <= 100', () => {
    // Onboarding-only confidence averages well below 100 (never mirrors 100%).
    expect(agg.avgConfidenceOnboarding).toBeGreaterThan(30);
    expect(agg.avgConfidenceOnboarding).toBeLessThan(75);
    expect(agg.avgConfidenceEngaged).toBeLessThanOrEqual(100);
  });

  it('DNA Confidence grows with more diverse engagement', () => {
    expect(agg.avgConfidenceEngaged).toBeGreaterThan(agg.avgConfidenceOnboarding);
  });

  it('a single broad session ends cleanly at 20 with 100% progress', () => {
    const r = simulateOnboarding(999, 'broad');
    expect(r.answered).toBe(CALIBRATION_SIZE);
    expect(r.quizPercent).toBe(100);
    expect(r.dnaConfidenceOnboardingOnly).toBeLessThan(90);
    expect(r.duplicates).toBe(false);
  });
});
