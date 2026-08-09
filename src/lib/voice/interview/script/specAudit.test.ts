import { describe, it, expect } from 'vitest';
import { auditInterview, isAdaptive, type AuditableRun } from './specAudit';
import { runInterview, typicalAnswerSource, type AnswerSource } from './simulate';
import { nextQuestion } from './scriptedInterview';
import { createInterview } from '../director';

/**
 * Two obligations here, and the second is the one that matters.
 *
 *  1. The REAL interview passes the audit.
 *  2. Each guard actually BITES — demonstrated by feeding the audit a
 *     deliberately violating transcript and requiring the specific violation
 *     back. A guard that has only ever seen good input is untested; it could be
 *     asserting nothing at all and no one would know until a regression shipped.
 */

function auditableFrom(source: AnswerSource): AuditableRun {
  const run = runInterview(source);
  const opening = nextQuestion(createInterview('u', 0))?.prompt ?? '';
  return {
    askedIds: run.askedIds,
    openingPrompt: opening,
    genreScores: run.progress.genreScores,
    meaningfulTurns: run.meaningfulTurns,
  };
}

const GOOD: AuditableRun = {
  askedIds: ['s1-a', 's1-b', 's1-c', 's2-crime', 's3-a', 's3-b', 's3-c', 's4-love', 's4-bail'],
  openingPrompt: 'Quick gut check, one to ten each — crime, comedy, sci-fi.',
  genreScores: { crime: 9, comedy: 4, scifi: 3 },
  meaningfulTurns: 9,
};

describe('the real interview satisfies the specification', () => {
  it('an enthusiastic user produces no violations', () => {
    expect(auditInterview(auditableFrom(typicalAnswerSource))).toEqual([]);
  });

  it('a user who likes nothing still produces no violations', () => {
    const flat: AnswerSource = (q) => (q.kind === 'anchor' ? 'not really anything' : '2, 2, 2');
    expect(auditInterview(auditableFrom(flat))).toEqual([]);
  });
});

describe('each guard bites on a violating transcript', () => {
  it('catches a vague opening', () => {
    expect(
      auditInterview({ ...GOOD, openingPrompt: 'So, tell me about movies you like!' }),
    ).toContain('vague-opening');
  });

  it('catches an opener that is not a scored question', () => {
    expect(auditInterview({ ...GOOD, openingPrompt: 'What did you watch last night?' })).toContain('vague-opening');
  });

  it('catches an interview that ended after one answer', () => {
    const v = auditInterview({ ...GOOD, askedIds: ['s1-a'], meaningfulTurns: 1 });
    expect(v).toContain('ended-after-one-answer');
    expect(v).toContain('too-few-meaningful-turns');
  });

  it('catches title anchors asked before genre calibration finished', () => {
    expect(
      auditInterview({
        ...GOOD,
        askedIds: ['s1-a', 's4-love', 's1-b', 's1-c', 's3-a', 's3-b', 's3-c', 's4-bail', 's2-crime'],
      }),
    ).toContain('anchors-before-genre-calibration');
  });

  it('catches a drill-down into a genre the user rated low', () => {
    expect(
      auditInterview({
        ...GOOD,
        askedIds: [...GOOD.askedIds, 's2-scifi'], // sci-fi scored 3
      }),
    ).toContain('unearned-drill-down');
  });

  it('catches a drill-down into a genre that was never scored at all', () => {
    expect(auditInterview({ ...GOOD, askedIds: [...GOOD.askedIds, 's2-horror'] })).toContain('unearned-drill-down');
  });

  it('catches an interview with too few meaningful turns', () => {
    expect(auditInterview({ ...GOOD, meaningfulTurns: 7 })).toContain('too-few-meaningful-turns');
  });

  it('passes a clean transcript with no violations', () => {
    expect(auditInterview(GOOD)).toEqual([]);
  });
});

describe('adaptivity is judged across users, not within one', () => {
  it('detects a real interview adapting to different answers', () => {
    const crime = auditableFrom(typicalAnswerSource);
    const horror = auditableFrom((q) =>
      ({ 's1-a': '1, 2, 3', 's1-b': '10, 2, 1', 's1-c': '2, 1, 1' })[q.id] ?? '2, 2, 2',
    );
    expect(isAdaptive(crime, horror)).toBe(true);
  });

  it('catches a fixed questionnaire that ignores the answers', () => {
    // Same questions for two very different users = not an adaptive interview.
    const fixed = ['s1-a', 's1-b', 's1-c', 's3-a', 's3-b', 's3-c', 's4-love', 's4-bail'];
    const a: AuditableRun = { ...GOOD, askedIds: fixed, genreScores: { crime: 10, horror: 1 } };
    const b: AuditableRun = { ...GOOD, askedIds: fixed, genreScores: { crime: 1, horror: 10 } };
    expect(isAdaptive(a, b)).toBe(false);
  });
});
