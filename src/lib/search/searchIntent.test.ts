import { describe, it, expect } from 'vitest';
import {
  couldBeTitle,
  classifySearchIntent,
  isRecommendationRequest,
  resolveSearchDestination,
  pickResult,
  askHref,
  MAX_QUERY,
  type CatalogResult,
} from './searchIntent';

/**
 * THE USER-LEVEL FAILURE THIS SUITE EXISTS FOR:
 * "an exact title search returns an unrelated Judge recommendation instead of
 * the title." Every query used to go to /app/ask. These tests pin the line
 * between looking something up and asking for a recommendation.
 */

const r = (id: number, title: string, mediaType: 'movie' | 'tv' = 'tv', year: number | null = null): CatalogResult =>
  ({ id, title, mediaType, year });

describe('an exact title is a lookup, not a recommendation request', () => {
  it('“CSI: NY” searches the catalog', () => {
    expect(classifySearchIntent('CSI: NY')).toBe('catalog');
    expect(isRecommendationRequest('CSI: NY')).toBe(false);
  });

  it('holds for titles that merely CONTAIN request-ish words', () => {
    // Every one of these is a real title. A naive keyword scan sends them all
    // to the Judge; none of them is a request.
    for (const t of [
      'Finding Nemo',
      'The Hours',
      'Under the Dome',
      'What We Do in the Shadows',
    ]) {
      expect(classifySearchIntent(t), t).toBe('catalog');
    }
  });

  it('never treats length alone as intent — long titles are still titles', () => {
    // The previous heuristic called any five-word query a request, which broke
    // exactly these.
    for (const t of ['The Lord of the Rings', 'Everything Everywhere All at Once', 'Eternal Sunshine of the Spotless Mind']) {
      expect(classifySearchIntent(t), t).toBe('catalog');
    }
  });

  it('people, genres and platforms are lookups too', () => {
    for (const t of ['Tom Hanks', 'Christopher Nolan', 'crime', 'documentary', 'BritBox', 'Netflix']) {
      expect(classifySearchIntent(t), t).toBe('catalog');
    }
  });
});

describe('a real recommendation request goes to the Judge', () => {
  it('“Find me three crime thrillers under two hours”', () => {
    expect(classifySearchIntent('Find me three crime thrillers under two hours')).toBe('ask');
  });

  it('covers the ordinary ways people ask', () => {
    for (const t of [
      'find me a funny crime movie under two hours',
      'show me something scary',
      'recommend a comedy',
      'what should i watch tonight',
      'I want a documentary about food',
      'something light and funny',
      'give me 3 crime thrillers',
      'anything with a happy ending',
      'looking for a good thriller',
      'in the mood for a western',
    ]) {
      expect(classifySearchIntent(t), t).toBe('ask');
    }
  });

  it('a bare constraint is a request even with no verb', () => {
    // "under two hours" is not part of any title; it is a filter.
    expect(classifySearchIntent('crime movie under 90 minutes')).toBe('ask');
    expect(classifySearchIntent('comedies under two hours')).toBe('ask');
  });

  it('a count plus a media noun is a request, not a title', () => {
    expect(classifySearchIntent('3 crime thrillers')).toBe('ask');
    expect(classifySearchIntent('five comedies')).toBe('ask');
    // …but a number that is part of a title is not.
    expect(classifySearchIntent('12 Angry Men')).toBe('catalog');
    expect(classifySearchIntent('7 Seconds')).toBe('catalog');
  });
});

describe('an exact normalized title beats a more popular near-match', () => {
  it('picks the exact match even when it is not first', () => {
    // TMDB orders by popularity, so the famous near-match routinely leads.
    const results = [r(1, 'Gone Girl', 'movie'), r(2, 'Gone', 'tv')];
    expect(pickResult('Gone', results)!.id).toBe(2);
  });

  it('matches through punctuation and case', () => {
    const results = [r(10, 'CSI: Miami'), r(11, 'CSI: NY')];
    expect(pickResult('csi ny', results)!.id).toBe(11);
    expect(pickResult('CSI: NY', results)!.id).toBe(11);
  });

  it('falls back to the top result when nothing is exact', () => {
    const results = [r(1, 'Gone Girl', 'movie'), r(2, 'Gone Baby Gone', 'movie')];
    expect(pickResult('gone gir', results)!.id).toBe(1);
  });

  it('is null only when there is nothing at all', () => {
    expect(pickResult('anything', [])).toBeNull();
  });
});

describe('a title that READS like a request is still found', () => {
  it('“Show Me a Hero” opens the series, because the catalog says it exists', () => {
    // The phrase is genuinely ambiguous — no keyword list settles it. A real
    // catalog hit does.
    const d = resolveSearchDestination('Show Me a Hero', [r(99, 'Show Me a Hero')])!;
    expect(d.href).toBe('/app/title/tv/99');
    expect(d.reason).toBe('exact-title');
  });

  it('“Anything Goes” too — a leading "anything" is not always a request', () => {
    const d = resolveSearchDestination('Anything Goes', [r(7, 'Anything Goes', 'movie')])!;
    expect(d.href).toBe('/app/title/movie/7');
    expect(d.reason).toBe('exact-title');
  });

  it('…and still asks the Judge when no such title exists', () => {
    const d = resolveSearchDestination('show me something scary', [])!;
    expect(d.reason).toBe('ask');
  });

  it('short queries are worth looking up; long sentences are not titles', () => {
    expect(couldBeTitle('Show Me a Hero')).toBe(true);
    expect(couldBeTitle('CSI: NY')).toBe(true);
    expect(couldBeTitle('find me three crime thrillers under two hours')).toBe(false);
    expect(couldBeTitle('')).toBe(false);
  });
});

describe('the full destination', () => {
  it('opens the exact title', () => {
    const d = resolveSearchDestination('CSI: NY', [r(10, 'CSI: Miami'), r(11, 'CSI: NY')])!;
    expect(d.href).toBe('/app/title/tv/11');
    expect(d.reason).toBe('exact-title');
  });

  it('opens the best catalog result when nothing is exact', () => {
    const d = resolveSearchDestination('csi', [r(10, 'CSI: Miami'), r(11, 'CSI: NY')])!;
    expect(d.href).toBe('/app/title/tv/10');
    expect(d.reason).toBe('top-result');
  });

  it('sends a request to the Judge without looking anything up', () => {
    const d = resolveSearchDestination('find me three crime thrillers under two hours', [r(1, 'Whatever')])!;
    expect(d.href).toContain('/app/ask?q=');
    expect(d.reason).toBe('ask');
  });

  it('hands an unmatched lookup to the Judge rather than dead-ending', () => {
    const d = resolveSearchDestination('zzzqqq not a real title', [])!;
    expect(d.reason).toBe('no-results');
    expect(d.href).toContain('/app/ask?q=');
  });

  it('an EMPTY query does nothing at all', () => {
    // Navigating on empty would cost the screen you were on, which is the
    // exact thing search-from-anywhere exists to protect.
    for (const empty of ['', '   ', '\n\t ']) {
      expect(resolveSearchDestination(empty, []), JSON.stringify(empty)).toBeNull();
    }
  });

  it('trims, encodes and caps what it sends to the Judge', () => {
    expect(askHref('  heat  ')).toBe('/app/ask?q=heat');
    expect(askHref('c&a? #1 100%')).not.toMatch(/[ "]/);
    expect(decodeURIComponent(askHref('x'.repeat(MAX_QUERY + 250))!.split('q=')[1]!)).toHaveLength(MAX_QUERY);
    expect(askHref('   ')).toBeNull();
  });
});

describe('a bare SUBJECT word is a discovery request, never a title or the generic feed', () => {
  // The production defect: typing "boxing" showed the personalized
  // recommendations feed (Absentia). A bare subject must route to the shared
  // subject pipeline (/app/ask), even when a film literally shares the word.
  it('"boxing" routes to /app/ask as a subject — not a coincidental title', () => {
    const d = resolveSearchDestination('boxing', [
      { id: 999, mediaType: 'movie', title: 'Boxing', year: 2010 },
      { id: 998, mediaType: 'movie', title: 'Boxing Helena', year: 1993 },
    ])!;
    expect(d.reason).toBe('subject');
    expect(d.href).toBe('/app/ask?q=boxing');
    // Never a title page, never a generic browse.
    expect(d.href).not.toContain('/app/title/');
  });

  it('classifies "boxing" as a catalog/lookup intent, not a recommendation sentence', () => {
    // It reaches /app/ask via the SUBJECT rule, which is the discovery surface —
    // not because it looks like a "find me…" request.
    expect(classifySearchIntent('boxing')).toBe('catalog');
  });
});

/**
 * THE SECOND DECISION ENGINE IS GONE. 2026-08-20, same screen as the fixed
 * hero box: typing "a boxing movie" into the SEARCH BAR opened an arbitrary
 * top-result title page — `classifySearchIntent` has its own vocabulary and
 * misses the bare noun-phrase request family the clause layer owns. The
 * clause layer now speaks in `resolveSearchDestination`, AFTER the
 * exact-title check, so catalog evidence still beats phrasing ("Show Me a
 * Hero", "12 Angry Men") and the classifier's own pins above are untouched.
 */
describe('bare noun-phrase requests reach the Judge from the search box', () => {
  const FAMILY = [
    'a boxing movie',
    'boxing movies',
    'a scary movie',
    'a courtroom movie',
    'a great date night movie',
    'a really good boxing movie from the eighties',
  ];
  for (const q of FAMILY) {
    it(`"${q}" resolves to ask, never an arbitrary title page`, () => {
      const d = resolveSearchDestination(q, [r(1, 'GoodFellas', 'movie'), r(2, 'Rocky', 'movie')])!;
      expect(d.reason, `"${q}" was handed to a title page`).toBe('ask');
      expect(d.href).toContain('/app/ask?q=');
      expect(d.href).not.toContain('/app/title/');
    });
  }

  it('CONTROL: exact catalog evidence still beats request-shaped phrasing', () => {
    const a = resolveSearchDestination('Show Me a Hero', [r(5, 'Show Me a Hero', 'tv')])!;
    expect(a.reason).toBe('exact-title');
    const b = resolveSearchDestination('12 Angry Men', [r(6, '12 Angry Men', 'movie')])!;
    expect(b.reason).toBe('exact-title');
  });

  it('CONTROL: a plain near-miss lookup still opens the top result', () => {
    const d = resolveSearchDestination('csi', [r(10, 'CSI: Miami'), r(11, 'CSI: NY')])!;
    expect(d.reason).toBe('top-result');
  });
});
