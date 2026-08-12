import { describe, it, expect } from 'vitest';
import {
  normaliseTitle,
  pickVerified,
  resolveIdentity,
  verifyIdentity,
  type ClaimedIdentity,
  type ObservedIdentity,
} from './identity';

/**
 * THE THREE FAILURES THAT SHIPPED, TURNED INTO TESTS.
 *
 * Observed live at /app/showdown:
 *   "Making a Murderer"          rendered with anime artwork
 *   "The Great British Bake Off" rendered with an unrelated Russian series
 *   "The Last Dance"             rendered with no usable poster
 *
 * None of these was a fetch error. The catalogue's `tmdbId` values are
 * hand-authored, TMDB ids are arbitrary integers, and a wrong one always
 * resolves to SOMETHING — so the app asked for an id, got a real record with a
 * real poster, and printed it under our label without ever comparing the two
 * names. A plausible poster under the wrong name looks exactly like a working
 * feature, which is why this went out.
 *
 * These fix the class, not the three instances. The rule under test is: nothing
 * reaches the screen or the evidence log until the name and year that came back
 * match the name and year we are going to display.
 */

const claim = (title: string, year: number, mediaType: 'movie' | 'tv' = 'tv'): ClaimedIdentity => ({
  id: title.toLowerCase().replace(/\W+/g, '-'),
  title,
  year,
  mediaType,
});

const observed = (o: Partial<ObservedIdentity> & { title: string }): ObservedIdentity => ({
  tmdbId: 1,
  mediaType: 'tv',
  year: 2000,
  posterPath: '/p.jpg',
  ...o,
});

describe('the exact failures observed in the live build', () => {
  it('refuses anime artwork for Making a Murderer', () => {
    // The recorded id resolved to a real series that is not this one.
    const verdict = verifyIdentity(
      claim('Making a Murderer', 2015),
      observed({ title: 'Ushio & Tora', year: 2015, tmdbId: 65249 }),
    );
    expect(verdict.ok, 'a different series passed identity verification').toBe(false);
  });

  it('refuses an unrelated Russian series for The Great British Bake Off', () => {
    const verdict = verifyIdentity(
      claim('The Great British Bake Off', 2010),
      observed({ title: 'Универ. Новая общага', year: 2011, tmdbId: 45965 }),
    );
    expect(verdict.ok).toBe(false);
  });

  it('refuses a film that merely shares a name with a different year', () => {
    /* THE REMAKE CASE, and the most dangerous of the three: the artwork is real,
       the name is right, and the work is wrong. Nothing downstream could ever
       detect it. */
    const verdict = verifyIdentity(
      claim('Halloween', 2018, 'movie'),
      observed({ title: 'Halloween', year: 1978, mediaType: 'movie' }),
    );
    expect(verdict.ok, 'a remake passed as the original').toBe(false);
  });

  it('refuses a movie record for a series id, and vice versa', () => {
    // TMDB ids are namespaced per media type, so this is not a near miss — it is
    // an entirely different catalogue.
    expect(
      verifyIdentity(claim('The Last Dance', 2020, 'tv'), observed({ title: 'The Last Dance', year: 2020, mediaType: 'movie' })).ok,
    ).toBe(false);
  });

  it('and still accepts the genuine article', () => {
    const v = verifyIdentity(
      claim('Making a Murderer', 2015),
      observed({ title: 'Making a Murderer', year: 2015 }),
    );
    expect(v.ok).toBe(true);
  });
});

describe('verification is strict about works and relaxed about noise', () => {
  it('normalises articles, punctuation and accents', () => {
    expect(normaliseTitle('The Office')).toBe('office');
    expect(normaliseTitle('WALL·E')).toBe('wall e');
    expect(normaliseTitle('Amélie')).toBe('amelie');
    expect(normaliseTitle('Fast & Furious')).toBe('fast and furious');
  });

  it('accepts a title whose only difference is the definite article', () => {
    expect(verifyIdentity(claim('The Office', 2005), observed({ title: 'Office', year: 2005 })).ok).toBe(true);
  });

  it('accepts a two-year drift, because a premiere date is not a season', () => {
    expect(verifyIdentity(claim('Sherlock', 2010), observed({ title: 'Sherlock', year: 2012 })).ok).toBe(true);
  });

  it('rejects a four-year drift, because that is a different work', () => {
    expect(verifyIdentity(claim('Sherlock', 2010), observed({ title: 'Sherlock', year: 2016 })).ok).toBe(false);
  });

  it('accepts a match on the original-language title', () => {
    const v = verifyIdentity(
      claim('Parasite', 2019, 'movie'),
      observed({ title: '기생충', originalTitle: 'Parasite', year: 2019, mediaType: 'movie' }),
    );
    expect(v.ok).toBe(true);
  });

  it('treats a missing upstream record as unverified, never as a pass', () => {
    expect(verifyIdentity(claim('Anything', 2000), null).ok).toBe(false);
  });
});

describe('a wrong recorded id is corrected, not merely rejected', () => {
  const byId = (rec: ObservedIdentity | null) => async () => rec;
  const searchWith = (rows: ObservedIdentity[]) => async () => rows;

  it('falls back to a verified search result and reports the correction', async () => {
    const res = await resolveIdentity(
      claim('Survivor', 2000),
      810, // the hand-typed id, which is a different series entirely
      byId(observed({ title: 'Some Other Show', year: 2003, tmdbId: 810 })),
      searchWith([
        observed({ title: 'Survivor', year: 2000, tmdbId: 15665, posterPath: '/real.jpg' }),
      ]),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.identity.tmdbId, 'the wrong id survived').toBe(15665);
    expect(res.identity.posterPath).toBe('/real.jpg');
    expect(res.corrected?.recorded).toBe(810);
    expect(res.corrected?.wasShowing).toContain('Some Other Show');
    expect(res.identity.via).toBe('search');
  });

  it('holds the recorded id when it is right, and does not search', async () => {
    let searched = false;
    const res = await resolveIdentity(
      claim('Breaking Bad', 2008),
      1396,
      byId(observed({ title: 'Breaking Bad', year: 2008, tmdbId: 1396 })),
      async () => {
        searched = true;
        return [];
      },
    );
    expect(res.ok).toBe(true);
    expect(searched, 'a correct id triggered an unnecessary search').toBe(false);
    if (res.ok) expect(res.identity.via).toBe('recorded');
  });

  it('returns UNVERIFIED rather than any artwork when nothing checks out', async () => {
    /* THE WHOLE POINT. The alternative — showing the record that came back —
       is precisely what put anime beside Making a Murderer. There is no branch
       here that returns artwork it could not verify. */
    const res = await resolveIdentity(
      claim('The Last Dance', 2020),
      97183,
      byId(observed({ title: 'Unrelated Thing', year: 1999, tmdbId: 97183 })),
      searchWith([observed({ title: 'Also Not It', year: 2020, tmdbId: 5 })]),
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.unverified.reason).toContain('Unrelated Thing');
  });

  it('survives an upstream failure without accepting anything', async () => {
    const res = await resolveIdentity(
      claim('Dark', 2017),
      70523,
      async () => {
        throw new Error('502');
      },
      searchWith([observed({ title: 'Dark', year: 2017, tmdbId: 70523, posterPath: '/d.jpg' })]),
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.identity.posterPath).toBe('/d.jpg');
  });

  it('picks the best verified candidate and ignores confident-looking wrong ones', () => {
    const picked = pickVerified(claim('Dark', 2017), [
      observed({ title: 'Darkness', year: 2017, tmdbId: 1 }),
      observed({ title: 'Dark', year: 2017, tmdbId: 2 }),
      observed({ title: 'Dark', year: 1994, tmdbId: 3 }),
    ]);
    expect(picked?.observed.tmdbId).toBe(2);
  });
});

describe('what the game is allowed to deal', () => {
  it('withholds titles that failed while others passed', async () => {
    const { poolExclusions } = await import('./identity');
    const { exclude, reason } = poolExclusions({
      verified: [{ id: 'a' }, { id: 'b' }],
      unverified: [{ id: 'bad' }],
    });
    expect(exclude).toEqual(['bad']);
    expect(reason).toBe('mismatch');
  });

  it('but never empties the pool just because the checker is down', async () => {
    const { poolExclusions } = await import('./identity');
    /* NO KEY, DEAD UPSTREAM, OFFLINE. The names and trait vectors are still
       correct and the typographic tile is a designed state — excluding the whole
       catalogue would trade a fully playable game for a network failure. */
    const { exclude, reason } = poolExclusions({
      verified: [],
      unverified: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    });
    expect(exclude).toEqual([]);
    expect(reason).toBe('checker-unavailable');
  });
});
