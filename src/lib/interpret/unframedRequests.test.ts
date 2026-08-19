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

  /* KNOWN GAP, pinned so it is tracked rather than mistaken for this fix
     failing: with a GENRE head the qualifier is not also captured as a subject,
     so "courtroom" in "another courtroom drama" is currently dropped. The
     subject extractor's media-noun list is deliberately media-only. Logged in
     BACKLOG.md. */
  it('KNOWN GAP: a genre head does not also yield the qualifier as a subject', () => {
    expect(interpret('another courtroom drama').subjects.map((s) => s.span)).not.toContain('courtroom');
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
