/**
 * A RESOLVED PERSON IS NOT A CONTENT SUBJECT.
 *
 * Live evidence from the deployed preview, 2026-08-14:
 *
 *   "I watched 3 movies yesterday. Give me a Stallone movie."
 *     → mediaType movie, castIds [16483]   (Sylvester Stallone, correctly resolved)
 *     → items []
 *
 * The person constraint survived all the way to the query. The zero happens
 * downstream, and this file pins where.
 *
 * THE COLLISION. `detectGeneralSubject` recognises the shape
 * `<content noun> + <media noun>` — the thing that makes "a courtroom movie"
 * mean courtroom. It walks back from `movie` collecting content tokens, and in
 * "a Stallone movie" the token it finds is `stallone`. So the same language is
 * consumed TWICE: once by person resolution, which turned it into a cast id,
 * and again by subject detection, which turns it into a strict semantic
 * subject. The query then carries two constraints that cannot both hold —
 *
 *   cast    = Sylvester Stallone
 *   subject = "stallone", STRICT (the finder demands CENTRAL)
 *
 * — because a performer's surname is not what their films are ABOUT. Rocky is
 * about boxing; the word "Stallone" appears in no title, overview or keyword
 * tag. Every legitimate candidate is therefore rejected on subject centrality,
 * and the honest-shortfall path returns nothing rather than padding. The
 * product did exactly what it was told. It was told something contradictory.
 *
 * WHY THIS IS NOT A VOCABULARY BUG. Adding `stallone` to `NON_SUBJECT` fixes
 * one actor. The list would need every performer who has ever been asked for by
 * surname, and would still be wrong the day someone says "a Hunt movie". The
 * defect is that two consumers read the same span with neither aware of the
 * other, so the invariant is structural:
 *
 *   Language already consumed as a RESOLVED ENTITY may not be reinterpreted
 *   as a generic content subject.
 *
 * And the inverse must keep working, which is why "disable subject detection
 * whenever castIds exists" is also wrong: "a Tom Hanks courtroom movie" means
 * person Hanks AND subject courtroom. Only the person's OWN span is consumed;
 * the rest of the sentence still speaks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// The single I/O call in this path, mocked exactly as finderSubject.test.ts
// does. Subject lexemes that are real catalog subjects resolve to keyword ids;
// a performer's surname resolves to nothing, which is itself part of the story.
vi.mock('@/lib/tmdb/client', () => ({
  searchKeywords: vi.fn(async (terms: string[]) => {
    if (terms.some((t) => /box|prizefight/i.test(t))) return [1234, 5678];
    if (terms.some((t) => /courtroom|trial|legal/i.test(t))) return [4321];
    return [];
  }),
}));

import { applyRequiredSubject } from './finderSubject';
import { EMPTY_QUERY } from './finderParse';
import { evaluateSubjectCentrality } from '@/lib/nlu/semanticEligibility';
import { maskConsumedSpans } from '@/lib/nlu/consumedSpans';
import type { FinderQuery } from './finder';

/** The query as /api/ask builds it BEFORE applyRequiredSubject: the person is
 *  already resolved, exactly as the live run showed. */
const AFTER_PERSON_RESOLUTION: FinderQuery = {
  ...EMPTY_QUERY,
  mediaType: 'movie',
  castIds: [16483], // Sylvester Stallone
};

const STALLONE_ASK = 'I watched 3 movies yesterday. Give me a Stallone movie.';

describe('the live zero: a resolved person must not become a strict subject', () => {
  beforeEach(() => vi.clearAllMocks());

  it('RED — the person survives subject application', async () => {
    const { query } = await applyRequiredSubject({ ...AFTER_PERSON_RESOLUTION }, STALLONE_ASK, {
      consumedSpans: ['Sylvester Stallone'],
    });
    // Never in dispute — stated so a future change that drops the cast filter
    // to fix the subject collision fails here instead of passing quietly.
    expect(query.castIds).toEqual([16483]);
  });

  it('RED — "Stallone" must NOT become a strict content subject', async () => {
    const { query, requirement } = await applyRequiredSubject(
      { ...AFTER_PERSON_RESOLUTION },
      STALLONE_ASK,
      { consumedSpans: ['Sylvester Stallone'] },
    );
    expect(query.subjectCanonical).toBeUndefined();
    expect(query.subjectStrict).not.toBe(true);
    expect(query.subjectLexemes ?? []).not.toContain('stallone');
    expect(requirement).toBeNull();
  });

  it('the mechanism: a strict "stallone" subject rejects a genuine Stallone film', () => {
    /* This is the step that turns candidates into zero, and it is CORRECT
       behaviour given a wrong requirement. A performer's name is not in the
       text of their films, so the evaluator finds no evidence of centrality and
       a strict subject refuses an unsupported candidate rather than padding.
       Fixture, not fetched: the load-bearing fact is only that the surname
       appears in no title, overview or keyword — true of the entire filmography
       and the whole reason the collision is fatal. */
    const candidate = {
      title: 'Rocky',
      overview:
        'A small-time boxer from Philadelphia gets a once-in-a-lifetime shot at the heavyweight championship.',
      genres: ['Drama'],
      keywords: ['boxing', 'underdog', 'philadelphia'],
    };
    const verdict = evaluateSubjectCentrality(
      { canonical: 'stallone', label: 'Stallone', lexemes: ['stallone'], strict: true },
      candidate,
    );
    expect(verdict.status).not.toBe('PASS');
    expect(verdict.centrality).toBe('UNSUPPORTED');

    /* The SAME candidate under the subject the sentence actually implies has
       real evidence behind it. The asymmetry is the finding — not the tier:
       a one-sentence fixture reads MATERIAL rather than CENTRAL, and tuning the
       overview until it produced a prettier word would be measuring my own
       prose. What matters is that "boxing" is supported and "stallone" is not,
       by a margin the evaluator itself reports. */
    const boxing = evaluateSubjectCentrality(
      { canonical: 'boxing', label: 'Boxing', lexemes: ['boxing', 'boxer'], strict: true },
      candidate,
    );
    expect(boxing.centrality).not.toBe('UNSUPPORTED');
    expect(boxing.confidence).toBeGreaterThan(verdict.confidence);
  });
});

describe('the surname family — none of them is a subject', () => {
  beforeEach(() => vi.clearAllMocks());

  const CASES: Array<{ ask: string; person: string; surname: string }> = [
    { ask: 'Give me a Stallone movie', person: 'Sylvester Stallone', surname: 'stallone' },
    { ask: 'how about a Bruce Willis movie', person: 'Bruce Willis', surname: 'willis' },
    { ask: 'show me a Tom Hanks movie', person: 'Tom Hanks', surname: 'hanks' },
    { ask: 'give me a Sigourney Weaver film', person: 'Sigourney Weaver', surname: 'weaver' },
  ];

  for (const { ask, person, surname } of CASES) {
    it(`"${ask}" → person, not subject "${surname}"`, async () => {
      const { query, requirement } = await applyRequiredSubject(
        { ...EMPTY_QUERY, mediaType: 'movie', castIds: [1] },
        ask,
        { consumedSpans: [person] },
      );
      expect(query.subjectCanonical).not.toBe(surname);
      expect(query.subjectLexemes ?? []).not.toContain(surname);
      expect(requirement?.canonical).not.toBe(surname);
    });
  }
});

describe('the inverse must keep working — only the person is consumed', () => {
  beforeEach(() => vi.clearAllMocks());

  it('"a courtroom movie" still means courtroom (no person at all)', async () => {
    const { query } = await applyRequiredSubject({ ...EMPTY_QUERY, mediaType: 'movie' }, 'a courtroom movie');
    expect(query.subjectCanonical).toBe('courtroom');
    expect(query.subjectStrict).toBe(true);
  });

  it('"a Tom Hanks courtroom movie" means person Hanks AND subject courtroom', async () => {
    const { query } = await applyRequiredSubject(
      { ...EMPTY_QUERY, mediaType: 'movie', castIds: [31] },
      'a Tom Hanks courtroom movie',
      { consumedSpans: ['Tom Hanks'] },
    );
    expect(query.castIds).toEqual([31]);
    expect(query.subjectCanonical).toBe('courtroom');
    expect(query.subjectLexemes ?? []).not.toContain('hanks');
  });

  it('"a Stallone boxing movie" means person Stallone AND subject boxing', async () => {
    const { query } = await applyRequiredSubject(
      { ...AFTER_PERSON_RESOLUTION },
      'a Stallone boxing movie',
      { consumedSpans: ['Sylvester Stallone'] },
    );
    expect(query.castIds).toEqual([16483]);
    expect(query.subjectCanonical).toBe('boxing');
    expect(query.subjectKeywordIds).toEqual([1234, 5678]);
    expect(query.subjectLexemes ?? []).not.toContain('stallone');
  });

  it('with no consumed span nothing changes — the boundary is opt-in', async () => {
    // A caller that resolved no entity passes nothing and must behave exactly
    // as before, or the fix has widened past its own defect.
    const { query } = await applyRequiredSubject({ ...EMPTY_QUERY, mediaType: 'movie' }, 'a boxing movie');
    expect(query.subjectCanonical).toBe('boxing');
    expect(query.subjectKeywordIds).toEqual([1234, 5678]);
  });
});

describe('the mask spends only what was actually claimed', () => {
  it('removes the spoken surname when the catalog answered with a full name', () => {
    expect(maskConsumedSpans('give me a Stallone movie', ['Sylvester Stallone'])).not.toMatch(/stallone/i);
  });

  it('leaves the rest of the sentence intact', () => {
    const out = maskConsumedSpans('a Tom Hanks courtroom movie', ['Tom Hanks']);
    expect(out).toMatch(/courtroom/);
    expect(out).toMatch(/movie/);
    expect(out).not.toMatch(/hanks/i);
  });

  it('whole words only — a resolved "Hunt" cannot hollow out "manhunt"', () => {
    expect(maskConsumedSpans('a manhunt movie', ['Helen Hunt'])).toMatch(/manhunt/);
  });

  it('particles are too short to spend', () => {
    // Removing "de" as a whole word would eat ordinary language and can never
    // be the content noun the walk-back is looking for.
    expect(maskConsumedSpans('a de facto standard movie', ['Robert De Niro'])).toMatch(/\bde\b/);
  });

  it('no spans is the identity function', () => {
    expect(maskConsumedSpans('a boxing movie', [])).toBe('a boxing movie');
    expect(maskConsumedSpans('a boxing movie', undefined)).toBe('a boxing movie');
  });
});
