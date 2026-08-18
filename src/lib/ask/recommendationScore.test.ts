import { describe, it, expect } from 'vitest';
import { scoreRecommendation, MAX_WITHOUT_PERSONAL_EVIDENCE } from './recommendationScore';
import { evaluateCandidate, type HardConstraint, type CandidateFacts } from './hardConstraints';

/**
 * "100% MATCH" MUST MEAN SOMETHING.
 *
 * ── THE PRODUCTION FAILURE ────────────────────────────────────────────────
 * Three unrelated 2026 films were shown at "100 match" for a Samuel L. Jackson
 * request. The number was not miscalculated — it was the WRONG NUMBER. The
 * finder used `effectiveMatch = report.personal.score`, the deterministic
 * QUALITY verdict (Standard Score plus preference rules). It answers "is this
 * a good film", never "is this what was asked for", so a well-rated film the
 * user did not ask for scored ~100 exactly as a perfect answer would.
 *
 * Quality, request satisfaction, personal fit and confidence are four
 * different questions. This module keeps them four different numbers.
 */

const SLJ = 2231;
const requireSLJ: HardConstraint = { type: 'person', entity: 'Samuel L. Jackson', personId: SLJ, role: 'actor', required: true };
const facts = (over: Partial<CandidateFacts> = {}): CandidateFacts => ({
  mediaType: 'movie', castIds: [], directorIds: [], genreNames: [], creditsKnown: true, ...over,
});

describe('a title that fails the request cannot look like a match', () => {
  it('THE REPORTED CASE — high quality, wrong film, low match', () => {
    const ineligible = evaluateCandidate(facts({ castIds: [999] }), [requireSLJ]);
    const s = scoreRecommendation({ quality: 100, evidence: ineligible, personal: null, metadataCompleteness: 1 });
    expect(s.requestMatch).toBe(0);
    expect(s.match, 'a film failing the only stated requirement may not read as a match').toBeLessThan(50);
    expect(s.confidence).toBe('low');
  });

  it('quality is reported UNCHANGED — the film really is good, it is just not the answer', () => {
    const ineligible = evaluateCandidate(facts({ castIds: [999] }), [requireSLJ]);
    expect(scoreRecommendation({ quality: 100, evidence: ineligible, personal: null, metadataCompleteness: 1 }).quality).toBe(100);
  });

  it('and the missing requirement is named, not just scored down', () => {
    const s = scoreRecommendation({
      quality: 90,
      evidence: evaluateCandidate(facts({ castIds: [999] }), [requireSLJ]),
      personal: null,
      metadataCompleteness: 1,
    });
    expect(s.evidence.hardConstraintsMissing).toHaveLength(1);
    expect(s.evidence.negativeSignals.join(' ')).toContain('Samuel L. Jackson');
  });
});

describe('100 IS EARNED, NEVER DEFAULTED', () => {
  const eligible = evaluateCandidate(facts({ castIds: [SLJ] }), [requireSLJ]);

  it('constraints satisfied but NO personal evidence is capped below the top', () => {
    const s = scoreRecommendation({ quality: 100, evidence: eligible, personal: null, metadataCompleteness: 1 });
    expect(s.match).toBeLessThanOrEqual(MAX_WITHOUT_PERSONAL_EVIDENCE);
    expect(s.match).toBeLessThan(100);
    expect(s.confidence).toBe('medium');
  });

  it('thin metadata caps it further and lowers confidence', () => {
    const s = scoreRecommendation({ quality: 100, evidence: eligible, personal: 95, metadataCompleteness: 0.2 });
    expect(s.confidence).toBe('low');
    expect(s.match).toBeLessThan(MAX_WITHOUT_PERSONAL_EVIDENCE);
  });

  it('only constraints + personal evidence + real metadata can reach the top', () => {
    const s = scoreRecommendation({ quality: 100, evidence: eligible, personal: 100, metadataCompleteness: 1 });
    expect(s.confidence).toBe('high');
    expect(s.match).toBe(100);
  });

  it('a strong personal fit on a weaker film lands in between, honestly', () => {
    const s = scoreRecommendation({ quality: 70, evidence: eligible, personal: 90, metadataCompleteness: 1 });
    expect(s.match).toBeGreaterThan(70);
    expect(s.match).toBeLessThan(100);
    expect(s.confidence).toBe('high');
  });
});

describe('the four numbers stay four numbers', () => {
  const eligible = evaluateCandidate(facts({ castIds: [SLJ] }), [requireSLJ]);

  it('requestMatch reflects constraints, not quality', () => {
    const a = scoreRecommendation({ quality: 20, evidence: eligible, personal: null, metadataCompleteness: 1 });
    const b = scoreRecommendation({ quality: 95, evidence: eligible, personal: null, metadataCompleteness: 1 });
    expect(a.requestMatch).toBe(100);
    expect(b.requestMatch).toBe(100);
    expect(a.quality).not.toBe(b.quality);
  });

  it('personal is null until Taste DNA is wired — never invented', () => {
    expect(scoreRecommendation({ quality: 80, evidence: eligible, personal: null, metadataCompleteness: 1 }).personal).toBeNull();
  });

  it('with no constraints at all, requestMatch is neutral rather than perfect', () => {
    /* Nothing was asked for, so nothing was satisfied. Claiming a perfect
       request match for an unconstrained browse is the same lie one level down. */
    const none = evaluateCandidate(facts(), []);
    expect(scoreRecommendation({ quality: 80, evidence: none, personal: null, metadataCompleteness: 1 }).requestMatch).toBe(null);
  });

  it('every score is an integer within 0..100', () => {
    for (const q of [0, 33.3, 77.7, 100]) {
      const s = scoreRecommendation({ quality: q, evidence: eligible, personal: 61.4, metadataCompleteness: 0.7 });
      for (const n of [s.match, s.quality]) {
        expect(Number.isInteger(n)).toBe(true);
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(100);
      }
    }
  });
});
