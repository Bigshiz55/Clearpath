import { describe, it, expect } from 'vitest';
import { normalizeTitle, pickMatch, type TmdbCandidate } from './tmdbMatch';

/**
 * `results[0]` WAS NOT A MATCH.
 *
 * The old matcher took TMDB's most popular result whenever the programme had no
 * release year — and neither ingest writer populates `release_year`, so that
 * was every ingested row. Whatever came back first was written permanently onto
 * the programme as its `tmdb_id` and `tmdb_media_type`.
 *
 * A wrong media type is worse than a missing one. Null fails closed; a wrong
 * 'movie' puts a series inside the Movie Vault and looks like a success.
 */

const c = (
  id: number,
  title: string,
  mediaType: 'movie' | 'tv' = 'movie',
  year: number | null = null,
): TmdbCandidate => ({ id, title, mediaType, year });

describe('normalization removes noise and nothing else', () => {
  it('ignores case, punctuation, accents and a leading article', () => {
    expect(normalizeTitle('The Girl in the Basement')).toBe('girl in the basement');
    expect(normalizeTitle('girl in the basement')).toBe('girl in the basement');
    expect(normalizeTitle('Amélie')).toBe('amelie');
    expect(normalizeTitle('Marley & Me')).toBe('marley and me');
    expect(normalizeTitle('Ocean’s Eleven')).toBe('ocean s eleven');
  });

  it('does NOT collapse titles that differ by a word', () => {
    /* The line between "the same title written differently" and "a different
       title". Fuzzy distance would put these on the same side of it. */
    expect(normalizeTitle('Stalked by My Doctor')).not.toBe(normalizeTitle('Stalked by My Neighbor'));
    expect(normalizeTitle('Deadly Adoption')).not.toBe(normalizeTitle('A Deadly Adoption Story'));
  });
});

describe('with no year — every ingested row today — ambiguity is refused', () => {
  it('THE REGRESSION: two same-titled candidates no longer resolve to the popular one', () => {
    const got = pickMatch({ title: 'Snapped' }, [
      c(1, 'Snapped', 'tv'),
      c(2, 'Snapped', 'movie'),
    ]);
    expect(got, 'popularity was used as evidence again').toBeNull();
  });

  it('a single exact match is accepted', () => {
    const got = pickMatch({ title: 'The Girl in the Basement' }, [
      c(10, 'The Girl in the Basement', 'movie'),
      c(11, 'Girl in the Attic', 'movie'),
    ]);
    expect(got).toEqual({ id: 10, mediaType: 'movie', basis: 'exact-title-unique' });
  });

  it('a near-miss is not a match', () => {
    expect(pickMatch({ title: 'Stalked by My Doctor' }, [c(3, 'Stalked by My Mother')])).toBeNull();
    expect(pickMatch({ title: 'Deadly Adoption' }, [c(4, 'A Deadly Adoption: The Sequel')])).toBeNull();
  });

  it('an empty candidate list is a refusal, not an error', () => {
    expect(pickMatch({ title: 'Anything At All' }, [])).toBeNull();
  });

  it('titles too short to identify anything stay unmatched', () => {
    /* "Go", "Us" and "It" are real films and also the titles most likely to
       collide with a hundred unrelated rows. Without a year there is nothing to
       separate them. */
    expect(pickMatch({ title: 'Go' }, [c(5, 'Go', 'movie')])).toBeNull();
    expect(pickMatch({ title: 'It' }, [c(6, 'It', 'movie')])).toBeNull();
  });
});

describe('the provider’s declared kind narrows the pool before ranking', () => {
  it('a row the provider called a film cannot match a series', () => {
    const got = pickMatch({ title: 'Snapped', expectedMediaType: 'movie' }, [
      c(1, 'Snapped', 'tv'),
      c(2, 'Snapped', 'movie'),
    ]);
    // The tv candidate is discarded first, which leaves ONE — so this resolves
    // where the unconstrained version above correctly refused.
    expect(got).toEqual({ id: 2, mediaType: 'movie', basis: 'exact-title-unique' });
  });

  it('and cannot invent one when only the wrong kind exists', () => {
    expect(pickMatch({ title: 'Castle', expectedMediaType: 'movie' }, [c(7, 'Castle', 'tv')])).toBeNull();
  });

  it('narrowing never widens: two films still tie', () => {
    const got = pickMatch({ title: 'Home', expectedMediaType: 'movie' }, [
      c(8, 'Home', 'movie'),
      c(9, 'Home', 'movie'),
    ]);
    expect(got).toBeNull();
  });
});

describe('a year, when one exists, filters and breaks ties', () => {
  it('picks the candidate in range', () => {
    const got = pickMatch({ title: 'Carrie', releaseYear: 2013 }, [
      c(20, 'Carrie', 'movie', 1976),
      c(21, 'Carrie', 'movie', 2013),
    ]);
    expect(got).toEqual({ id: 21, mediaType: 'movie', basis: 'exact-title-year' });
  });

  it('tolerates one year of drift between a guide and TMDB', () => {
    const got = pickMatch({ title: 'Some Lifetime Film', releaseYear: 2020 }, [
      c(22, 'Some Lifetime Film', 'movie', 2021),
    ]);
    expect(got?.id).toBe(22);
  });

  it('refuses when nothing is in range, rather than falling back', () => {
    /* The old code's `??` chain ended at `results[0]`. Out of range must mean
       no match, not "try the popular one anyway". */
    const got = pickMatch({ title: 'Carrie', releaseYear: 2013 }, [c(20, 'Carrie', 'movie', 1976)]);
    expect(got).toBeNull();
  });

  it('refuses a genuine tie', () => {
    const got = pickMatch({ title: 'Twins', releaseYear: 2000 }, [
      c(30, 'Twins', 'movie', 1999),
      c(31, 'Twins', 'movie', 2001),
    ]);
    expect(got).toBeNull();
  });
});
