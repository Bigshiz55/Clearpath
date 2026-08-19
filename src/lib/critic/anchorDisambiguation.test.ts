/**
 * WHICH WORK DOES A BARE NAME REFER TO?
 *
 * TWO DEFECTS, ONE SENTENCE. Deployed, "Which Taken did you mean?" offered the
 * 2017 series ahead of the 2008 film — and "Taken 2008" asked the question at
 * all, while holding the answer in the words the user had typed.
 *
 *   • `AnchorRequest.year` has existed since GC2 and `pickMatch` uses it as a
 *     filter and a tie-break. Nothing ever populated it. The raw span also went
 *     to TMDB as the search text, so "Taken 2008" searched for a title nobody
 *     has ever released.
 *   • Ordering leaned on TMDB popularity, which decays. A running series
 *     outranks the film an unqualified name overwhelmingly means.
 *
 * Neither fix touches identity. `pickMatch` still refuses when the evidence
 * genuinely does not separate two works — the last block below is as important
 * as the first two, because a resolver that always answers is not a resolver.
 */
import { describe, it, expect } from 'vitest';
import { readAnchorSpan } from './anchorSpan';
import { resolveAnchor, type AnchorCandidate } from './anchor';
import { buildCriticState } from './orchestrate';
import { emptyDna } from '@/lib/preference/engine';
import { routeAsk } from './gate';
import { rankOptions } from './clarify';

/* SYNTHETIC CANDIDATES IN TMDB'S SHAPE — the numbers are chosen, not fetched.
   This unit has no network and must not pretend otherwise: what is being tested
   is the ORDERING RULE, so each fixture encodes the situation the rule exists
   for — an older work with a large cumulative audience against a recent one
   with high current popularity. The real vote counts are whatever TMDB says on
   the day; the rule must hold for the shape regardless of the values. */
/** Two works that share a name. */
const TAKEN: AnchorCandidate[] = [
  { id: 8681, mediaType: 'movie', title: 'Taken', year: 2008, audience: 10250, recognisability: 41 },
  { id: 68006, mediaType: 'tv', title: 'Taken', year: 2017, audience: 120, recognisability: 96 },
  { id: 2432, mediaType: 'tv', title: 'Taken', year: 2002, audience: 210, recognisability: 12 },
];

/** The same shape again, with the gap narrowed — the rule must not need a landslide. */
const CARRIE: AnchorCandidate[] = [
  { id: 1, mediaType: 'movie', title: 'Carrie', year: 1976, audience: 4200, recognisability: 18 },
  { id: 2, mediaType: 'movie', title: 'Carrie', year: 2013, audience: 3100, recognisability: 33 },
];

const ask = (spoken: string, requestMedia?: 'movie' | 'tv') => {
  const span = readAnchorSpan(spoken);
  return { span, req: { spokenAs: spoken, matchTitle: span.title, mediaType: span.mediaType ?? requestMedia, year: span.year } };
};

describe('the cues the sentence already carried', () => {
  it('a stated year is read out of the span, and the title searched is the title', () => {
    const s = readAnchorSpan('Taken 2008');
    expect(s.title).toBe('Taken');
    expect(s.year).toBe(2008);
    expect(s.spokenAs, 'the label the user typed survives for the round trip').toBe('Taken 2008');
  });

  it('a stated medium is read out of the frame, both ways round — as an OFFER', () => {
    expect(readAnchorSpan('the Taken movie').framed).toEqual({ title: 'Taken', mediaType: 'movie' });
    expect(readAnchorSpan('the Taken series').framed).toEqual({ title: 'Taken', mediaType: 'tv' });
    expect(readAnchorSpan('the Whiplash film').framed).toEqual({ title: 'Whiplash', mediaType: 'movie' });
  });

  it('a bare name yields no cues at all — nothing is invented', () => {
    expect(readAnchorSpan('Taken')).toMatchObject({ title: 'Taken', year: null, mediaType: null });
    expect(readAnchorSpan('Whiplash')).toMatchObject({ title: 'Whiplash', year: null, mediaType: null });
  });

  it('a frame is OFFERED, never applied — this module has no catalog to ask', () => {
    // "The Movie" is a name, not a frame around one: nothing survives stripping.
    expect(readAnchorSpan('The Movie')).toMatchObject({ title: 'The Movie', framed: null });
    // These two are the SAME SHAPE and mean opposite things. Neither is decided
    // here; both readings are handed to the caller, which asks the catalog.
    expect(readAnchorSpan('the Taken movie')).toMatchObject({
      title: 'the Taken movie',
      framed: { title: 'Taken', mediaType: 'movie' },
    });
    expect(readAnchorSpan('The Truman Show')).toMatchObject({
      title: 'The Truman Show',
      framed: { title: 'Truman', mediaType: 'tv' },
    });
  });
});

/**
 * THE DECISION LIVES WHERE THE CATALOG DOES.
 *
 * These used to call `resolveAnchor` on a hand-built request, which proved the
 * resolver and skipped the step that actually chooses between two readings of
 * the same shape. The Vercel review caught what that hid: "The Truman Show" is
 * "the Taken movie" word for word — article, name, medium noun — so eager
 * stripping searched for "Truman" under a hard `tv` filter and resolved
 * nothing. "Scary Movie" and "Silent Movie" fail identically.
 *
 * So the frame is now decided on catalog evidence in `buildCriticState`, and
 * that is what these exercise: a stub `searchCandidates` stands in for TMDB and
 * records which strings were actually searched.
 */
describe('an explicit cue RESOLVES instead of asking', () => {
  /** A stub catalog that answers by title, and remembers what it was asked. */
  const catalog = (rows: AnchorCandidate[]) => {
    const asked: string[] = [];
    const search = async (name: string) => {
      asked.push(name);
      const n = name.trim().toLowerCase();
      return rows.filter((r) => r.title.toLowerCase() === n);
    };
    return { asked, search };
  };

  const TRUMAN: AnchorCandidate[] = [
    { id: 37165, mediaType: 'movie', title: 'The Truman Show', year: 1998, audience: 12000, recognisability: 40 },
  ];

  /* The request comes from the real router, not from a hand-built object —
     `routeAsk` is what production uses and it is what decides that these
     sentences carry a comparison at all. */
  const resolveVia = async (sentence: string, rows: AnchorCandidate[]) => {
    const c = catalog(rows);
    const decision = routeAsk(sentence, 'legacy');
    const state = await buildCriticState({
      request: decision.request!,
      dna: emptyDna(),
      hard: { mediaType: 'any' },
      searchCandidates: c.search,
      loadDimensions: async () => new Map(),
    });
    return { state, asked: c.asked };
  };

  it('a stated year picks the work without a question', () => {
    const { req } = ask('Taken 2008');
    const r = resolveAnchor(req, TAKEN);
    expect(r.status).toBe('resolved');
    if (r.status === 'resolved') expect(r.anchor.tmdbId).toBe(8681);
  });

  it('"the Taken movie" picks the film — the frame is adopted when the literal reading is not in the catalog', async () => {
    const { state, asked } = await resolveVia('something darker than the Taken movie', TAKEN);
    expect(asked, 'the literal reading must be tried first').toEqual(['the Taken movie', 'Taken']);
    const r = state.resolutions[0]!;
    expect(r.status).toBe('resolved');
    if (r.status === 'resolved') {
      expect(r.anchor.mediaType).toBe('movie');
      expect(r.anchor.tmdbId).toBe(8681);
    }
  });

  it('a REAL title of the same shape is left alone — the defect the review caught', async () => {
    const { state, asked } = await resolveVia('something darker than The Truman Show', TRUMAN);
    expect(asked, 'the catalog answered the literal reading, so no reframing').toEqual(['The Truman Show']);
    const r = state.resolutions[0]!;
    expect(r.status, 'the real title was truncated to "Truman" under a tv filter').toBe('resolved');
    if (r.status === 'resolved') expect(r.anchor.tmdbId).toBe(37165);
  });

  it('an explicit year that matches nothing does not invent a match', () => {
    const { req } = ask('Taken 1994');
    const r = resolveAnchor(req, TAKEN);
    expect(r.status).not.toBe('resolved');
  });

  it('the span-local medium still narrows the question, not the answer', () => {
    // Two series share the name, so the honest outcome is a question — but a
    // question about television only.
    const span = readAnchorSpan('the Taken series');
    const r = resolveAnchor(
      { spokenAs: 'the Taken series', matchTitle: span.framed!.title, mediaType: span.framed!.mediaType },
      TAKEN,
    );
    expect(r.status).toBe('ambiguous');
    if (r.status === 'ambiguous') {
      expect(r.options.every((o) => o.mediaType === 'tv')).toBe(true);
      expect(r.options).toHaveLength(2);
    }
  });
});

describe('when the evidence genuinely does not separate them, the order is honest', () => {
  it('the best-known work leads, and popularity does not overturn it', () => {
    const ranked = rankOptions(
      TAKEN.map((c) => ({ tmdbId: c.id, title: c.title, mediaType: c.mediaType, year: c.year, audience: c.audience, recognisability: c.recognisability })),
    );
    expect(ranked[0]!.tmdbId, 'the 2017 series outranked the 2008 film again').toBe(8681);
    expect(ranked.map((o) => o.tmdbId)).toEqual([8681, 2432, 68006]);
  });

  it('older and famous beats newer and obscure', () => {
    const ranked = rankOptions(
      CARRIE.map((c) => ({ tmdbId: c.id, title: c.title, mediaType: c.mediaType, year: c.year, audience: c.audience, recognisability: c.recognisability })),
    );
    expect(ranked[0]!.year).toBe(1976);
  });

  it('with no audience evidence it falls back to popularity, then to the newest', () => {
    const ranked = rankOptions([
      { tmdbId: 1, title: 'X', mediaType: 'movie', year: 1999, recognisability: 5 },
      { tmdbId: 2, title: 'X', mediaType: 'movie', year: 2020, recognisability: 50 },
      { tmdbId: 3, title: 'X', mediaType: 'movie', year: 2024 },
    ]);
    expect(ranked.map((o) => o.tmdbId)).toEqual([2, 1, 3]);
  });

  it('every option is still offered — ordering a question is not answering it', () => {
    const ranked = rankOptions(
      TAKEN.map((c) => ({ tmdbId: c.id, title: c.title, mediaType: c.mediaType, year: c.year, audience: c.audience })),
    );
    expect(ranked).toHaveLength(TAKEN.length);
  });

  it('a genuinely ambiguous bare name still ASKS rather than picking the best known', () => {
    const { req } = ask('Taken');
    const r = resolveAnchor(req, TAKEN);
    expect(r.status, 'audience evidence must never decide identity').toBe('ambiguous');
  });

  it('and a name only one work has resolves with no question at all', () => {
    const { req } = ask('Whiplash');
    const r = resolveAnchor(req, [
      { id: 244786, mediaType: 'movie', title: 'Whiplash', year: 2014, audience: 14000 },
    ]);
    expect(r.status).toBe('resolved');
  });

  it('a name nothing shares is not found, rather than nearly matched', () => {
    const { req } = ask('Furious');
    const r = resolveAnchor(req, [
      { id: 9, mediaType: 'movie', title: 'Furious 7', year: 2015, audience: 9000 },
    ]);
    expect(r.status).toBe('not_found');
  });
});
