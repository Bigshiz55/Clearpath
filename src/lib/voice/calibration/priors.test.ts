import { describe, it, expect } from 'vitest';
import { accumulate } from '@/lib/preference/confidence';
import { emptyDna } from '@/lib/preference/engine';
import type { DnaState } from '@/lib/preference/types';
import { ambiguityQuestions, MAX_AMBIGUITY_QUESTIONS } from './ambiguity';
import {
  CALIBRATION_EVIDENCE,
  applyCalibrationPriors,
  calibrationGenrePriors,
  ratingToTarget,
} from './priors';

/**
 * The product promise this file has to keep, in the user's words: rating
 * "Comedy = 2" should reduce comedy recommendations generally, but must NOT
 * cause the engine to reject a comedy they have explicitly loved. That is an
 * arithmetic property of the evidence weights, so it is asserted numerically
 * rather than described in a comment.
 */

/**
 * One "loved" observation: strength 1.6 toward the top of the scale, folded
 * ONTO whatever is already believed. Accumulating (rather than assigning) is
 * the point — assigning would silently discard a prior and make the
 * order-independence test below pass for the wrong reason.
 */
const withLovedComedy = (dna: DnaState): DnaState => ({
  ...dna,
  attraction: {
    ...dna.attraction,
    genres: {
      ...dna.attraction.genres,
      comedy: accumulate(dna.attraction.genres.comedy ?? { pref: 50, evidence: 0 }, 100, 1.6),
    },
  },
});

describe('a rating becomes a prior, not a rule', () => {
  it('maps the 0–10 scale onto the engine s 0–100 one', () => {
    expect(ratingToTarget(0)).toBe(0);
    expect(ratingToTarget(5)).toBe(50);
    expect(ratingToTarget(10)).toBe(100);
  });

  it('weighs a rating below the weakest quick review (0.35)', () => {
    expect(CALIBRATION_EVIDENCE).toBeLessThan(0.35);
  });

  it('damps a genre when it is all we know', () => {
    const dna = applyCalibrationPriors(emptyDna(), { comedy: 2 });
    expect(dna.attraction.genres.comedy?.pref).toBe(20);
  });

  it('CANNOT overrule a comedy they explicitly loved', () => {
    const loved = withLovedComedy(emptyDna());
    const before = loved.attraction.genres.comedy!.pref;
    const after = applyCalibrationPriors(loved, { comedy: 2 }).attraction.genres.comedy!;

    expect(before).toBe(100);
    // It moves — the stated dislike is real evidence…
    expect(after.pref).toBeLessThan(before);
    // …but the loved title still dominates by a wide margin.
    expect(after.pref).toBeGreaterThan(85);
  });

  it('order does not matter — priors may be applied after events are folded', () => {
    // This is why the module can live outside the pure engine: `accumulate` is
    // a weighted mean, so seeding first and folding after are the same number.
    const priorsFirst = withLovedComedy(applyCalibrationPriors(emptyDna(), { comedy: 2 }));
    const eventsFirst = applyCalibrationPriors(withLovedComedy(emptyDna()), { comedy: 2 });
    expect(priorsFirst.attraction.genres.comedy?.pref).toBeCloseTo(
      eventsFirst.attraction.genres.comedy?.pref ?? -1,
      10,
    );
  });

  it('treats 5 as "no opinion" rather than evidence for the middle', () => {
    expect(calibrationGenrePriors({ comedy: 5 })).toEqual([]);
    expect(applyCalibrationPriors(emptyDna(), { comedy: 5 }).attraction.genres.comedy).toBeUndefined();
  });

  it('splits an item s weight across the genres it touches', () => {
    // "ghosts / supernatural" informs two genres; it must not get two full votes.
    const priors = calibrationGenrePriors({ supernatural: 10 });
    expect(priors).toHaveLength(2);
    const total = priors.reduce((sum, p) => sum + p.weight, 0);
    expect(total).toBeCloseTo(CALIBRATION_EVIDENCE, 10);
  });

  it('leaves the experience channel alone — a warm-up is not a viewing history', () => {
    const dna = applyCalibrationPriors(emptyDna(), { comedy: 0, crime: 10 });
    expect(dna.experience.genres).toEqual({});
  });

  it('ignores items with no genre mapping and junk values', () => {
    expect(calibrationGenrePriors({ slowBurn: 10, foreign: 0 })).toEqual([]);
    expect(calibrationGenrePriors({ comedy: Number.NaN })).toEqual([]);
    expect(applyCalibrationPriors(emptyDna(), {})).toEqual(emptyDna());
  });
});

describe('the at-most-two follow-up questions', () => {
  const knownHorrorFan = (): DnaState => {
    const dna = emptyDna();
    return {
      ...dna,
      experience: {
        ...dna.experience,
        genres: { horror: accumulate({ pref: 50, evidence: 0 }, 100, 1.6 * 3) },
      },
    };
  };

  it('asks nothing when the ratings agree with themselves and with us', () => {
    expect(ambiguityQuestions({ crime: 8, horror: 7, slowBurn: 8, foreign: 7 }, emptyDna())).toEqual([]);
  });

  it('catches the flagship case: horror rated 1 by someone who loves horror', () => {
    const qs = ambiguityQuestions({ horror: 1 }, knownHorrorFan());
    expect(qs[0]?.id).toBe('horror-psychological');
    expect(qs[0]?.question).toMatch(/psychological/i);
  });

  it('catches the same split stated inside the ratings alone', () => {
    const qs = ambiguityQuestions({ horror: 1, supernatural: 9 }, emptyDna());
    expect(qs.map((q) => q.id)).toContain('ghosts-not-gore');
  });

  it('never asks more than two, however many collisions there are', () => {
    const qs = ambiguityQuestions(
      { horror: 0, supernatural: 10, crime: 10, trueCrime: 0, slowBurn: 0, foreign: 0 },
      knownHorrorFan(),
    );
    expect(qs.length).toBeLessThanOrEqual(MAX_AMBIGUITY_QUESTIONS);
    // …and it keeps the highest-value ones.
    expect(qs[0]?.id).toBe('horror-psychological');
  });

  it('works for a brand-new user with no DNA at all', () => {
    const qs = ambiguityQuestions({ horror: 1, supernatural: 9 }, null);
    expect(qs.length).toBeGreaterThan(0);
    expect(() => ambiguityQuestions({}, null)).not.toThrow();
  });

  it('every question offers both answers and stays short enough to say', () => {
    for (const q of ambiguityQuestions({ horror: 0, supernatural: 10, slowBurn: 0 }, knownHorrorFan())) {
      expect(q.positiveLabel).toBeTruthy();
      expect(q.negativeLabel).toBeTruthy();
      expect(q.question.length).toBeLessThan(90);
    }
  });
});
