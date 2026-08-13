import { describe, it, expect } from 'vitest';
import { householdVerdict } from './householdVerdict';
import { explainVerdict } from './verdictExplain';

describe('household verd1ct — NOT a blind average', () => {
  it('the mission example: Scott 92 / Heather 86 → strong, no objections', () => {
    const v = householdVerdict([
      { name: 'Scott', match: 92 },
      { name: 'Heather', match: 86 },
    ]);
    expect(v.call).toBe('strong');
    expect(v.score).toBeGreaterThanOrEqual(85);
    expect(v.explanation).toContain('No major objections detected.');
    expect(v.floor).toEqual({ name: 'Heather', match: 86 });
  });

  it('the mission warning example: Scott 94 / Heather 48 → warning, never "strong average"', () => {
    const v = householdVerdict([
      { name: 'Scott', match: 94 },
      { name: 'Heather', match: 48 },
    ]);
    expect(v.call).toBe('warning');
    // A plain average would say 71 — the floor-weighted score must sit well below it.
    expect(v.score).toBeLessThan(65);
    expect(v.spread).toBe(46);
    expect(v.explanation.join(' ')).toMatch(/Strong mismatch/);
    expect(v.explanation.join(' ')).toMatch(/below the household minimum/);
  });

  it('95/35 is not a strong joint result even though the mean is 65', () => {
    const v = householdVerdict([
      { name: 'A', match: 95 },
      { name: 'B', match: 35 },
    ]);
    expect(v.call).toBe('warning');
    expect(v.score).toBeLessThanOrEqual(50);
  });

  it('a named objection caps the score at 45 and forces a warning', () => {
    const v = householdVerdict([
      { name: 'Scott', match: 90 },
      { name: 'Heather', match: 88, objections: ['too violent'] },
    ]);
    expect(v.call).toBe('warning');
    expect(v.score).toBeLessThanOrEqual(45);
    expect(v.objections).toEqual([{ name: 'Heather', reason: 'too violent' }]);
    expect(v.explanation).toContain('Heather objects: too violent.');
  });

  it('everyone mildly positive → good (not strong), naming the weakest fit', () => {
    const v = householdVerdict([
      { name: 'A', match: 72 },
      { name: 'B', match: 68 },
      { name: 'C', match: 75 },
    ]);
    expect(v.call).toBe('good');
    expect(v.explanation.join(' ')).toContain('weakest fit is B at 68');
  });

  it('nobody objects, nobody excited → toss-up', () => {
    const v = householdVerdict([
      { name: 'A', match: 60 },
      { name: 'B', match: 58 },
    ]);
    expect(v.call).toBe('toss_up');
  });

  it('fairness: notes who picked last time without changing the score', () => {
    const base = householdVerdict([{ name: 'Scott', match: 80 }, { name: 'Heather', match: 78 }]);
    const fair = householdVerdict([{ name: 'Scott', match: 80 }, { name: 'Heather', match: 78 }], { lastPickedBy: 'Scott' });
    expect(fair.score).toBe(base.score);
    expect(fair.explanation.join(' ')).toContain('Scott chose last time');
  });

  it('single member degrades to their own score', () => {
    const v = householdVerdict([{ name: 'Solo', match: 84 }]);
    expect(v.score).toBe(84);
    expect(v.call).toBe('strong');
  });
});

describe('why this verd1ct — explanation assembly', () => {
  const base = {
    matchScore: 88,
    generalScore: 78,
    matchedTraits: ['Fast investigative storytelling'],
    riskTraits: ['Darker than your usual weeknight choice'],
    requirements: [
      { label: 'On Netflix', satisfied: true, evidence: 'Netflix listed by TMDB providers' },
      { label: 'Under 2 hours', satisfied: true, evidence: '118 min runtime' },
    ],
    ratingSourceCount: 3,
    availability: { where: 'Netflix', kind: 'included' as const, confidence: 'verified' as const },
  };

  it('assembles rose / heldBack / requirements / availability / confidence', () => {
    const e = explainVerdict(base);
    expect(e.rose).toContain('Strong personal fit (88 match).');
    expect(e.rose).toContain('Fast investigative storytelling');
    expect(e.heldBack).toContain('Darker than your usual weeknight choice');
    expect(e.availability).toEqual({
      text: 'Netflix · Included with subscription',
      confidence: 'verified',
      service: 'Netflix',
      logoPath: null,
      access: 'Included with subscription',
    });
    expect(e.confidence.level).toBe('high');
    expect(e.confidence.because).toContain('Availability verified.');
  });

  it('a failed requirement lands in heldBack and blocks high confidence', () => {
    const e = explainVerdict({
      ...base,
      requirements: [{ label: 'English audio', satisfied: false, evidence: 'no English track listed' }],
    });
    expect(e.heldBack).toContain('Requirement not met: English audio.');
    expect(e.confidence.level).not.toBe('high');
  });

  it('no personal signal + no ratings + unverified availability → LOW confidence, honestly explained', () => {
    const e = explainVerdict({
      matchScore: null,
      generalScore: null,
      matchedTraits: [],
      riskTraits: [],
      requirements: [],
      ratingSourceCount: 0,
      availability: { where: 'Tubi', kind: 'free_with_ads', confidence: 'unconfirmed' },
    });
    expect(e.confidence.level).toBe('low');
    expect(e.confidence.because).toContain('No personal taste signal yet — match is generic.');
    expect(e.heldBack).toContain('Availability not fully verified.');
    expect(e.heldBack).toContain('No independent rating sources yet.');
  });
});
