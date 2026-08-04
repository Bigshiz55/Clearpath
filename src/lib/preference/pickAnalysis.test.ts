import { describe, it, expect } from 'vitest';
import { analysePicks, MIN_FOR_PATTERN, type AnalysedPick } from './pickAnalysis';

const YEAR = 2026;

const pick = (over: Partial<AnalysedPick> = {}): AnalysedPick => ({
  title: 'A Film',
  year: 2022,
  mediaType: 'movie',
  genre: 'drama',
  kind: 'like',
  ...over,
});

describe('analysePicks', () => {
  it('says nothing at all when nothing was picked', () => {
    const a = analysePicks([], YEAR);
    expect(a.total).toBe(0);
    expect(a.enough).toBe(false);
    expect(a.facts).toEqual([]);
  });

  it('declines to describe a person from a handful of taps', () => {
    const a = analysePicks([pick(), pick({ genre: 'crime' })], YEAR);
    expect(a.enough).toBe(false);
    expect(a.headline).toContain('not enough to describe you yet');
  });

  it('names the lane once the picks actually support one', () => {
    const picks = [
      ...Array.from({ length: 4 }, () => pick({ genre: 'crime' })),
      ...Array.from({ length: 2 }, () => pick({ genre: 'comedy' })),
    ];
    const a = analysePicks(picks, YEAR);
    expect(a.total).toBe(6);
    expect(a.enough).toBe(true);
    expect(a.leadingGenres).toContain('crime');
    expect(a.headline).toContain('crime');
  });

  it('never calls one lucky tap a trend', () => {
    const picks = [
      pick({ genre: 'horror' }),
      ...Array.from({ length: 5 }, (_, i) => pick({ genre: `g${i}` })),
    ];
    const a = analysePicks(picks, YEAR);
    expect(a.leadingGenres).not.toContain('horror');
  });

  it('says "no single lane" rather than inventing one', () => {
    const picks = Array.from({ length: 6 }, (_, i) => pick({ genre: `g${i}` }));
    const a = analysePicks(picks, YEAR);
    expect(a.leadingGenres).toEqual([]);
    expect(a.headline).toContain('range widely');
  });

  it('reads the era from the years', () => {
    const modern = analysePicks(Array.from({ length: 6 }, () => pick({ year: 2024 })), YEAR);
    expect(modern.facts.find((f) => f.key === 'era')?.detail).toContain('last decade');

    const old = analysePicks(Array.from({ length: 6 }, () => pick({ year: 1988 })), YEAR);
    expect(old.facts.find((f) => f.key === 'era')?.detail).toContain('older titles');
  });

  it('reads films vs series', () => {
    const films = analysePicks(
      [...Array.from({ length: 5 }, () => pick({ mediaType: 'movie' })), pick({ mediaType: 'tv' })],
      YEAR,
    );
    expect(films.facts.find((f) => f.key === 'shape')?.detail).toContain('Films far more');

    const onlyShows = analysePicks(Array.from({ length: 5 }, () => pick({ mediaType: 'tv' })), YEAR);
    expect(onlyShows.facts.find((f) => f.key === 'shape')?.detail).toBe('Series only.');
  });

  it('calls out the titles you had actually seen as the strongest evidence', () => {
    const a = analysePicks(
      [
        pick({ kind: 'seen', rating: 'loved' }),
        pick({ kind: 'seen', rating: 'liked' }),
        ...Array.from({ length: 4 }, () => pick()),
      ],
      YEAR,
    );
    const seen = a.facts.find((f) => f.key === 'seen');
    expect(seen?.detail).toContain('2 you had seen');
    expect(seen?.detail).toContain('strongest evidence');
  });

  it('always carries the honest limit on what it means', () => {
    const a = analysePicks([pick()], YEAR);
    expect(a.caveat).toContain('not recorded as a dislike');
  });

  it('never speaks about a genre that was not picked', () => {
    const a = analysePicks(Array.from({ length: 6 }, () => pick({ genre: 'crime' })), YEAR);
    const text = [a.headline, ...a.facts.map((f) => f.detail), a.caveat].join(' ').toLowerCase();
    expect(text).not.toContain('avoid');
    expect(text).not.toContain('horror');
  });

  it('survives picks with no genre or year at all', () => {
    const a = analysePicks(Array.from({ length: 6 }, () => pick({ genre: null, year: null })), YEAR);
    expect(a.total).toBe(6);
    expect(a.headline).toBeTruthy();
    expect(a.facts.every((f) => typeof f.detail === 'string' && f.detail.length > 0)).toBe(true);
  });

  it('holds the pattern threshold where the copy claims it does', () => {
    const under = analysePicks(Array.from({ length: MIN_FOR_PATTERN - 1 }, () => pick()), YEAR);
    const at = analysePicks(Array.from({ length: MIN_FOR_PATTERN }, () => pick()), YEAR);
    expect(under.enough).toBe(false);
    expect(at.enough).toBe(true);
  });

  describe('"Doesn\'t look good" — a chosen negative, not a silent one', () => {
    it('counts toward the total and gets its own fact', () => {
      const a = analysePicks([pick({ kind: 'not_interested', genre: 'horror' }), pick()], YEAR);
      expect(a.total).toBe(2);
      const passed = a.facts.find((f) => f.key === 'passed');
      expect(passed?.detail).toContain('1');
    });

    it('never counts toward what you reached for — it is what to avoid, not a taste', () => {
      const picks = [
        ...Array.from({ length: 5 }, () => pick({ kind: 'not_interested', genre: 'horror' })),
        pick({ genre: 'comedy' }),
      ];
      const a = analysePicks(picks, YEAR);
      expect(a.leadingGenres).not.toContain('horror');
    });

    it('does not by itself claim enough evidence for a pattern', () => {
      const allPassed = analysePicks(Array.from({ length: MIN_FOR_PATTERN }, () => pick({ kind: 'not_interested' })), YEAR);
      expect(allPassed.enough).toBe(false);
    });

    it('a mixed round still reads the pattern from the positive picks alone', () => {
      const picks = [
        ...Array.from({ length: MIN_FOR_PATTERN }, () => pick({ genre: 'crime' })),
        ...Array.from({ length: 3 }, () => pick({ kind: 'not_interested', genre: 'horror' })),
      ];
      const a = analysePicks(picks, YEAR);
      expect(a.enough).toBe(true);
      expect(a.leadingGenres).toContain('crime');
      expect(a.leadingGenres).not.toContain('horror');
    });
  });
});
