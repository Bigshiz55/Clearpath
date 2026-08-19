import { describe, it, expect } from 'vitest';
import { canonicalScore, tasteParticipates, type TasteContribution } from './canonical';
import type { ScoreAdjustment } from '@/lib/types';

/**
 * THE CONTRACT THE PRODUCTION BUG VIOLATED.
 *
 * "Your Verdict 79" in the briefing and "83 · STREAM IT" in QuickLook, same
 * user, same title, same instant — with the 79 explained as "Quality base 79",
 * i.e. an objective number wearing a personal label. These are the properties
 * that make both halves of that unrepresentable rather than merely unlikely.
 */

const adj = (points: number, label = 'Supernatural'): ScoreAdjustment => ({
  trait: 'supernatural',
  label,
  points,
  defining: true,
  reason: 'test',
});

/** A taste contribution that genuinely says something about THIS title. */
const REAL_TASTE: TasteContribution = { score: 88, confidence: 0.5, sampleSize: 20, available: true };

describe('the objective foundation is the Standard Score', () => {
  it('with no personal signal at all, the score IS the objective score', () => {
    const c = canonicalScore({ objective: 83 });
    expect(c.score).toBe(83);
    expect(c.objective).toBe(83);
  });

  it('rounds and clamps rather than emitting a fractional or out-of-range score', () => {
    expect(canonicalScore({ objective: 82.6 }).score).toBe(83);
    expect(canonicalScore({ objective: 10, adjustments: [adj(-50)] }).score).toBe(0);
    expect(canonicalScore({ objective: 95, adjustments: [adj(+50)] }).score).toBe(100);
  });
});

describe('OBJECTIVE-ONLY IS NEVER LABELLED "YOUR VERDICT"', () => {
  /* THE EXACT PRODUCTION LIE. A base score with no user-specific contribution
     was printed as "Your Verdict 79" because the ACCOUNT had enough ratings.
     Personalization is a property of the number, not of the account. */
  it('an objective-only score is labelled Standard Score', () => {
    const c = canonicalScore({ objective: 79 });
    expect(c.personalized).toBe(false);
    expect(c.label).toBe('Standard Score');
  });

  it('a large sample size alone does NOT personalize a title the model cannot see', () => {
    // 500 ratings, but no vector for THIS title — dnaScore returns confidence 0.
    const noVector: TasteContribution = { score: 79, confidence: 0, sampleSize: 500, available: false };
    const c = canonicalScore({ objective: 79, taste: noVector });
    expect(c.personalized, 'account-level volume is not title-level signal').toBe(false);
    expect(c.label).toBe('Standard Score');
  });

  it('rules that exist but never fired are not personalization', () => {
    // A 0-point adjustment is a rule that looked and found nothing.
    const c = canonicalScore({ objective: 79, adjustments: [adj(0)] });
    expect(c.rulesParticipated).toBe(false);
    expect(c.personalized).toBe(false);
  });

  it('the explanation says there is no personal signal, and never poses the base as one', () => {
    const c = canonicalScore({ objective: 79 });
    expect(c.why).toContain('Standard score 79');
    expect(c.why).toContain('no personal signal');
    // The precise regression: "Quality base 79" was the WHOLE explanation under
    // a personal badge. The base may be shown; it may not stand in for signal.
    expect(c.why).not.toMatch(/quality base/i);
  });
});

describe('real personalization is recognised, and only when it is real', () => {
  it('a firing hard rule personalizes the score and moves the number', () => {
    const c = canonicalScore({ objective: 83, adjustments: [adj(-20)] });
    expect(c.score).toBe(63);
    expect(c.rulesParticipated).toBe(true);
    expect(c.personalized).toBe(true);
    expect(c.label).toBe('Your Verdict');
  });

  it('a qualifying taste blend personalizes the score', () => {
    const c = canonicalScore({ objective: 79, taste: REAL_TASTE });
    expect(c.tasteParticipated).toBe(true);
    expect(c.personalized).toBe(true);
    expect(c.score).toBe(88);
  });

  it('taste blends first, then the explicit rule applies ON TOP', () => {
    /* THE ORDER IS THE CONTRACT. A hard rule is something the user said about
       themselves; a model must not dilute it. 88 from taste, then −20. */
    const c = canonicalScore({ objective: 79, taste: REAL_TASTE, adjustments: [adj(-20)] });
    expect(c.score).toBe(68);
  });

  it('the explanation separates the objective base from the personal contributions', () => {
    const c = canonicalScore({ objective: 83, adjustments: [adj(-20, 'Supernatural')] });
    expect(c.why).toContain('Standard score 83');
    expect(c.why).toContain('-20 Supernatural');
  });
});

describe('tasteParticipates — each condition rules out a different fake', () => {
  it('needs a vector for this title', () => {
    expect(tasteParticipates({ ...REAL_TASTE, available: false })).toBe(false);
  });
  it('needs the user to have rated something', () => {
    expect(tasteParticipates({ ...REAL_TASTE, sampleSize: 0 })).toBe(false);
  });
  it('needs the blend to have actually weighted taste', () => {
    expect(tasteParticipates({ ...REAL_TASTE, confidence: 0 })).toBe(false);
  });
  it('and null is not participation', () => {
    expect(tasteParticipates(null)).toBe(false);
    expect(tasteParticipates(undefined)).toBe(false);
  });
});

describe('GUESTS AND NEW USERS GET HONEST OBJECTIVE SCORING', () => {
  it('a guest (no taste, no rules) gets the standard score and no "for you" language', () => {
    const c = canonicalScore({ objective: 71, taste: null, adjustments: [] });
    expect(c.score).toBe(71);
    expect(c.personalized).toBe(false);
    expect(c.label).toBe('Standard Score');
    expect(c.why).not.toMatch(/your/i);
  });
});
