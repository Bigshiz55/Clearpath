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
 * defect is that two consumers read the same words with neither aware of the
 * other, so the invariant is structural:
 *
 *   Language already consumed as a RESOLVED ENTITY may not be reinterpreted
 *   as a generic content subject.
 *
 * And the inverse must keep working, which is why "disable subject detection
 * whenever castIds exists" is also wrong: "a Tom Hanks courtroom movie" means
 * person Hanks AND subject courtroom. Only the occurrence where the person was
 * actually named is consumed; the rest of the sentence still speaks.
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
import { maskConsumedEntities } from '@/lib/nlu/consumedEntities';
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
      consumedEntities: [{ spokenAs: 'watched yesterday stallone', resolvedName: 'Sylvester Stallone' }],
    });
    // Never in dispute — stated so a future change that drops the cast filter
    // to fix the subject collision fails here instead of passing quietly.
    expect(query.castIds).toEqual([16483]);
  });

  it('RED — "Stallone" must NOT become a strict content subject', async () => {
    const { query, requirement } = await applyRequiredSubject(
      { ...AFTER_PERSON_RESOLUTION },
      STALLONE_ASK,
      { consumedEntities: [{ spokenAs: 'watched yesterday stallone', resolvedName: 'Sylvester Stallone' }] },
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
        { consumedEntities: [{ spokenAs: person, resolvedName: person }] },
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
      { consumedEntities: [{ spokenAs: 'tom hanks courtroom', resolvedName: 'Tom Hanks' }] },
    );
    expect(query.castIds).toEqual([31]);
    expect(query.subjectCanonical).toBe('courtroom');
    expect(query.subjectLexemes ?? []).not.toContain('hanks');
  });

  it('"a Stallone boxing movie" means person Stallone AND subject boxing', async () => {
    const { query } = await applyRequiredSubject(
      { ...AFTER_PERSON_RESOLUTION },
      'a Stallone boxing movie',
      { consumedEntities: [{ spokenAs: 'stallone boxing', resolvedName: 'Sylvester Stallone' }] },
    );
    expect(query.castIds).toEqual([16483]);
    expect(query.subjectCanonical).toBe('boxing');
    expect(query.subjectKeywordIds).toEqual([1234, 5678]);
    expect(query.subjectLexemes ?? []).not.toContain('stallone');
  });

  it('with no consumed entity nothing changes — the boundary is opt-in', async () => {
    // A caller that resolved no entity passes nothing and must behave exactly
    // as before, or the fix has widened past its own defect.
    const { query } = await applyRequiredSubject({ ...EMPTY_QUERY, mediaType: 'movie' }, 'a boxing movie');
    expect(query.subjectCanonical).toBe('boxing');
    expect(query.subjectKeywordIds).toEqual([1234, 5678]);
  });
});

describe('REVIEW BLOCKER — the mask must spend an OCCURRENCE, not a vocabulary', () => {
  beforeEach(() => vi.clearAllMocks());

  /* The first implementation tokenised the resolved name and deleted every
     occurrence of every token across the whole utterance. That is broader than
     the invariant, which is about the particular words that earned the entity —
     and it is narrower than the invariant too, because the catalog's spelling
     is not always the user's. Both directions are wrong, and each has a
     regression below. */

  it('RED 1 — a fuzzily-spelled person still becomes a subject', async () => {
    // The resolver promises fuzzy identity: "Stalone" resolves to Sylvester
    // Stallone. Masking the CATALOG spelling leaves the USER's spelling behind,
    // so the misspelling walks straight into detectGeneralSubject.
    const { query, requirement } = await applyRequiredSubject(
      { ...EMPTY_QUERY, mediaType: 'movie', castIds: [16483] },
      'give me a Sylvester Stalone movie',
      { consumedEntities: [{ spokenAs: 'Sylvester Stalone', resolvedName: 'Sylvester Stallone' }] },
    );
    expect(query.subjectCanonical).toBeUndefined();
    expect(query.subjectLexemes ?? []).not.toContain('stalone');
    expect(query.subjectLexemes ?? []).not.toContain('stallone');
    expect(query.castIds).toEqual([16483]);
    expect(query.mediaType).toBe('movie');
    expect(requirement).toBeNull();
  });

  it('RED 2 — a word that merely appears in the name is erased everywhere', async () => {
    /* "Tom Cruise" spends `cruise` ONCE. The second `cruise` is the content
       subject the user asked for, and a vocabulary-wide delete eats it: the
       subject collapses from "cruise ship" to "ship". Nothing about a stop-word
       list or a longer name list reaches this — the token is legitimate in one
       position and consumed in the other. */
    const { query } = await applyRequiredSubject(
      { ...EMPTY_QUERY, mediaType: 'movie', castIds: [500] },
      'a Tom Cruise cruise ship movie',
      { consumedEntities: [{ spokenAs: 'Tom Cruise cruise ship', resolvedName: 'Tom Cruise' }] },
    );
    expect(query.castIds).toEqual([500]);
    expect(query.subjectCanonical).toBe('cruise ship');
  });

  it('the anecdote residue the legacy extractor attributes is NOT name-like, so it survives', async () => {
    /* The legacy extractor hands "watched yesterday stallone" to the catalog —
       it cannot tell which of those words is the name. Only tokens that match
       the RESOLVED IDENTITY are spent, so the residue is left exactly where it
       was. That defect stays visible rather than being papered over here; it is
       not this PR's to fix. */
    const masked = maskConsumedEntities('I watched 3 movies yesterday. Give me a Stallone movie.', [
      { spokenAs: 'watched yesterday stallone', resolvedName: 'Sylvester Stallone' },
    ]);
    expect(masked).toMatch(/watched/);
    expect(masked).toMatch(/yesterday/);
    expect(masked).not.toMatch(/stallone/i);
  });
});

describe('REVIEW BLOCKER — the entity owns an OCCURRENCE, not the first match', () => {
  beforeEach(() => vi.clearAllMocks());

  /* `a Tom Cruise cruise ship movie` only proves person-first ordering: the
     person is named before the repeated content word, so taking the first match
     happens to be right. Reverse the order and first-match spends the wrong
     one — measured on the previous implementation:

       masked           "  ships sound fun. Give me a   Cruise movie."
       subjectCanonical "cruise"

     The `cruise` of "Cruise ships" was eaten and the ACTOR's `cruise` survived
     next to `movie`, which is the original defect arriving from the other side.
     Together the two directions pin ownership rather than ordering. */

  const REVERSED = 'Cruise ships sound fun. Give me a Tom Cruise movie.';
  const CRUISE = [{ spokenAs: 'Tom Cruise', resolvedName: 'Tom Cruise' }];

  it('RED — the mask keeps the earlier content word and spends the later name', () => {
    const masked = maskConsumedEntities(REVERSED, CRUISE);
    // The sentence the user opened with is theirs and survives intact.
    expect(masked).toMatch(/cruise ships/i);
    // The person they actually asked for is gone — including the `Cruise` that
    // was sitting next to `movie`, which is the one that could become a subject.
    expect(masked).not.toMatch(/tom/i);
    expect(masked).not.toMatch(/cruise\s+movie/i);
  });

  it('RED — and no subject survives to reach the finder', async () => {
    // Asserted through applyRequiredSubject, not just the string, so the
    // failure cannot hide behind a mask that looks plausible.
    const { query, requirement } = await applyRequiredSubject(
      { ...EMPTY_QUERY, mediaType: 'movie', castIds: [500] },
      REVERSED,
      { consumedEntities: CRUISE },
    );
    expect(query.castIds).toEqual([500]);
    expect(query.subjectCanonical).toBeUndefined();
    expect(query.subjectLexemes ?? []).not.toContain('cruise');
    expect(requirement).toBeNull();
  });
});

describe('the mask spends only what was actually claimed', () => {
  it('removes the spoken surname when the catalog answered with a full name', () => {
    const out = maskConsumedEntities('give me a Stallone movie', [
      { spokenAs: 'stallone', resolvedName: 'Sylvester Stallone' },
    ]);
    expect(out).not.toMatch(/stallone/i);
  });

  it('leaves the rest of the sentence intact', () => {
    const out = maskConsumedEntities('a Tom Hanks courtroom movie', [
      { spokenAs: 'tom hanks courtroom', resolvedName: 'Tom Hanks' },
    ]);
    expect(out).toMatch(/courtroom/);
    expect(out).toMatch(/movie/);
    expect(out).not.toMatch(/hanks/i);
  });

  it('whole words only — a resolved "Hunt" cannot hollow out "manhunt"', () => {
    const out = maskConsumedEntities('a manhunt movie', [
      { spokenAs: 'manhunt', resolvedName: 'Helen Hunt' },
    ]);
    expect(out).toMatch(/manhunt/);
  });

  it('particles are too short to spend', () => {
    // Removing "de" as a whole word would eat ordinary language and can never
    // be the content noun the walk-back is looking for.
    const out = maskConsumedEntities('a de facto standard movie', [
      { spokenAs: 'de facto standard', resolvedName: 'Robert De Niro' },
    ]);
    expect(out).toMatch(/\bde\b/);
  });

  it('a word the extractor never attributed is never spent', () => {
    // `cruise` is in the resolved name, but this utterance never offered it to
    // the resolver, so the mask has no claim on it.
    const out = maskConsumedEntities('a cruise ship movie', [
      { spokenAs: 'tom hanks', resolvedName: 'Tom Cruise' },
    ]);
    expect(out).toMatch(/cruise ship/);
  });

  it('no entities is the identity function', () => {
    expect(maskConsumedEntities('a boxing movie', [])).toBe('a boxing movie');
    expect(maskConsumedEntities('a boxing movie', undefined)).toBe('a boxing movie');
  });
});
