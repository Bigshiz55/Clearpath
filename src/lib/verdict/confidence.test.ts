import { describe, it, expect } from 'vitest';
import {
  DNA_CONFIDENT_MIN,
  DNA_PERSONAL_MIN,
  ratingsUntilPersonal,
  recommendationHeading,
  verdictConfidence,
} from './confidence';

const solid = { evidence: 'high' as const, sampleSize: DNA_CONFIDENT_MIN + 5, personalized: true };

describe('the label is capped by what we actually know', () => {
  it('a strong evidence base plus a well-fed model is high confidence', () => {
    const c = verdictConfidence(solid);
    expect(c.label).toBe('high');
    expect(c.text).toBe('High confidence');
  });

  it('NO taste ratings can never be more than an early prediction, however good the reviews', () => {
    const c = verdictConfidence({ evidence: 'high', sampleSize: 0, personalized: false });
    expect(c.label).toBe('early');
    expect(c.text).toBe('Early prediction');
    expect(c.because.join(' ')).toMatch(/no taste ratings/i);
  });

  it('a thin model caps a strong evidence base at early, and says how many more', () => {
    const c = verdictConfidence({ evidence: 'high', sampleSize: 4, personalized: true });
    expect(c.label).toBe('early');
    expect(c.because.join(' ')).toContain(`rate ${DNA_PERSONAL_MIN - 4} more`);
  });

  it('a mid-sized model steps a high evidence base down to medium rather than claiming high', () => {
    const c = verdictConfidence({ evidence: 'high', sampleSize: DNA_PERSONAL_MIN + 1, personalized: true });
    expect(c.label).toBe('medium');
  });

  it('weak evidence is an early prediction even with a rich model', () => {
    expect(verdictConfidence({ evidence: 'low', sampleSize: 90, personalized: true }).label).toBe('early');
  });
});

describe('extrapolation and groups lower the claim', () => {
  it('a title outside the usual taste range steps high down to medium', () => {
    const c = verdictConfidence({ ...solid, outsideUsualTaste: true });
    expect(c.label).toBe('medium');
    expect(c.because.join(' ')).toMatch(/outside what you usually watch/i);
  });

  it('a group with an unknown member cannot be high confidence', () => {
    const c = verdictConfidence({ ...solid, participants: { total: 3, withDna: 2 } });
    expect(c.label).toBe('medium');
    expect(c.because.join(' ')).toMatch(/1 of 3 person has no taste profile/i);
  });

  it('a fully-known group keeps its confidence and says so', () => {
    const c = verdictConfidence({ ...solid, participants: { total: 3, withDna: 3 } });
    expect(c.label).toBe('high');
    expect(c.because.join(' ')).toMatch(/All 3 people have a taste profile/i);
  });

  it('a solo viewer is not described as a group', () => {
    const c = verdictConfidence({ ...solid, participants: { total: 1, withDna: 1 } });
    expect(c.because.join(' ')).not.toMatch(/people have a taste profile/i);
  });
});

describe('it always explains itself in plain language', () => {
  it('every outcome carries at least one reason a person can read', () => {
    for (const input of [
      solid,
      { evidence: 'low' as const, sampleSize: 0, personalized: false },
      { evidence: 'medium' as const, sampleSize: 12, personalized: true },
      {},
    ]) {
      const c = verdictConfidence(input);
      expect(c.because.length).toBeGreaterThan(0);
      for (const line of c.because) expect(line.length).toBeGreaterThan(10);
    }
  });

  it('never says "low confidence" — that reads as a bad title, not a thin model', () => {
    for (const s of [0, 3, 9, 40]) {
      expect(verdictConfidence({ evidence: 'low', sampleSize: s }).text).not.toMatch(/low/i);
    }
  });
});

describe('the honest recommendation heading', () => {
  it('a cold-start user is offered popular picks, not "Recommended for you"', () => {
    const h = recommendationHeading(0);
    expect(h.heading).toBe('Popular picks while we learn your taste');
    expect(h.note).toContain(`Rate ${DNA_PERSONAL_MIN} titles`);
  });

  it('a partly-known user gets early picks and an exact count to unlock', () => {
    const h = recommendationHeading(7);
    expect(h.heading).toMatch(/Early picks/);
    expect(h.note).toContain('Rate 3 more');
  });

  it('a known user gets the real thing', () => {
    expect(recommendationHeading(DNA_PERSONAL_MIN).heading).toBe('Recommended for you');
  });

  it('an unpersonalized ranking never claims to be for you, whatever the sample', () => {
    expect(recommendationHeading(50, false).heading).toBe('Popular picks while we learn your taste');
  });

  it('the countdown is honest at the edges', () => {
    expect(ratingsUntilPersonal(0)).toBe(DNA_PERSONAL_MIN);
    expect(ratingsUntilPersonal(DNA_PERSONAL_MIN)).toBe(0);
    expect(ratingsUntilPersonal(999)).toBe(0);
    expect(ratingsUntilPersonal(-5)).toBe(DNA_PERSONAL_MIN);
  });
});
