import { describe, it, expect } from 'vitest';
import {
  SUPPORT_STAGES, STAGE_LABEL, MIN_CONSECUTIVE_RUNS_FOR_PRODUCTION,
  isUserVisible, degradedRetainsLastGood, fixtureRowsMayBeShown,
  evaluatePromotion, isLegalTransition, type PromotionEvidence, type SupportStage,
} from './supportStage';

/** Everything satisfied — each test then breaks exactly one thing. */
function fullEvidence(over: Partial<PromotionEvidence> = {}): PromotionEvidence {
  return {
    consecutiveSuccessfulRuns: 3,
    recordCountWithinExpectedRange: true,
    coverageDatesValid: true,
    sampledAgainstOriginatingSource: true,
    timezonesCorrect: true,
    duplicateRateAcceptable: true,
    matchConfidenceMeasured: true,
    failureRetainsLastGood: true,
    servedFromStoredRecords: true,
    zeroBrowserTriggeredUpstreamRequests: true,
    independentlyDisableable: true,
    noFixtureOrPlaceholderRows: true,
    freshnessAndConfidenceExposed: true,
    attributionSatisfied: true,
    ...over,
  };
}

describe('isUserVisible — the one rule', () => {
  it('admits exactly verified and production_supported', () => {
    const visible = SUPPORT_STAGES.filter(isUserVisible);
    expect(visible).toEqual(['verified', 'production_supported']);
  });

  it('hides every pre-verification stage, including live_prototype and ingesting', () => {
    // A source that is actively ingesting real data is still not proven. This
    // is the distinction the stage ladder exists to hold.
    for (const s of ['discovered', 'evaluated', 'fixture_tested', 'live_prototype', 'ingesting'] as const) {
      expect(isUserVisible(s)).toBe(false);
    }
  });

  it('hides degraded and disabled', () => {
    expect(isUserVisible('degraded')).toBe(false);
    expect(isUserVisible('disabled')).toBe(false);
  });
});

describe('degradedRetainsLastGood', () => {
  it('is true only for degraded — a failed refresh must not delete the listings we have', () => {
    for (const s of SUPPORT_STAGES) {
      expect(degradedRetainsLastGood(s)).toBe(s === 'degraded');
    }
  });
});

describe('fixtureRowsMayBeShown', () => {
  it('never shows a fixture row in production', () => {
    expect(fixtureRowsMayBeShown({ isFixtureRow: true, vercelEnv: 'production' })).toBe(false);
    expect(fixtureRowsMayBeShown({ isFixtureRow: true, vercelEnv: '  PRODUCTION ' })).toBe(false);
  });

  it('shows fixture rows everywhere else, which is the point of fixture mode', () => {
    for (const env of ['preview', 'development', '', null, undefined]) {
      expect(fixtureRowsMayBeShown({ isFixtureRow: true, vercelEnv: env })).toBe(true);
    }
  });

  it('never restricts a real row', () => {
    expect(fixtureRowsMayBeShown({ isFixtureRow: false, vercelEnv: 'production' })).toBe(true);
  });
});

describe('evaluatePromotion', () => {
  it('promotes only on complete evidence', () => {
    const r = evaluatePromotion(fullEvidence());
    expect(r.eligible).toBe(true);
    expect(r.stage).toBe('production_supported');
    expect(r.unmet).toEqual([]);
  });

  it('refuses one successful run — "one successful scrape is not sufficient"', () => {
    for (const runs of [0, 1, 2]) {
      const r = evaluatePromotion(fullEvidence({ consecutiveSuccessfulRuns: runs }));
      expect(r.eligible).toBe(false);
      expect(r.stage).toBe('ingesting');
      expect(r.unmet.join(' ')).toContain('consecutiveSuccessfulRuns');
    }
    expect(MIN_CONSECUTIVE_RUNS_FOR_PRODUCTION).toBe(3);
  });

  it('blocks on each individual condition, one at a time', () => {
    const flags = Object.keys(fullEvidence()).filter((k) => k !== 'consecutiveSuccessfulRuns');
    for (const flag of flags) {
      const r = evaluatePromotion(fullEvidence({ [flag]: false } as Partial<PromotionEvidence>));
      expect(r.eligible, `${flag} should block promotion`).toBe(false);
      expect(r.unmet).toContain(flag);
    }
    expect(flags.length).toBe(13);
  });

  it('lists every unmet condition rather than stopping at the first', () => {
    const r = evaluatePromotion(fullEvidence({
      consecutiveSuccessfulRuns: 0, timezonesCorrect: false, attributionSatisfied: false,
    }));
    expect(r.unmet).toHaveLength(3);
  });
});

describe('isLegalTransition', () => {
  it('allows advancing exactly one rung', () => {
    expect(isLegalTransition('discovered', 'evaluated')).toBe(true);
    expect(isLegalTransition('ingesting', 'verified')).toBe(true);
    expect(isLegalTransition('verified', 'production_supported')).toBe(true);
  });

  it('forbids skipping a rung, however confident the operator is', () => {
    expect(isLegalTransition('discovered', 'production_supported')).toBe(false);
    expect(isLegalTransition('fixture_tested', 'verified')).toBe(false);
    expect(isLegalTransition('evaluated', 'ingesting')).toBe(false);
  });

  it('allows demotion to any lower rung', () => {
    expect(isLegalTransition('production_supported', 'ingesting')).toBe(true);
    expect(isLegalTransition('verified', 'discovered')).toBe(true);
  });

  it('always allows pulling the cord, from anywhere', () => {
    for (const from of SUPPORT_STAGES) {
      expect(isLegalTransition(from, 'disabled')).toBe(true);
      expect(isLegalTransition(from, 'degraded')).toBe(true);
    }
  });

  it('makes recovery re-earn production_supported', () => {
    expect(isLegalTransition('degraded', 'verified')).toBe(true);
    expect(isLegalTransition('degraded', 'production_supported')).toBe(false);
    expect(isLegalTransition('disabled', 'production_supported')).toBe(false);
  });
});

describe('stage vocabulary', () => {
  it('matches the nine specified stages, in order', () => {
    expect(SUPPORT_STAGES).toEqual([
      'discovered', 'evaluated', 'fixture_tested', 'live_prototype',
      'ingesting', 'verified', 'production_supported', 'degraded', 'disabled',
    ]);
  });

  it('labels every stage', () => {
    for (const s of SUPPORT_STAGES) {
      expect(STAGE_LABEL[s as SupportStage]).toBeTruthy();
    }
  });
});
