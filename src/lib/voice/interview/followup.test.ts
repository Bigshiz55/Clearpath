import { describe, it, expect } from 'vitest';
import { buildFollowUp, CATEGORY_PROBES, GENERIC_TITLE_PROBES, SUBJECT_PROBES } from './followup';

describe('buildFollowUp', () => {
  it('never accepts a shallow "I like crime movies"', () => {
    const f = buildFollowUp({ subject: 'crime', category: 'crime', shallow: true }, 3);
    expect(f.probes).toEqual([
      'What kind — serial killers? Heists?',
      'Courtroom, or detective stories?',
      'Police corruption, or true crime?',
    ]);
    expect(f.openedTurn).toBe(3);
    expect(f.reason.toLowerCase()).toContain('thin');
    expect(f.topic).toBe('crime');
  });

  it('provides fan-outs for the major genres', () => {
    for (const subject of ['horror', 'sci-fi', 'comedy', 'drama', 'thriller', 'romance']) {
      const f = buildFollowUp({ subject, shallow: true }, 1);
      expect(f.probes.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('falls back to the generic title probe when nothing specific fits', () => {
    const f = buildFollowUp({ shallow: false }, 5);
    expect(f.probes).toEqual(GENERIC_TITLE_PROBES);
    expect(f.probes[0]).toBe('What grabbed you — the mystery, or the tension?');
    expect(f.reason.toLowerCase()).toContain('deeper');
  });

  it('prefers the subject probe over the category probe', () => {
    const f = buildFollowUp({ subject: 'horror', category: 'crime', shallow: true }, 1);
    expect(f.probes).toEqual(SUBJECT_PROBES['horror']);
  });

  it('uses the category probe when only a category is given', () => {
    const f = buildFollowUp({ category: 'sciFi', shallow: true }, 1);
    expect(f.probes).toEqual(CATEGORY_PROBES.sciFi);
  });
});
