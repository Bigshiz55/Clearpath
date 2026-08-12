import { describe, it, expect } from 'vitest';
import { resolveMediaKind, expectedTmdbMediaType } from './mediaKind';

/**
 * MEASURED, NOT ASSUMED. On the real Lifetime stations: 20 distinct
 * programmes, 2 with a TMDB id, 18 with a null `tmdb_media_type`. The Vault
 * asked only about that one column, so it rejected 90% of the Pack for lack of
 * a lookup that nothing schedules.
 *
 * These tests pin the two halves of the fix: the provider's own `programme_type`
 * counts as evidence, and everything that is NOT evidence still fails closed.
 */

describe('the provider’s own type is read, because it is on every row', () => {
  it('a provider "movie" is a film with no TMDB match at all', () => {
    /* TV Media sets this from `showTypeID === 'M'`, TVmaze from
       `show.type === 'Movie'`. Both are the feed's own flag, not a guess about
       the title's name. This single line is what takes the Vault off zero. */
    const v = resolveMediaKind({ tmdbMediaType: null, programmeType: 'movie' });
    expect(v).toEqual({ kind: 'film', source: 'provider-type' });
  });

  it('a provider "series" is not a film', () => {
    expect(resolveMediaKind({ programmeType: 'series' }).kind).toBe('not-film');
  });

  it('news and sports are not films either', () => {
    for (const t of ['news', 'sports']) {
      expect(resolveMediaKind({ programmeType: t }).kind).toBe('not-film');
    }
  });

  it('the CATCH-ALL values are not evidence', () => {
    /* 'special', 'kids' and 'other' are what each writer emits when it could
       NOT classify the row. Reading a shrug as an answer is how "everything on
       Lifetime is a movie" gets reintroduced with extra steps. */
    for (const t of ['special', 'kids', 'other', 'unrecognised', '']) {
      const v = resolveMediaKind({ programmeType: t });
      expect(v.kind, `"${t}" was treated as evidence`).toBe('unknown');
    }
  });
});

describe('TMDB outranks the provider, and structure outranks nothing', () => {
  it('a TMDB match decides on its own', () => {
    expect(resolveMediaKind({ tmdbMediaType: 'movie' })).toEqual({ kind: 'film', source: 'tmdb' });
    expect(resolveMediaKind({ tmdbMediaType: 'tv' })).toEqual({ kind: 'not-film', source: 'tmdb' });
  });

  it('season/episode numbering settles a row nothing else describes', () => {
    const v = resolveMediaKind({ programmeType: 'special', seasonNumber: 4, episodeNumber: 12 });
    expect(v).toEqual({ kind: 'not-film', source: 'episode-structure' });
    expect(resolveMediaKind({ episodeNumber: 3 }).kind).toBe('not-film');
  });

  it('but numbering NEVER overrides an explicit "movie"', () => {
    /* TVmaze delivers films as episode objects on its schedule feed —
       `tvmazeIngest` reads `m.episode.season` and `m.episode.number` for every
       row including a Movie-type show — so a real film can arrive carrying
       episode numbers. Letting structure veto would delete genuine movies from
       the Vault, and an empty catalogue is also a failure. */
    const v = resolveMediaKind({ programmeType: 'movie', seasonNumber: 1, episodeNumber: 1 });
    expect(v).toEqual({ kind: 'film', source: 'provider-type' });
  });

  it('the ABSENCE of numbering is not evidence of a film', () => {
    // Fail closed: "no episode number" describes an infomercial just as well.
    expect(resolveMediaKind({}).kind).toBe('unknown');
    expect(resolveMediaKind({ seasonNumber: null, episodeNumber: null }).kind).toBe('unknown');
  });
});

describe('two explicit claims that disagree decide NOTHING', () => {
  it('TMDB "tv" against provider "movie" is unknown, not a tie-break', () => {
    /* These TMDB ids come from a title-string search, which is fallible. A
       disagreement means one of the two is wrong with no way to tell which, and
       silently preferring either one converts a coin flip into a permanent
       claim about the row. */
    const v = resolveMediaKind({ tmdbMediaType: 'tv', programmeType: 'movie' });
    expect(v).toEqual({ kind: 'unknown', source: 'conflict' });
  });

  it('and the reverse — TMDB "movie" against provider "series"', () => {
    const v = resolveMediaKind({ tmdbMediaType: 'movie', programmeType: 'series' });
    expect(v).toEqual({ kind: 'unknown', source: 'conflict' });
    // This is the false-positive direction, so it MUST NOT resolve to a film.
    expect(v.kind).not.toBe('film');
  });

  it('agreement is not a conflict', () => {
    expect(resolveMediaKind({ tmdbMediaType: 'movie', programmeType: 'movie' }).kind).toBe('film');
    expect(resolveMediaKind({ tmdbMediaType: 'tv', programmeType: 'series' }).kind).toBe('not-film');
  });
});

describe('the expected type narrows a search before it runs', () => {
  it('reads only pre-TMDB evidence, so it can constrain the call that produces it', () => {
    expect(expectedTmdbMediaType({ programmeType: 'movie' })).toBe('movie');
    expect(expectedTmdbMediaType({ programmeType: 'series' })).toBe('tv');
    expect(expectedTmdbMediaType({ seasonNumber: 2 })).toBe('tv');
  });

  it('returns null rather than a guess when the provider said nothing', () => {
    expect(expectedTmdbMediaType({})).toBeNull();
    expect(expectedTmdbMediaType({ programmeType: 'other' })).toBeNull();
  });
});
