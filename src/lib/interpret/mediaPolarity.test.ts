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
