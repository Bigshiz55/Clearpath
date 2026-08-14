import { describe, it, expect, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import {
  TMDB_GENRE,
  TMDB_PERSON,
  describeQuery,
  hasCastId,
  hasGenreId,
  maxRuntimeIs,
  mediaTypeIs,
  requestedCount,
  subjectIs,
} from './receipt.mjs';
import { FACT, castFact, foldFacts, genreFact, resolvePersonId, subjectFact } from './world.mjs';

/**
 * WHY THE RECEIPT IS READ AS DATA AND NOT AS TEXT.
 *
 * The gate reported `thriller is requested` as a SEMANTIC failure against a
 * route that had understood the request perfectly: it had encoded it as
 * `genreIds: [53]`, and TMDB genre 53 IS Thriller. The assertion was a regex
 * for the word.
 *
 * The obvious repair — match `/\b53\b/` instead — trades a false RED for a
 * false GREEN, and the tests below are what make that concrete rather than
 * theoretical. Once the response is flattened to a string, `53` is also
 * `minImdb: 5.3`, a 53-minute runtime, `sinceMonths: 53`, a person id with 53
 * in it, and the year 1953 in a title. Every one of those would have "proved"
 * the genre.
 *
 * So the claim is made at the path: TMDB Thriller genre id 53 is present in
 * query.genreIds.
 */

const NEGATION_RESPONSE = {
  query: { mediaType: 'any', genreIds: [TMDB_GENRE.THRILLER], excludeGenreIds: [], maxRuntime: null, minImdb: null },
  interpretation: [],
  items: [],
};

describe('the executable receipt is asserted at its path', () => {
  it('proves the genre by id, in the field that carries it', () => {
    expect(hasGenreId(NEGATION_RESPONSE, TMDB_GENRE.THRILLER)).toBe(true);
    expect(hasGenreId(NEGATION_RESPONSE, TMDB_GENRE.DOCUMENTARY)).toBe(false);
  });

  it('THE FALSE POSITIVE: 53 anywhere else in the response proves nothing', () => {
    // Every one of these flattens to a string containing "53" and would be
    // matched by /\b53\b/ over the whole document. None of them is a thriller.
    const impostors = [
      { label: 'a 53-minute runtime cap', body: { query: { genreIds: [], maxRuntime: 53 } } },
      { label: 'a 53-month recency window', body: { query: { genreIds: [], sinceMonths: 53 } } },
      { label: 'an audience floor of 53', body: { query: { genreIds: [], minAudience: 53 } } },
      { label: 'PERSON id 53, not genre 53', body: { query: { genreIds: [], castIds: [53] } } },
      { label: 'genre 53 in the EXCLUDE list — the opposite meaning', body: { query: { genreIds: [], excludeGenreIds: [53] } } },
      { label: 'a returned item whose id is 53', body: { query: { genreIds: [] }, items: [{ id: 53, title: 'Shane' }] } },
      { label: 'a returned item that IS a thriller', body: { query: { genreIds: [] }, items: [{ id: 8, title: 'Se7en', genreIds: [53] }] } },
    ];

    for (const { label, body } of impostors) {
      // The naive oracle would have said yes to every one of these…
      expect(/\b53\b/.test(JSON.stringify(body)), `${label}: the text oracle matches`).toBe(true);
      // …and the structured one says no, because none of them is the claim.
      expect(hasGenreId(body, TMDB_GENRE.THRILLER), label).toBe(false);
    }
  });

  it('a thriller in the RESULTS never satisfies a claim about the REQUEST', () => {
    // The distinction the whole gate rests on: what was asked for is not what
    // came back, and a receipt assertion that reads the results has stopped
    // being a receipt assertion.
    const body = { query: { genreIds: [] }, items: [{ id: 8, title: 'Se7en', genreIds: [TMDB_GENRE.THRILLER] }] };
    expect(hasGenreId(body, TMDB_GENRE.THRILLER)).toBe(false);
  });

  it('demands the real shape — a scalar or a string is a contract change', () => {
    expect(hasGenreId({ query: { genreIds: 53 } }, 53)).toBe(false);
    expect(hasGenreId({ query: { genreIds: ['53'] } }, 53)).toBe(false);
    expect(hasGenreId({ query: {} }, 53)).toBe(false);
    expect(hasGenreId({}, 53)).toBe(false);
    expect(hasGenreId(null, 53)).toBe(false);
  });

  it('reads the field as written, never a lowercased copy of it', () => {
    // `genreids` is what a stringified-and-lowercased response looks like. It
    // is not the contract, and accepting it would hide the day it changes.
    expect(hasGenreId({ query: { genreids: [53] } }, 53)).toBe(false);
  });

  it('proves the person by resolved id, not by a name in the text', () => {
    expect(hasCastId({ query: { castIds: [TMDB_PERSON.SYLVESTER_STALLONE] } }, TMDB_PERSON.SYLVESTER_STALLONE)).toBe(true);
    // The name in free text, with no resolved constraint, is not the claim.
    expect(hasCastId({ query: {}, interpretation: ['Sylvester Stallone'] }, TMDB_PERSON.SYLVESTER_STALLONE)).toBe(false);
  });

  it('media type, runtime and count are exact', () => {
    expect(mediaTypeIs({ query: { mediaType: 'movie' } }, 'movie')).toBe(true);
    expect(mediaTypeIs({ query: { mediaType: 'any' } }, 'movie')).toBe(false);
    expect(maxRuntimeIs({ query: { maxRuntime: 100 } }, 100)).toBe(true);
    expect(maxRuntimeIs({ query: { maxRuntime: null } }, 100)).toBe(false);
    expect(requestedCount({ diagnostics: { requestedCount: 1 } })).toBe(1);
    expect(requestedCount({ items: [1, 2, 3] })).toBeNull();
  });

  it('a subject is read from the subject fields, not from the results', () => {
    expect(subjectIs({ query: { subjectCanonical: 'boxing' } }, 'boxing')).toBe(true);
    expect(subjectIs({ query: { subjectLexemes: ['boxing', 'boxer'] } }, 'boxing')).toBe(true);
    expect(subjectIs({ query: { subjectLabel: 'Boxing' } }, 'boxing')).toBe(true);
    // A boxing film in the answer is not a boxing constraint in the request.
    expect(subjectIs({ query: {}, items: [{ title: 'Boxing Day' }] }, 'boxing')).toBe(false);
  });

  it('describes only the canonical fields when something fails', () => {
    const described = describeQuery({ query: { mediaType: 'any', genreIds: [53], secretish: 'do-not-print' } });
    expect(described).toContain('"genreIds":[53]');
    expect(described).not.toContain('secretish');
  });
});

/**
 * THE WORLD LAYER. A result existing is not evidence that it satisfies the
 * request, and until now that is all the gate checked.
 */
const servers: Server[] = [];
async function listen(server: Server): Promise<string> {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (typeof addr === 'string' || addr === null) throw new Error('no port');
  return `http://127.0.0.1:${addr.port}`;
}
afterAll(() => {
  for (const s of servers) s.close();
});

/** A stand-in for the deployment's own evidence routes. */
function evidenceRoutes(genresById: Record<number, string[]>, castByTitle: Record<string, { id: number; name: string }[]>) {
  return createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    res.setHeader('content-type', 'application/json');
    if (url.pathname === '/api/title-meta') {
      const id = Number(url.searchParams.get('id'));
      const genres = genresById[id];
      res.end(JSON.stringify(genres ? { meta: { genres } } : { meta: null }));
      return;
    }
    if (url.pathname === '/api/person-search') {
      const q = url.searchParams.get('q') ?? '';
      const played = q.match(/^who played (.+)$/i);
      if (played) {
        res.end(JSON.stringify({ people: castByTitle[played[1]!] ?? [] }));
        return;
      }
      res.end(JSON.stringify({ people: q === 'Sylvester Stallone' ? [{ id: TMDB_PERSON.SYLVESTER_STALLONE, name: 'Sylvester Stallone' }] : [] }));
      return;
    }
    res.statusCode = 404;
    res.end('{}');
  });
}

describe('the world layer proves the world', () => {
  it('a subject is proven from the product’s own eligibility verdict', () => {
    const eligible = {
      title: 'A Fight Picture',
      subjectEvidence: { constraint: 'boxing', satisfied: true, status: 'PASS', centrality: 'CENTRAL', confidence: 0.9, decidedBy: 'deterministic' },
    };
    expect(subjectFact(eligible, 'boxing').verdict).toBe(FACT.PROVEN);
  });

  it('a candidate judged against a DIFFERENT subject is refuted, not accepted', () => {
    const wrong = { title: 'Some Film', subjectEvidence: { constraint: 'baseball', satisfied: true, status: 'PASS', centrality: 'CENTRAL', confidence: 1 } };
    const fact = subjectFact(wrong, 'boxing');
    expect(fact.verdict).toBe(FACT.REFUTED);
    expect(fact.why).toMatch(/judged against "baseball"/);
  });

  it('no evidence is UNPROVABLE — never a silent pass', () => {
    expect(subjectFact({ title: 'Bare Item' }, 'boxing').verdict).toBe(FACT.UNPROVABLE);
  });

  it('never reads meaning out of a title string', () => {
    // The one shortcut that would make everything easy and everything worthless.
    const suggestive = { title: 'Raging Bull: A Boxing Story' };
    expect(subjectFact(suggestive, 'boxing').verdict).toBe(FACT.UNPROVABLE);
  });

  it('proves a genre from real metadata, and refutes a wrong one', async () => {
    const base = await listen(evidenceRoutes({ 11: ['Thriller', 'Crime'], 12: ['Romance', 'Comedy'] }, {}));
    expect((await genreFact(base, {}, { id: 11, mediaType: 'movie', title: 'A' }, 'Thriller')).verdict).toBe(FACT.PROVEN);

    const wrong = await genreFact(base, {}, { id: 12, mediaType: 'movie', title: 'B' }, 'Thriller');
    expect(wrong.verdict).toBe(FACT.REFUTED);
    expect(wrong.why).toMatch(/Romance, Comedy/);

    // A title the metadata route cannot answer for is unprovable, not false.
    expect((await genreFact(base, {}, { id: 99, mediaType: 'movie', title: 'C' }, 'Thriller')).verdict).toBe(FACT.UNPROVABLE);
  });

  it('proves cast membership by person id, and will not disprove it from top billing', async () => {
    const base = await listen(evidenceRoutes({}, {
      Rocky: [{ id: TMDB_PERSON.SYLVESTER_STALLONE, name: 'Sylvester Stallone' }],
      Casablanca: [{ id: 4110, name: 'Humphrey Bogart' }],
    }));

    expect(await resolvePersonId(base, {}, 'Sylvester Stallone')).toBe(TMDB_PERSON.SYLVESTER_STALLONE);

    const hit = await castFact(base, {}, { id: 1, mediaType: 'movie', title: 'Rocky' }, TMDB_PERSON.SYLVESTER_STALLONE, 'Sylvester Stallone');
    expect(hit.verdict).toBe(FACT.PROVEN);

    // Absent from the TOP-BILLED four is not proof of absence from the film.
    // Claiming otherwise would be the oracle inventing a fact it does not hold.
    const miss = await castFact(base, {}, { id: 2, mediaType: 'movie', title: 'Casablanca' }, TMDB_PERSON.SYLVESTER_STALLONE, 'Sylvester Stallone');
    expect(miss.verdict).toBe(FACT.UNPROVABLE);
    expect(miss.why).toMatch(/cannot disprove/);
  });

  it('ALL-UNPROVABLE fails: a world layer that proved nothing is the bug', () => {
    const nothing = foldFacts([{ verdict: FACT.UNPROVABLE, why: 'no evidence' }, { verdict: FACT.UNPROVABLE, why: 'no evidence' }]);
    expect(nothing.ok).toBe(false);

    const oneBad = foldFacts([{ verdict: FACT.PROVEN, why: 'ok' }, { verdict: FACT.REFUTED, why: 'not a thriller' }]);
    expect(oneBad.ok).toBe(false);
    expect(oneBad.detail).toMatch(/REFUTED/);

    const good = foldFacts([{ verdict: FACT.PROVEN, why: 'ok' }, { verdict: FACT.UNPROVABLE, why: 'no evidence' }]);
    expect(good.ok).toBe(true);
    expect(good.detail).toBe('1 proven, 1 unprovable');
  });
});
