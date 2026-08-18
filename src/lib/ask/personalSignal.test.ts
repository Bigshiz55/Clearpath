import { describe, it, expect } from 'vitest';
import { personalSignal, PERSONAL_NUDGE_CEILING, type PersonalInputs } from './personalSignal';

/**
 * TASTE DECIDES THE ORDER, NEVER THE MEMBERSHIP.
 *
 * Hard constraints already decided who may be an answer. This layer only says
 * which of those answers this particular person is most likely to love — so
 * every property below is about ORDERING and EVIDENCE, and the one thing it
 * may never do is change who is in the list.
 *
 * BOUNDED ON PURPOSE. The whole personal term is capped, so taste re-orders
 * within a window rather than overpowering quality. A title cannot leap the
 * field because the model likes its genre.
 *
 * PURE. No I/O, no clock.
 */

const base = (over: Partial<PersonalInputs> = {}): PersonalInputs => ({
  objective: 70,
  dimMatch: null,
  prefNudge: 0,
  reasons: [],
  concerns: [],
  explainConfidence: 0,
  ...over,
});

const reason = (text: string, strength = 0.8) => ({ text, kind: 'dim' as const, key: 'k', strength });

describe('no evidence means no personal claim', () => {
  it('a user with nothing on file gets null, not a number', () => {
    const s = personalSignal(base());
    expect(s.personalScore).toBeNull();
    expect(s.participated).toBe(false);
  });

  it('and the ranking order is untouched — the quality score stands', () => {
    expect(personalSignal(base({ objective: 70 })).rankScore).toBe(70);
  });

  it('A FINGERPRINT WE DO NOT HOLD IS NOT A NEUTRAL OPINION', () => {
    // dimMatch null means the title was never classified — not "average fit".
    const s = personalSignal(base({ dimMatch: null, prefNudge: 0 }));
    expect(s.participated).toBe(false);
  });
});

describe('real evidence moves the rank, within a bound', () => {
  it('a strong dimension match raises the rank', () => {
    const s = personalSignal(base({ objective: 70, dimMatch: 95 }));
    expect(s.participated).toBe(true);
    expect(s.rankScore).toBeGreaterThan(70);
  });

  it('a poor dimension match lowers it', () => {
    expect(personalSignal(base({ objective: 70, dimMatch: 5 })).rankScore).toBeLessThan(70);
  });

  it('an explicit preference nudge counts on its own', () => {
    const s = personalSignal(base({ objective: 70, prefNudge: 9 }));
    expect(s.participated).toBe(true);
    expect(s.rankScore).toBe(79);
  });

  it('THE TOTAL MOVEMENT IS CAPPED — taste re-orders, it does not overpower', () => {
    const best = personalSignal(base({ objective: 50, dimMatch: 100, prefNudge: 999 }));
    const worst = personalSignal(base({ objective: 50, dimMatch: 0, prefNudge: -999 }));
    expect(best.rankScore - 50).toBeLessThanOrEqual(PERSONAL_NUDGE_CEILING);
    expect(50 - worst.rankScore).toBeLessThanOrEqual(PERSONAL_NUDGE_CEILING);
  });

  it('a much stronger title still outranks a much weaker one after personalization', () => {
    /* The property that keeps the list sane: the cap is smaller than a real
       quality gap, so taste cannot invert a decisive one. */
    const strongDisliked = personalSignal(base({ objective: 90, dimMatch: 0, prefNudge: -10 }));
    const weakLoved = personalSignal(base({ objective: 40, dimMatch: 100, prefNudge: 10 }));
    expect(strongDisliked.rankScore).toBeGreaterThan(weakLoved.rankScore);
  });

  it('scores stay inside 0..100', () => {
    expect(personalSignal(base({ objective: 2, dimMatch: 0, prefNudge: -10 })).personalScore).toBeGreaterThanOrEqual(0);
    expect(personalSignal(base({ objective: 99, dimMatch: 100, prefNudge: 10 })).personalScore).toBeLessThanOrEqual(100);
  });
});

describe('EVERY MOVEMENT CARRIES ITS EVIDENCE', () => {
  it('reasons and concerns travel with the score', () => {
    const s = personalSignal(
      base({ dimMatch: 88, reasons: [reason('You usually enjoy grounded crime')], concerns: [reason('You tend to avoid slow burns')] }),
    );
    expect(s.evidence.reasons.map((r) => r.text)).toContain('You usually enjoy grounded crime');
    expect(s.evidence.concerns.map((r) => r.text)).toContain('You tend to avoid slow burns');
  });

  it('EVIDENCE ALONE COUNTS AS PARTICIPATION — a stated preference is signal', () => {
    const s = personalSignal(base({ reasons: [reason('You like Samuel L. Jackson')] }));
    expect(s.participated).toBe(true);
  });

  it('a personalized score is never returned without something to point at', () => {
    /* The anti-"because you like movies like this" rule, enforced structurally:
       a non-null personalScore requires at least one of a fingerprint match, an
       explicit nudge, or a named reason/concern. */
    for (const s of [
      personalSignal(base({ dimMatch: 90 })),
      personalSignal(base({ prefNudge: 5 })),
      personalSignal(base({ reasons: [reason('You rated Heat highly')] })),
    ]) {
      expect(s.personalScore).not.toBeNull();
      const hasSomething =
        s.evidence.reasons.length > 0 || s.evidence.concerns.length > 0 || s.evidence.dimensionMatch != null || s.evidence.preferenceNudge !== 0;
      expect(hasSomething).toBe(true);
    }
  });

  it('confidence rises with the strength of what we hold', () => {
    const thin = personalSignal(base({ dimMatch: 60, explainConfidence: 10 }));
    const solid = personalSignal(base({ dimMatch: 95, explainConfidence: 90, reasons: [reason('You rated Heat highly', 0.95)] }));
    expect(solid.evidence.confidence).toBeGreaterThan(thin.evidence.confidence);
  });
});

describe('determinism', () => {
  it('the same inputs give the same signal', () => {
    const i = base({ objective: 61, dimMatch: 73, prefNudge: 4, reasons: [reason('x')] });
    expect(personalSignal(i)).toEqual(personalSignal(i));
  });
});
