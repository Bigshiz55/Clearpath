import { describe, it, expect } from 'vitest';
import {
  initialsFor,
  hueFor,
  formatNames,
  truncateTitle,
  buildVetoSection,
  buildShareCardText,
  MAX_VETO_LINES,
  type ShareCardInput,
} from './shareCard';

describe('initialsFor', () => {
  it('takes the first two letters of a single-word name', () => {
    expect(initialsFor('Scott')).toBe('SC');
  });
  it('takes one letter from each of the first two words', () => {
    expect(initialsFor('Mary Jane')).toBe('MJ');
    expect(initialsFor('  Amy   Lee  ')).toBe('AL');
  });
  it('never blanks out — empty or whitespace-only names get a placeholder', () => {
    expect(initialsFor('')).toBe('?');
    expect(initialsFor('   ')).toBe('?');
  });
  it('handles a hyphenated single word as one word', () => {
    expect(initialsFor('Mary-Jane')).toBe('MA');
  });
});

describe('hueFor', () => {
  it('is deterministic — the same name always gets the same hue', () => {
    expect(hueFor('Scott')).toBe(hueFor('Scott'));
  });
  it('stays within a valid hue range', () => {
    for (const name of ['Scott', 'Amy', 'Heather', '', 'X', 'a very long juror name indeed']) {
      const h = hueFor(name);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
    }
  });
  it('different names usually land on different hues (not a constant function)', () => {
    const hues = new Set(['Scott', 'Amy', 'Heather', 'Marcus', 'Priya'].map(hueFor));
    expect(hues.size).toBeGreaterThan(1);
  });
});

describe('formatNames', () => {
  it('formats zero, one, two and three+ names correctly', () => {
    expect(formatNames([])).toBe('the group');
    expect(formatNames(['Scott'])).toBe('Scott');
    expect(formatNames(['Scott', 'Amy'])).toBe('Scott & Amy');
    expect(formatNames(['Scott', 'Amy', 'Heather'])).toBe('Scott, Amy & Heather');
    expect(formatNames(['Scott', 'Amy', 'Heather', 'Marcus'])).toBe('Scott, Amy, Heather & Marcus');
  });
  it('drops blank entries rather than printing an empty slot', () => {
    expect(formatNames(['Scott', '  ', 'Amy'])).toBe('Scott & Amy');
  });
});

describe('truncateTitle', () => {
  it('leaves short titles untouched', () => {
    expect(truncateTitle('Inside Out', 42)).toBe('Inside Out');
  });
  it('truncates at the boundary with an ellipsis, never mid-cut silently', () => {
    const long = 'A'.repeat(50);
    const out = truncateTitle(long, 10);
    expect(out.length).toBe(10);
    expect(out.endsWith('…')).toBe(true);
  });
  it('trims surrounding whitespace first', () => {
    expect(truncateTitle('  Up  ', 42)).toBe('Up');
  });
});

describe('buildVetoSection — caps without silently dropping', () => {
  const vetoes = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ title: `Title ${i}`, byNames: ['Scott'] }));

  it('shows everything under the cap with no overflow', () => {
    const s = buildVetoSection(vetoes(2));
    expect(s.lines).toHaveLength(2);
    expect(s.overflow).toBe(0);
  });
  it('caps at MAX_VETO_LINES and states the overflow honestly', () => {
    const s = buildVetoSection(vetoes(7));
    expect(s.lines).toHaveLength(MAX_VETO_LINES);
    expect(s.overflow).toBe(3);
  });
  it('handles zero vetoes', () => {
    const s = buildVetoSection([]);
    expect(s.lines).toEqual([]);
    expect(s.overflow).toBe(0);
  });
  it('formats each line\'s "by" text using formatNames', () => {
    const s = buildVetoSection([{ title: 'Nope', byNames: ['Scott', 'Amy'] }]);
    expect(s.lines[0]!.by).toBe('Scott & Amy');
  });
});

describe('buildShareCardText — the full assembly', () => {
  const base: ShareCardInput = {
    title: 'The Quiet Room',
    year: 2019,
    posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
    groupScore: 84,
    joinUrl: 'https://clearpath-pearl-chi.vercel.app/court/HARNESS1',
    jurors: [],
    vetoed: [],
  };

  it('carries the group score through, clamped and rounded', () => {
    expect(buildShareCardText(base).groupScore).toBe(84);
    expect(buildShareCardText({ ...base, groupScore: 101 }).groupScore).toBe(100);
    expect(buildShareCardText({ ...base, groupScore: -5 }).groupScore).toBe(0);
    expect(buildShareCardText({ ...base, groupScore: 77.6 }).groupScore).toBe(78);
  });

  it('round-trips year as a string, and omits it honestly when unknown', () => {
    expect(buildShareCardText(base).year).toBe('2019');
    expect(buildShareCardText({ ...base, year: null }).year).toBe('');
  });

  it('carries the join URL through untouched — this is the acquisition surface', () => {
    expect(buildShareCardText(base).joinUrl).toBe(base.joinUrl);
  });

  it('renders correctly for 2, 3 and 5 jurors', () => {
    for (const n of [2, 3, 5]) {
      const jurors = Array.from({ length: n }, (_, i) => ({ name: `Juror ${i}`, score: 60 + i }));
      const text = buildShareCardText({ ...base, jurors });
      expect(text.jurors).toHaveLength(n);
      for (const j of text.jurors) {
        expect(j.initials.length).toBeGreaterThanOrEqual(1);
        expect(j.initials.length).toBeLessThanOrEqual(2);
        expect(j.initials).toBe(j.initials.toUpperCase());
        expect(Number.isInteger(j.score)).toBe(true);
      }
    }
  });

  it('rounds fractional scores', () => {
    const text = buildShareCardText({ ...base, jurors: [{ name: 'Scott', score: 81.6 }] });
    expect(text.jurors[0]!.score).toBe(82);
  });

  it('never fabricates a wordmark — the two brand halves are fixed constants', () => {
    expect(buildShareCardText(base).wordmark).toEqual({ prefix: 'Watch', suffix: 'VERD1CT' });
  });

  it('handles a missing poster and an empty jury without throwing', () => {
    expect(() => buildShareCardText({ ...base, posterUrl: null, jurors: [] })).not.toThrow();
  });
});
