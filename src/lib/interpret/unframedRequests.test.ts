import { describe, it, expect } from 'vitest';
import { interpret } from '@/lib/interpret/interpret';

/**
 * NATURAL, UNFRAMED REQUESTS ARE REQUESTS.
 *
 * Measured against the deployed product, half of ordinary consumer phrasing was
 * being discarded. "another boxing movie" and "a thriller that isn't slow"
 * classified as STATEMENTS, so no subject bound, no constraint survived, and
 * the sentence reached the finder as background noise.
 *
 * The cause is structural, not lexical. `bareRequest` required a PLURAL media
 * noun, and that plural was load-bearing for a good reason: film titles are
 * singular ("Scary Movie", "A Goofy Movie"), so accepting the singular
 * naively turns every title into an order.
 *
 * The discriminator this pins is therefore not "singular is allowed" but:
 *
 *   a clause that OPENS with an indefinite determiner, names a medium or a
 *   genre, and is written as ordinary prose rather than as a title
 *
 * Anchoring at the clause start is what keeps "Rocky is a boxing movie" — the
 * same noun phrase as a predicate nominative — a statement. Prose-vs-title is
 * what keeps "A Goofy Movie" a title, with no title list involved.
 */

describe('unframed requests — POSITIVE: these are requests', () => {
  const CASES = [
    'another boxing movie',
    'another courtroom drama',
    "a thriller that isn't slow",
    "a comedy that isn't dumb",
    'a movie my wife and I would both like',
    'a show my family can watch',
    'something fun tonight',
    'something easy after work',
    'a short movie for tonight',
    'a good mystery',
  ];
  for (const text of CASES) {
    it(`"${text}"`, () => {
      expect(interpret(text).kind, text).toBe('recommendation');
    });
  }

  /* Classifying it as a request is only worth anything if the CONTENT then
     survives. Which field it lands in depends on the head noun, and that split
     is the architecture's, not this test's: a MEDIUM head ("boxing movie")
     leaves the modifier as a subject, a GENRE head ("courtroom drama") binds
     the genre. */
  it('a medium head leaves the topic as a subject', () => {
    expect(interpret('another boxing movie').subjects.map((s) => s.span)).toContain('boxing');
    expect(interpret('another boxing movie').media).toBe('movie');
  });

  it('a genre head binds the genre', () => {
    expect(interpret('another courtroom drama').genres.map((g) => g.span)).toContain('drama');
    expect(interpret('a good mystery').genres.map((g) => g.span)).toContain('mystery');
    expect(interpret("a thriller that isn't slow").genres.map((g) => g.span)).toContain('thriller');
  });

  it('and the medium is read when it is stated', () => {
    expect(interpret('a show my family can watch').media).toBe('tv');
    expect(interpret('a short movie for tonight').media).toBe('movie');
  });

  /* RESOLVED — this was pinned as a known gap when the unframed-request fix
     landed. A genre can head the phrase just as a medium can, and dropping the
     qualifier lost the entire topic of the request. */
  it('a GENRE head also yields its qualifier as a subject', () => {
    const cases: Array<[string, string, string]> = [
      ['another courtroom drama', 'courtroom', 'drama'],
      ['a political thriller', 'political', 'thriller'],
      ['a boxing drama', 'boxing', 'drama'],
      ['a prison drama', 'prison', 'drama'],
      ['a psychological thriller', 'psychological', 'thriller'],
      ['a legal thriller', 'legal', 'thriller'],
    ];
    for (const [text, subject, genre] of cases) {
      expect(interpret(text).subjects.map((s) => s.span), text).toContain(subject);
      expect(interpret(text).genres.map((g) => g.span), text).toContain(genre);
    }
  });

  it('but a qualifier that is ITSELF a genre stays a genre', () => {
    // "crime comedy" and "family comedy" name two genres, not a topic.
    expect(interpret('a crime comedy').subjects.map((s) => s.span)).toHaveLength(0);
    expect(interpret('a crime comedy').genres.map((g) => g.span)).toContain('crime');
    expect(interpret('a family comedy').subjects.map((s) => s.span)).toHaveLength(0);
  });
});

describe('unframed requests — NEGATIVE: these must NOT become requests', () => {
  /* Every one of these is a way the guard could be lost. A preference statement
     that turns into a request manufactures a fake title anchor — the defect
     that produced "Which title did you mean?" — and a title that turns into a
     request fetches a category instead of the film. */
  const STATEMENTS = [
    'I like Sylvester Stallone movies',
    'I like thrillers',
    'We watched a boxing movie',
    'I saw a courtroom drama',
    'Rocky is a boxing movie',
  ];
  for (const text of STATEMENTS) {
    it(`"${text}" stays a statement`, () => {
      expect(interpret(text).kind, text).not.toBe('recommendation');
    });
  }

  const TITLES = ['A Goofy Movie', 'The Lego Movie', 'Scary Movie'];
  for (const text of TITLES) {
    it(`"${text}" is not turned into a category request`, () => {
      const i = interpret(text);
      expect(i.kind, text).not.toBe('recommendation');
      expect(i.subjects.map((s) => s.span), text).toHaveLength(0);
    });
  }

  it('no preference statement ever manufactures a title anchor', () => {
    for (const text of ['I like Sylvester Stallone movies', 'I like thrillers']) {
      expect(interpret(text).titles.map((t) => t.span), text).toHaveLength(0);
    }
  });
});
