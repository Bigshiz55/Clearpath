import { describe, it, expect } from 'vitest';
import { interpret } from '@/lib/interpret/interpret';
import { intentToQuery } from '@/lib/ask/canonicalExecution';

/**
 * TWO DEFECTS THE DEPLOYED PROOF SURFACED, PINNED AT THEIR SOURCE.
 *
 * Both were found by asking a real deployment three ordinary questions and
 * reading what came back. Both are interpreter defects, not ranking defects —
 * Taste DNA behaved correctly on top of a request that had already lost its
 * meaning.
 *
 * ── A · A BROAD GENRE REQUEST ANSWERED WITH EXACTLY ONE TITLE ─────────────
 * "Looking for a good thriller" returned a single film. `parseCount` reads
 * `a`/`an` as the numeral one, which is right when the user names a unit of
 * media ("give me a boxing MOVIE" does ask for one) and wrong when the head
 * noun is a bare genre. "A good thriller" is how English refers to the
 * CATEGORY; it enumerates nothing, and answering it with one title leaves
 * nothing to rank and nothing to personalize.
 *
 * ── B · AN ABOUTNESS REQUEST THAT BOUND NO SUBJECT ────────────────────────
 * "movies about chess" returned Spider-Man, Avengers and Toy Story 5.
 * `findSubjectMatches` only understood the PRE-nominal form ("chess movies"),
 * so the post-nominal "movies ABOUT chess" produced no subject at all. With
 * `subjects: []` the route never sets `subjectStrict`, the aboutness gate
 * never runs, and the request decays into generic popularity.
 *
 * Neither fix names a genre or a topic. The first asks what KIND of noun the
 * article modifies; the second adds a grammatical construction.
 */

describe('A · a bare genre head is a category, not a count of one', () => {
  it('"Looking for a good thriller" states NO count', () => {
    expect(interpret('Looking for a good thriller').requestedCount).toBeNull();
  });

  it('and therefore caps nothing downstream', () => {
    const mapped = intentToQuery(interpret('Looking for a good thriller') as never);
    expect(mapped.query.finalCount ?? null, 'a browse request must not be capped to one').toBeNull();
    // The genre itself must survive — this is a fix to counting, not to genres.
    expect(mapped.query.genreIds).toContain(53);
  });

  it('generalises across genres and phrasings, with no genre named in the fix', () => {
    for (const q of [
      'Looking for a good thriller',
      'I want a good comedy',
      'in the mood for a drama',
      'can you suggest a mystery',
      'looking for an entertaining mystery',
    ]) {
      expect(interpret(q).requestedCount, q).toBeNull();
    }
  });

  it('STILL counts one when the user names a unit of media', () => {
    // The pinned contract. An article on a media noun is a real count.
    expect(interpret('Give me a boxing movie.').requestedCount).toBe(1);
    expect(interpret('Show me a boxing movie').requestedCount).toBe(1);
    expect(interpret('how about a Bruce Willis movie').requestedCount).toBe(1);
  });

  it('STILL counts explicit numerals, including on a genre head', () => {
    expect(interpret('three Sylvester Stallone movies').requestedCount).toBe(3);
    expect(interpret('give me 5 thrillers').requestedCount).toBe(5);
    expect(interpret('two comedies please').requestedCount).toBe(2);
    expect(interpret('a couple of horror movies').requestedCount).toBe(2);
  });
});

describe('B · "movies about X" binds X as a required subject', () => {
  it('"movies about chess" extracts chess as the subject', () => {
    const i = interpret('movies about chess');
    expect(i.subjects.map((s) => s.span)).toContain('chess');
    expect(i.subjects.every((s) => s.wanted)).toBe(true);
  });

  it('the subject reaches execution, which is what arms the aboutness gate', () => {
    const mapped = intentToQuery(interpret('movies about chess') as never);
    // `requiredSubjects` is what the route turns into subjectStrict +
    // subjectLexemes; empty here is exactly how Spider-Man got through.
    expect(mapped.pending.requiredSubjects).toContain('chess');
  });

  it('generalises across unrelated domains — no topic vocabulary in the fix', () => {
    const cases: Array<[string, string]> = [
      ['movies about surfing', 'surfing'],
      ['movies about ballet', 'ballet'],
      ['movies about chess', 'chess'],
      ['movies about journalism', 'journalism'],
      ['movies about mountaineering', 'mountaineering'],
      ['shows about restaurants', 'restaurants'],
      ['documentaries about volcanoes', 'volcanoes'],
      ['films about grief', 'grief'],
      // Singular, but framed as a request — the frame is what carries it.
      ['show me a film about grief', 'grief'],
      ['I want a movie about chess', 'chess'],
      ['give me a documentary about volcanoes', 'volcanoes'],
    ];
    for (const [text, subject] of cases) {
      expect(interpret(text).subjects.map((s) => s.span), text).toContain(subject);
    }
  });

  /* A LIMIT FOUND WHILE FIXING THIS, PINNED SO IT CANNOT BE MISTAKEN FOR THE
     ABOUTNESS FIX FAILING. An UNFRAMED SINGULAR request — "a film about grief"
     with no request verb — never reaches subject extraction at all, because
     `classifyClauses` reads it as a STATEMENT: the bare-request rule requires a
     PLURAL media noun. The plural "films about grief" and the framed "show me a
     film about grief" both work.

     That is a clause-classification gap, not an aboutness gap, and it predates
     this change on both sides. It is logged in BACKLOG.md rather than widened
     into here, because loosening bare-request classification to accept singular
     nouns is exactly the change that previously turned preference statements
     ("I like Sylvester Stallone movies") into requests. */
  it('KNOWN LIMIT: an unframed singular request is still read as a statement', () => {
    expect(interpret('a film about grief').kind).toBe('statement');
    expect(interpret('films about grief').kind).toBe('recommendation');
    expect(interpret('show me a film about grief').kind).toBe('recommendation');
  });

  it('the media type still reads correctly alongside the subject', () => {
    expect(interpret('movies about chess').media).toBe('movie');
    expect(interpret('shows about restaurants').media).toBe('tv');
  });

  it('does not invent a subject from request framing or a person', () => {
    // "about" that is not an aboutness clause must not donate a subject.
    expect(interpret('how about a Bruce Willis movie').subjects.map((s) => s.span)).not.toContain('bruce');
    // A person still owns their own name.
    const stallone = interpret('three Sylvester Stallone movies');
    expect(stallone.people.map((p) => p.span)).toContain('Sylvester Stallone');
    expect(stallone.subjects.map((s) => s.span)).not.toContain('sylvester');
  });

  it('the pre-nominal form keeps working — this ADDS a construction', () => {
    expect(interpret('give me a boxing movie').subjects.map((s) => s.span)).toContain('boxing');
    expect(interpret('three good heist movies').subjects.map((s) => s.span)).toContain('heist');
  });
});
