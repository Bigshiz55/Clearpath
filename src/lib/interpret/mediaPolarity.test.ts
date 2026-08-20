import { describe, expect, it } from 'vitest';
import { interpret, parseMedia } from './interpret';

/**
 * MEDIA HAS POLARITY — presence is not preference.
 *
 * `parseMedia` was presence-only: "movies but no TV shows" contains both
 * token classes, so it answered `either` and the veto vanished into a
 * positive signal. A negated media noun must never count toward presence;
 * negation is decided per OCCURRENCE, in a short window behind the token,
 * the same idiom the subject layer already uses.
 *
 * The movie/TV pair is this product's exhaustive universe (`mediaType` is
 * 'movie' | 'tv' | 'any'), so ruling one out with nothing stated positively
 * means the other. Ruling BOTH out is a contradiction, and a contradiction
 * is a question — never a guess.
 */

describe('media negation is occurrence-scoped', () => {
  it('"Give me movies but no TV shows" → movie', () => {
    expect(interpret('Give me movies but no TV shows').media).toBe('movie');
  });

  it('"Give me TV shows, not movies" → tv', () => {
    expect(interpret('Give me TV shows, not movies').media).toBe('tv');
  });

  it('"Give me something but no TV shows" → movie (the exhaustive universe)', () => {
    expect(interpret('Give me something but no TV shows').media).toBe('movie');
  });

  it('"Give me something but no movies" → tv', () => {
    expect(interpret('Give me something but no movies').media).toBe('tv');
  });

  it('CONTROL: "Give me movies and TV shows" → either', () => {
    expect(interpret('Give me movies and TV shows').media).toBe('either');
  });

  it('CONTROL: a plain single-medium ask is untouched', () => {
    expect(interpret('Give me a boxing movie').media).toBe('movie');
    expect(interpret('Give me a crime show').media).toBe('tv');
  });

  it('"no movies and no TV" is a contradiction, never a guess', () => {
    expect(parseMedia('Give me no movies and no TV shows')).toBe('none');
  });
});

/**
 * ONE NEGATION VOCABULARY, THREE CONSUMERS — the media window was the copy
 * the contraction fix never reached. "a thriller that isn't slow" was
 * repaired in `negatedSpans` and `NEGATORS`, but `MEDIA_NEGATOR_BEHIND` kept
 * its own hand-listed subset, so "something that isn't a movie" ran with
 * media MOVIE — the same inversion, one consumer over. The window now
 * composes from `NEGATORS`, so a negator added there governs media nouns
 * with no second list to forget.
 */
describe('the media window shares the one negator vocabulary', () => {
  const RULED_OUT: Array<[string, 'movie' | 'tv']> = [
    ["something that isn't a movie", 'tv'],
    ["can't stand sitcoms, a movie please", 'movie'],
    ['other than movies, anything', 'tv'],
    ["a thriller that isn't a series", 'movie'],
    ["give me something that won't be a movie", 'tv'],
  ];

  for (const [text, media] of RULED_OUT) {
    it(`"${text}" → ${media}`, () => {
      expect(interpret(text).media).toBe(media);
    });
  }

  it('CONTROL: the spelled-out forms that already worked still work', () => {
    expect(interpret('do not want a series').media).toBe('movie');
    expect(interpret('Give me TV shows, not movies').media).toBe('tv');
  });

  it('CONTROL: an auxiliary AFTER the noun does not negate it', () => {
    expect(interpret("a movie my wife doesn't like").media).toBe('movie');
  });

  it('CONTROL: a clause boundary still stops the window', () => {
    // The negator governs its own clause; the comma keeps it off "movies".
    expect(parseMedia("I don't know, movies I guess")).toBe('movie');
  });

  /* THE STATEMENT BOUNDARY IS NOT A MEDIA BUG. A bare "I don't want a movie
     tonight" carries no request at all — the clause layer reads it as a
     statement, exactly the ownership rule the stated-taste work established,
     so media is never parsed and stays 'either'. Turning statements into
     requests to capture their media would be the inversion of that rule. */
  it('a standalone negative preference stays a statement, not a request', () => {
    expect(interpret("I don't want a movie tonight").kind).toBe('statement');
    expect(interpret("we won't watch a series").kind).toBe('statement');
  });

  /* KNOWN LIMIT, pre-existing and deliberately out of scope here: the window
     lets a negator reach PAST the phrase it governs to a media noun behind a
     content word — "no horror movies" negates the MEDIUM as well as the
     genre (media flips to tv). That is a window-scope question, not a
     vocabulary question; changing it moves many sentences at once and
     belongs to its own characterized change. The genre exclusion itself is
     correct and pinned here so the limit cannot silently deepen. */
  it('KNOWN LIMIT pinned: "no horror movies" still excludes the genre', () => {
    const i = interpret('no horror movies');
    expect(i.genres.find((g) => g.span === 'horror')?.wanted).toBe(false);
  });
});
