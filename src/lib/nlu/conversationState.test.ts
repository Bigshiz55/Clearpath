import { describe, it, expect } from 'vitest';
import {
  applyTurn,
  chipsFor,
  removeChip,
  sanitizeRequestState,
  EMPTY_REQUEST,
  type CanonicalRequest,
  type TurnContext,
} from '@/lib/nlu/conversationState';
import { GENRE_IDS } from '@/lib/finderGenres';

const NOW = { nowYear: 2026 };

function turns(texts: [string, TurnContext?][]): CanonicalRequest {
  let s = EMPTY_REQUEST;
  for (const [text, ctx] of texts) s = applyTurn(s, text, { ...NOW, ...(ctx ?? {}) }).state;
  return s;
}

describe('the canonical six-turn conversation from the spec', () => {
  it('retains and correctly updates every constraint across all turns', () => {
    const shown = { shownYears: [1976, 1979, 2015, 2018, 2023] };
    let s = applyTurn(EMPTY_REQUEST, 'Something like Rocky.', NOW).state;
    expect(s.referenceTitles).toContain('Rocky');

    s = applyTurn(s, 'Newer.', { ...NOW, ...shown }).state;
    expect(s.minYear).toBe(2016); // median 2015 + 1 — anchored to what was shown
    expect(s.referenceTitles).toContain('Rocky'); // reference survives

    s = applyTurn(s, 'No documentaries.', NOW).state;
    expect(s.excludeDocumentaries).toBe(true);
    expect(s.excludeGenreIds).toContain(GENRE_IDS.documentary);
    expect(s.minYear).toBe(2016); // year bound survives

    s = applyTurn(s, 'Under two hours.', NOW).state;
    expect(s.maxRuntime).toBe(120);

    s = applyTurn(s, 'Only things included with Hulu.', NOW).state;
    expect(s.providers).toEqual(['Hulu']);
    expect(s.monetization).toEqual(['flatrate']);

    s = applyTurn(s, 'Actually Peacock too.', NOW).state;
    expect(s.providers).toEqual(['Hulu', 'Peacock']);

    // NOTHING was lost along the way.
    expect(s.referenceTitles).toContain('Rocky');
    expect(s.minYear).toBe(2016);
    expect(s.excludeDocumentaries).toBe(true);
    expect(s.maxRuntime).toBe(120);
  });
});

describe('contextual follow-ups', () => {
  it('newer/older anchor to the shown years', () => {
    const ctx = { shownYears: [1990, 2000, 2010] };
    expect(applyTurn(EMPTY_REQUEST, 'newer', { ...NOW, ...ctx }).state.minYear).toBe(2001);
    expect(applyTurn(EMPTY_REQUEST, 'older', { ...NOW, ...ctx }).state.maxYear).toBe(1999);
  });

  it('newer with no context falls back to the documented default and says so', () => {
    const r = applyTurn(EMPTY_REQUEST, 'newer', NOW);
    expect(r.state.minYear).toBe(2021);
    expect(r.interpretation.join(' ')).toMatch(/no results to compare/);
  });

  it('"not that old" raises the floor to the shown median', () => {
    const s = applyTurn(EMPTY_REQUEST, 'not that old', { ...NOW, shownYears: [1980, 1995, 2020] }).state;
    expect(s.minYear).toBe(1995);
  });

  it('shorter tightens runtime; longer releases it', () => {
    let s = applyTurn(EMPTY_REQUEST, 'shorter', { ...NOW, shownRuntimes: [95, 130, 150] }).state;
    expect(s.maxRuntime).toBe(94);
    s = applyTurn(s, 'longer', NOW).state;
    expect(s.maxRuntime).toBeNull();
  });

  it('funnier adds comedy; darker is a soft tone, never a filter', () => {
    const s = turns([['funnier'], ['darker']]);
    expect(s.includeGenreIds).toContain(GENRE_IDS.comedy);
    expect(s.tones).toEqual(['funny', 'dark']);
    expect(s.excludeGenreIds).toEqual([]);
  });

  it('only movies / include series too', () => {
    let s = applyTurn(EMPTY_REQUEST, 'only movies', NOW).state;
    expect(s.mediaType).toBe('movie');
    s = applyTurn(s, 'include series too', NOW).state;
    expect(s.mediaType).toBe('any');
  });

  it('remove Hulu removes exactly Hulu', () => {
    let s = turns([['only on Hulu'], ['add Peacock']]);
    expect(s.providers).toEqual(['Hulu', 'Peacock']);
    s = applyTurn(s, 'remove Hulu', NOW).state;
    expect(s.providers).toEqual(['Peacock']);
  });

  it('"I already saw those" excludes the shown titles and prefers unseen', () => {
    const ids = [{ mediaType: 'movie' as const, id: 1 }, { mediaType: 'tv' as const, id: 2 }];
    const s = applyTurn(EMPTY_REQUEST, 'I already saw those', { ...NOW, shownIds: ids }).state;
    expect(s.excludeIds).toEqual(ids);
    expect(s.unseenOnly).toBe(true);
  });

  it('"something else with that actor" keeps the person, drops the title anchor', () => {
    let s = applyTurn(EMPTY_REQUEST, 'movies like Rocky', NOW).state;
    s.includePeople = ['Sylvester Stallone'];
    s = applyTurn(s, 'something else with that actor', { ...NOW, shownIds: [{ mediaType: 'movie', id: 9 }] }).state;
    expect(s.referenceTitles).toEqual([]);
    expect(s.includePeople).toEqual(['Sylvester Stallone']);
    expect(s.excludeIds).toEqual([{ mediaType: 'movie', id: 9 }]);
  });

  it('"only things I can watch tonight" = my services, no rentals', () => {
    const s = applyTurn(EMPTY_REQUEST, 'show me only things I can watch tonight', NOW).state;
    expect(s.onMyServices).toBe(true);
    expect(s.monetization).toEqual(['flatrate', 'free', 'ads']);
  });
});

describe('hard constraints are never silently dropped', () => {
  it('negation survives later turns', () => {
    const s = turns([
      ['boxing movies, no documentaries'],
      ['newer', { shownYears: [2018, 2020, 2022] }],
      ['funnier'],
      ['under 100 minutes'],
    ]);
    expect(s.excludeGenreIds).toContain(GENRE_IDS.documentary);
    expect(s.subjects).toContain('boxing');
    expect(s.minYear).toBe(2021);
    expect(s.maxRuntime).toBe(100);
  });

  it('an excluded person survives and removes any matching include', () => {
    let s = EMPTY_REQUEST;
    s = { ...applyTurn(s, 'movies like Rocky', NOW).state, includePeople: ['Stallone'] };
    s = applyTurn(s, 'but not another Stallone movie', NOW).state;
    expect(s.excludePeople).toContain('Stallone');
    expect(s.includePeople).toEqual([]);
  });

  it('an exact month window is a real date, not a year approximation', () => {
    const s = applyTurn(EMPTY_REQUEST, 'released in the last 5 months', NOW).state;
    expect(s.releasedAfter).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('"filmed after 2020" asks rather than silently converting', () => {
    const r = applyTurn(EMPTY_REQUEST, 'boxing movies filmed after 2020', NOW);
    expect(r.clarify).toMatch(/RELEASE date/);
    expect(r.state.minYear).toBe(2020); // the stated interpretation is applied…
  });
});

describe('chips: visible, removable state', () => {
  it('reflects the full state and removal is surgical', () => {
    const s = turns([
      ['boxing movies like Rocky, no documentaries, under 2 hours, only on Hulu'],
    ]);
    const labels = chipsFor(s).map((c) => c.label);
    expect(labels).toEqual(expect.arrayContaining(['like Rocky', 'boxing', 'no documentaries', 'under 120m', 'Hulu', 'movies']));

    const without = removeChip(s, 'nodocs');
    expect(without.excludeDocumentaries).toBe(false);
    expect(without.excludeGenreIds).not.toContain(GENRE_IDS.documentary);
    // Everything else intact.
    expect(without.providers).toEqual(['Hulu']);
    expect(without.maxRuntime).toBe(120);
    expect(without.referenceTitles).toContain('Rocky');
  });
});

describe('sanitizeRequestState: untrusted input is bounded and typed', () => {
  it('coerces junk safely', () => {
    const s = sanitizeRequestState({
      referenceTitles: ['Rocky', 42, 'x'.repeat(500)],
      minYear: 1200,
      maxRuntime: 100000,
      mediaType: 'banana',
      monetization: ['flatrate', 'stolen'],
      excludeIds: [{ mediaType: 'movie', id: 1 }, { mediaType: 'vhs', id: 2 }, null],
      providers: Array.from({ length: 50 }, (_, i) => `P${i}`),
    });
    expect(s.referenceTitles).toEqual(['Rocky']);
    expect(s.minYear).toBeNull();
    expect(s.maxRuntime).toBeNull();
    expect(s.mediaType).toBe('any');
    expect(s.monetization).toEqual(['flatrate']);
    expect(s.excludeIds).toEqual([{ mediaType: 'movie', id: 1 }]);
    expect(s.providers.length).toBeLessThanOrEqual(8);
  });

  it('round-trips a real state losslessly', () => {
    const s = turns([['boxing movies like Rocky after 2020, no documentaries, only on Hulu']]);
    expect(sanitizeRequestState(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
});
