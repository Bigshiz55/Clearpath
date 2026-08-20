import { describe, it, expect } from 'vitest';
import { canonicalRequestRoute, isTitleRequest } from './requestRoute';
import { askHref } from '@/lib/search/searchIntent';

/**
 * THE SERVER HALF OF THE CONTRACT — the pure decision both the route and the
 * hero box consult. The browser half lives in tests/mobile/nl-request-route.spec.ts;
 * neither alone is sufficient, and a pure test alone is exactly the gap that let
 * "3 Sylvester Stallone movies" ship as a generic feed.
 */
describe('the live defect, pinned', () => {
  it('routes the exact production utterance to the canonical front door', () => {
    const r = canonicalRequestRoute('3 Sylvester Stallone movies');
    expect(r.kind).toBe('request');
    if (r.kind !== 'request') return;
    expect(r.count, 'the stated count was lost').toBe(3);
    expect(decodeURIComponent(r.href)).toContain('Sylvester Stallone');
    // The canonical front door — /app/ask seeds AskTheJudge, which POSTs
    // /api/ask. NOT /app/finder: a third recommendation path is the thing this
    // module exists to prevent.
    expect(r.href).toMatch(/^\/app\/ask\?q=/);
    expect(r.href).not.toContain('/app/finder');
    // Never the feed, never browse.
    expect(r.href).not.toContain('/app/watch');
    expect(r.href).not.toContain('/api/browse');
  });

  it('preserves the personalized and casual phrasings', () => {
    const a = canonicalRequestRoute("find me 3 Sylvester Stallone movies you think I'll like");
    expect(a.kind).toBe('request');
    if (a.kind === 'request') {
      expect(a.count).toBe(3);
      expect(a.personalized).toBe(true);
    }
    const b = canonicalRequestRoute('how about a Bruce Willis movie');
    expect(b.kind).toBe('request');
    if (b.kind === 'request') expect(decodeURIComponent(b.href)).toContain('Bruce Willis');
  });
});

describe('what must NOT become a search', () => {
  it('a pure taste statement still builds DNA', () => {
    expect(isTitleRequest('I love clever thrillers with a twist, but I avoid anything too slow or gory.')).toBe(false);
    expect(isTitleRequest('I hate gore and jump scares')).toBe(false);
  });

  it('a single capitalised word does not fake a person', () => {
    // Sentence-initial capitals and one-word proper nouns must not trip the
    // person shape, or every sentence starting with a capital becomes a search.
    expect(isTitleRequest('Movies')).toBe(false);
    expect(isTitleRequest('I like movies')).toBe(false);
  });

  it('empty input is never a request', () => {
    expect(isTitleRequest('')).toBe(false);
    expect(isTitleRequest('   ')).toBe(false);
  });
});

describe('the existing gate is not weakened', () => {
  it('still routes the genre/mood cases it always did', () => {
    for (const q of ['a good scary movie', 'boxing movies I would like', 'find me a family movie']) {
      expect(isTitleRequest(q), q).toBe(true);
    }
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE PERMANENT ARCHITECTURAL INVARIANT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * A conversational request carrying executable meaning may cross a boundary
 * ONLY by (A) a typed semantic envelope, or (B) the raw utterance preserved for
 * the canonical interpreter. This branch uses (B).
 *
 * Deliberately small and structural — a property over whatever the router
 * returns, not a growing list of English phrases. It fails the moment a future
 * change hands recommendation prose to a destination that cannot represent it.
 */
const INCAPABLE = ['/app/watch', '/api/browse', '/app/finder', '/api/finder'];

describe('the transport invariant', () => {
  const REQUESTS = [
    '3 Sylvester Stallone movies',
    "find me 3 Sylvester Stallone movies you think I'll like",
    'show me some Tom Hanks movies I would enjoy',
    'give me 5 Denzel Washington films',
    'what should I watch tonight with Tom Hanks',
    'how about a Bruce Willis movie',
    'Had a burrito for dinner. Anyway, give me a boxing movie',
    'I watched Rocky three weeks ago, but tonight I want a baseball movie',
    'Give me a thriller but no supernatural stuff',
  ];

  it('never hands a request to a destination that cannot represent it', () => {
    for (const q of REQUESTS) {
      const r = canonicalRequestRoute(q);
      expect(r.kind, `"${q}" was not treated as a request`).toBe('request');
      if (r.kind !== 'request') continue;
      for (const bad of INCAPABLE) {
        expect(r.href, `"${q}" was routed to ${bad}, which cannot carry it`).not.toContain(bad);
      }
    }
  });

  it('preserves the raw utterance losslessly (contract B)', () => {
    for (const q of REQUESTS) {
      const r = canonicalRequestRoute(q);
      if (r.kind !== 'request') continue;
      // Decoded, the `q` parameter must be the utterance itself — not a
      // summary, not a filter, not a truncation of its meaning.
      const carried = new URL(r.href, 'http://x').searchParams.get('q');
      expect(carried, `"${q}" did not survive the handoff`).toBe(q);
    }
  });

  it('uses the ONE canonical door and the shared builder', () => {
    for (const q of REQUESTS) {
      const r = canonicalRequestRoute(q);
      if (r.kind !== 'request') continue;
      // Same href the shared `askHref` builder produces — proving no second
      // string template was introduced here.
      expect(r.href).toBe(askHref(q));
      expect(new URL(r.href, 'http://x').pathname).toBe('/app/ask');
    }
  });
});

/**
 * THE PRODUCTION REPRODUCTION, 2026-08-20. A signed-in user typed
 * "a boxing movie" into State Your Case on the real phone product and got the
 * generic Watch Now feed (GoodFellas first) plus "Locked in: loves a boxing
 * movie". The bare noun-phrase request — the single most ordinary way English
 * asks for a recommendation — carried no find verb, no count, no capitals, so
 * every regex gate waved it to "taste". The clause layer (the same reading
 * /api/ask executes) now decides; these pin the whole spoken family.
 */
describe('bare noun-phrase requests are requests — the clause layer decides', () => {
  const LIVE = [
    'a boxing movie',
    'another boxing movie',
    'a chess movie',
    'a western',
    'another western',
    'something about boxing',
    'give me a boxing movie',
    'show me a boxing movie',
    'I want a boxing movie',
    'what boxing movie should I watch?',
    'a good boxing movie',
    'two boxing movies',
    'a thriller but nothing supernatural',
    'something smart but not slow',
    'a romantic comedy for my wife',
  ];
  for (const q of LIVE) {
    it(`"${q}" routes to the canonical Ask door`, () => {
      const r = canonicalRequestRoute(q);
      expect(r.kind, `"${q}" fell through to taste — the generic-feed defect`).toBe('request');
      if (r.kind !== 'request') return;
      expect(r.href).toBe(askHref(q));
      expect(new URL(r.href, 'http://x').pathname).toBe('/app/ask');
      expect(new URL(r.href, 'http://x').searchParams.get('q')).toBe(q);
    });
  }

  it('THE CONTRAST: the durable statements stay taste', () => {
    for (const q of [
      'I love boxing movies',
      'I love slow burns but I hate gore.',
      'I like courtroom dramas',
      "I don't like dumb comedies",
      'My wife likes comedies',
      'I used to like slashers but not anymore',
    ]) {
      expect(isTitleRequest(q), `"${q}" was hijacked into a search`).toBe(false);
    }
  });

  it('a bare media noun is a category, not a request', () => {
    for (const q of ['Movies', 'movies', 'tv', 'the movies']) {
      expect(isTitleRequest(q), q).toBe(false);
    }
  });
});

describe('controls — ordinary navigation is not hijacked', () => {
  it('a plain Watch Now navigation stays a navigation', () => {
    expect(isTitleRequest('Open Watch Now')).toBe(false);
    expect(isTitleRequest('watch now')).toBe(false);
  });

  it('an exact title lookup is not a recommendation request', () => {
    for (const t of ['The Godfather', 'Breaking Bad', 'Cold Case', 'Rocky']) {
      expect(isTitleRequest(t), t).toBe(false);
    }
  });

  it('a structured browse action is not a recommendation request', () => {
    // What the Browse tab's own controls express — a media type and a service,
    // never prose. These must keep using /api/browse.
    expect(isTitleRequest('tv')).toBe(false);
    expect(isTitleRequest('Netflix')).toBe(false);
  });
});
