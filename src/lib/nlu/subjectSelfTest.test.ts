import { describe, it, expect } from 'vitest';
import { runSubjectSelfTest } from './subjectSelfTest';

/**
 * The founder self-test must itself be trustworthy: these assert the offline,
 * deterministic harness reports green on the same corpus the production
 * evaluator judges, is reproducible from a seed, and never leaks a decoy.
 */
describe('subject self-test (founder offline red-team)', () => {
  it('regression mode passes — Snake Eyes rejected, 3 central boxing movies eligible', () => {
    const s = runSubjectSelfTest({ mode: 'regression' });
    expect(s.allGreen).toBe(true);
    expect(s.decoyLeaks).toBe(0);
    expect(s.failures.length).toBe(0);
  });

  it('random mode: 200 seeded cases, zero decoy leaks, 100% pass', () => {
    const s = runSubjectSelfTest({ mode: 'random', seed: 1337, cases: 200 });
    expect(s.cases).toBe(200);
    expect(s.decoyLeaks).toBe(0);
    expect(s.passRate).toBe(1);
    expect(s.allGreen).toBe(true);
  });

  it('is deterministic — same seed reproduces the same summary', () => {
    const a = runSubjectSelfTest({ mode: 'seed', seed: 424242, cases: 120 });
    const b = runSubjectSelfTest({ mode: 'seed', seed: 424242, cases: 120 });
    expect(a.passed).toBe(b.passed);
    expect(a.decoyLeaks).toBe(b.decoyLeaks);
    expect(a.allGreen).toBe(true);
  });

  it('a second unseen seed also holds (no seed-specific tuning)', () => {
    const s = runSubjectSelfTest({ mode: 'random', seed: 98765, cases: 300 });
    expect(s.allGreen).toBe(true);
  });
});
