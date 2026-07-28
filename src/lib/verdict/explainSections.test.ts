import { describe, it, expect } from 'vitest';
import { explainSections, knowHeading, SECTION, splitMath, TOP_REASONS } from './explainSections';

describe('the arithmetic comes off the sentence', () => {
  it('lifts a personal-match adjustment out of the reason', () => {
    const r = splitMath('Sci-Fi: a strong personal match (+6).');
    expect(r.text).toBe('Sci-Fi: a strong personal match.');
    expect(r.math).toBe('+6');
  });

  it('handles every numeric shape the engine actually produces', () => {
    expect(splitMath('Strong personal fit (88 match).')).toEqual({ text: 'Strong personal fit.', math: '88 match' });
    expect(splitMath('Well received overall (78/100 across sources).')).toEqual({
      text: 'Well received overall.',
      math: '78/100 across sources',
    });
    expect(splitMath('Meets every checked requirement (4).')).toEqual({
      text: 'Meets every checked requirement.',
      math: '4',
    });
    expect(splitMath('Horror: works against your taste (-8).')).toEqual({
      text: 'Horror: works against your taste.',
      math: '-8',
    });
  });

  it('leaves a reason with no arithmetic completely alone', () => {
    const r = splitMath('Fast investigative storytelling');
    expect(r).toEqual({ text: 'Fast investigative storytelling', math: null });
  });

  it('does NOT strip a parenthetical a person is meant to read', () => {
    // Evidence, not maths — "(matched: heist, caper)" is the reason itself.
    const r = splitMath('Heist present (matched: heist, caper); applying +6.');
    expect(r.math).toBeNull();
    expect(r.text).toContain('matched: heist, caper');
  });

  it('never eats the whole sentence', () => {
    expect(splitMath('(+6)')).toEqual({ text: '(+6)', math: null });
    expect(splitMath('')).toEqual({ text: '', math: null });
  });
});

describe('the negatives heading tells the truth', () => {
  it('does not claim something held it back when nothing did', () => {
    // This exact line is what the engine emits when it finds NO negatives. It
    // was being printed under "What held it back", a heading arguing with its
    // own only item.
    const h = knowHeading(['No major red flags — mainly a question of whether the premise grabs you.']);
    expect(h).toBe(SECTION.uncertain);
    expect(h).not.toMatch(/held it back/i);
  });

  it('calls caveats about our own data what they are', () => {
    expect(knowHeading(['Availability not fully verified.', 'No independent rating sources yet.'])).toBe(
      SECTION.uncertain,
    );
  });

  it('says "Things to know" as soon as one item is about the title', () => {
    expect(knowHeading(['Availability not fully verified.', 'Darker than your usual weeknight choice'])).toBe(
      SECTION.know,
    );
  });

  it('never uses the old heading, in either branch', () => {
    for (const items of [[], ['No major red flags — nothing serious.'], ['Slow first hour']]) {
      expect(knowHeading(items)).not.toMatch(/held it back/i);
    }
  });
});

describe('assembling the three sections', () => {
  const ROSE = [
    'Strong personal fit (88 match).',
    'Fast investigative storytelling',
    'Well received overall (78/100 across sources).',
    'Meets every checked requirement (2).',
    'Backed by a large, reliable pool of audience data.',
    'Legal streaming or rental options are available in your region.',
  ];

  it('leads with the strongest few and holds the rest back', () => {
    const s = explainSections({ rose: ROSE, heldBack: [] });
    expect(s.matched.lead).toHaveLength(TOP_REASONS);
    expect(s.matched.more).toHaveLength(ROSE.length - TOP_REASONS);
    expect(TOP_REASONS).toBeLessThanOrEqual(4);
  });

  it('keeps the engine’s own order — strongest first, never re-sorted', () => {
    const s = explainSections({ rose: ROSE, heldBack: [] });
    expect(s.matched.lead[0]!.text).toBe('Strong personal fit.');
    expect(s.matched.lead[1]!.text).toBe('Fast investigative storytelling');
  });

  it('loses NOTHING — every reason survives in one list or the other', () => {
    const s = explainSections({ rose: ROSE, heldBack: ['Slow first hour'] });
    expect([...s.matched.lead, ...s.matched.more]).toHaveLength(ROSE.length);
    expect(s.know.reasons).toHaveLength(1);
  });

  it('offers the details toggle only when it would open onto something', () => {
    expect(explainSections({ rose: ROSE }).hasDetails).toBe(true);
    expect(explainSections({ rose: ['Strong personal fit (88 match).'] }).hasDetails).toBe(true);
    expect(explainSections({ rose: ['Fast investigative storytelling'], heldBack: ['Slow first hour'] }).hasDetails).toBe(
      false,
    );
  });

  it('uses the section names the card actually shows', () => {
    const s = explainSections({ rose: ROSE, heldBack: ['Slow first hour'] });
    expect(s.matched.heading).toBe('Why it matched');
    expect(s.know.heading).toBe('Things to know');
    expect(SECTION.requirements).toBe('Your requirements');
  });

  it('survives missing and malformed input without throwing', () => {
    expect(() => explainSections({})).not.toThrow();
    const s = explainSections({ rose: ['', '   '], heldBack: [''] });
    expect(s.matched.lead).toHaveLength(0);
    expect(s.know.reasons).toHaveLength(0);
    expect(s.hasDetails).toBe(false);
  });
});
