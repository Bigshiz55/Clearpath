import { describe, expect, it } from 'vitest';
import { diedAt, funnelStages, renderFunnel } from './funnel.mjs';

/**
 * The regression this file exists for: a person-only run with real results
 * used to print "candidates died at: semantically evaluated" because the
 * not-applicable stage reported the sentinel 0. An n/a stage is not a death
 * boundary, and a run that returned titles did not die anywhere.
 */
describe('a not-applicable stage is never a death boundary', () => {
  const personOnlyRun = {
    requestedCount: 3,
    candidateCount: 24,
    deterministicEligibleCount: 24,
    semanticEvaluatedCount: null, // no subject — the stage did not run
    centralSubjectEligibleCount: 24,
    qualityEligibleCount: 24,
    finalReturnedCount: 3,
  };

  it('later stages nonzero + semantic n/a → no died-at verdict', () => {
    expect(diedAt(funnelStages(personOnlyRun))).toBeNull();
  });

  it('the n/a stage renders as n/a, not as a count', () => {
    expect(renderFunnel(funnelStages(personOnlyRun))).toContain('semantically evaluated=n/a');
  });

  it('a REAL zero still names the boundary', () => {
    const starved = { ...personOnlyRun, semanticEvaluatedCount: 12, centralSubjectEligibleCount: 0, qualityEligibleCount: 0, finalReturnedCount: 0 };
    expect(diedAt(funnelStages(starved))).toBe('subject eligible');
  });

  it('a genuine semantic-stage zero still names it', () => {
    const semanticStarved = { ...personOnlyRun, semanticEvaluatedCount: 0, centralSubjectEligibleCount: 0, qualityEligibleCount: 0, finalReturnedCount: 0 };
    expect(diedAt(funnelStages(semanticStarved))).toBe('semantically evaluated');
  });
});
