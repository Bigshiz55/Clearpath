import { describe, it, expect } from 'vitest';
import { extractResultCount, DEFAULT_RESULT_COUNT } from './count';
import { extractCount, parseRequestedCount, DEFAULT_COUNT } from './detectors';
import { extractCount as planCount, buildQueryPlan } from './queryPlan';

/**
 * THE BUG, IN ONE LINE:
 *
 *   "A great movie under two hours"  →  two movies.
 *
 * Both count readers took the first number in the sentence. Every number a
 * request can contain — a runtime, a date window, a rating floor, a season
 * count — was therefore also a request for that many results. The user asked
 * for movies under two hours and got two of them.
 */
describe('a number is a result count only when it counts results', () => {
  it('THE REGRESSION: a runtime is not a count', () => {
    expect(extractResultCount('a great movie under two hours')).toBeNull();
    expect(extractResultCount('something under 2 hours')).toBeNull();
    expect(extractResultCount('a movie under 90 minutes')).toBeNull();
    expect(extractResultCount('under 120 mins please')).toBeNull();
  });

  it('a date window is not a count', () => {
    expect(extractResultCount('something from the last 3 years')).toBeNull();
    expect(extractResultCount('anything out in the past 6 months')).toBeNull();
    expect(extractResultCount('movies from the last 5 years')).toBeNull();
  });

  it('a rating floor is not a count', () => {
    expect(extractResultCount('a thriller with imdb 7.5 or higher')).toBeNull();
    expect(extractResultCount('audience over 80')).toBeNull();
    expect(extractResultCount('an 8/10 or better')).toBeNull();
    expect(extractResultCount('rated above 75%')).toBeNull();
  });

  it('a season or episode number is not a count', () => {
    expect(extractResultCount('a show with at least 3 seasons')).toBeNull();
    expect(extractResultCount('under 30 minute episodes')).toBeNull();
  });

  it('a decade is not a count', () => {
    expect(extractResultCount('something from the 80s')).toBeNull();
    expect(extractResultCount('90s action movies')).toBeNull();
  });

  it('the flagship multi-constraint ask states no count at all', () => {
    // Four numbers, none of them a quantity of results. Under the old reader
    // this asked for 140 results; under the one before that, for one.
    expect(
      extractResultCount(
        'a movie that is under 140 minutes long, is a crime thriller, out within the last 24 months, with a watch verdict of 80+',
      ),
    ).toBeNull();
  });
});

describe('a stated count is still read', () => {
  it('reads a number bound to the thing being returned', () => {
    expect(extractResultCount('give me five movies')).toBe(5);
    expect(extractResultCount('show me 3 shows')).toBe(3);
    expect(extractResultCount('10 titles please')).toBe(10);
    expect(extractResultCount('send me three good films')).toBe(3);
    expect(extractResultCount('4 picks for tonight')).toBe(4);
  });

  it('reads a bare number after a request verb', () => {
    expect(extractResultCount('give me five')).toBe(5);
    expect(extractResultCount('top 10 for tonight')).toBe(10);
    expect(extractResultCount('show me 6')).toBe(6);
  });

  it('reads the vague quantities people actually say', () => {
    expect(extractResultCount('a couple of movies on Netflix')).toBe(2);
    expect(extractResultCount('show me a few thrillers')).toBe(3);
    expect(extractResultCount('several shows')).toBe(4);
  });

  it('but a vague quantity of TIME is still not a count', () => {
    expect(extractResultCount('anything on in the next couple of hours')).toBeNull();
    expect(extractResultCount('out in the last few years')).toBeNull();
  });

  it('a real count survives alongside other numbers', () => {
    expect(extractResultCount('give me 5 movies under two hours')).toBe(5);
    expect(extractResultCount('three films from the last 10 years')).toBe(3);
    expect(extractResultCount('two shows with imdb over 8')).toBe(2);
  });

  it('a bare count fragment is a count (the planner splits these out)', () => {
    expect(extractResultCount('3')).toBe(3);
    expect(extractResultCount('a couple of')).toBe(2);
    expect(extractResultCount('several')).toBe(4);
  });

  it('says nothing when the ask names no number', () => {
    expect(extractResultCount('a good movie')).toBeNull();
    expect(extractResultCount('')).toBeNull();
    expect(extractResultCount('something funny for tonight')).toBeNull();
  });

  it('honours the caller\'s ceiling', () => {
    expect(extractResultCount('give me 500 movies', { max: 60 })).toBeNull();
    expect(extractResultCount('give me 40 movies', { max: 20 })).toBeNull();
    expect(extractResultCount('give me 40 movies', { max: 60 })).toBe(40);
  });
});

/**
 * "THEY DIDN'T SAY" MEANS BROWSE, NOT EIGHT.
 *
 * The default was written 8 in `detectors.ts` and 8 again in `askParse.ts`,
 * while `finder.ts` documented 24 at length. The two 8s were the live path, so
 * the 24 was decorative — every free-text ask in the product returned eight
 * results regardless.
 */
describe('the default is a full page, in one place', () => {
  it('an ask with no count gets the browse default', () => {
    expect(parseRequestedCount('a good movie')).toBe(DEFAULT_RESULT_COUNT);
    expect(parseRequestedCount('a great movie under two hours')).toBe(DEFAULT_RESULT_COUNT);
  });

  it('the default fills a responsive grid rather than reading as a shortlist', () => {
    expect(DEFAULT_RESULT_COUNT).toBeGreaterThanOrEqual(20);
    expect(DEFAULT_COUNT).toBe(DEFAULT_RESULT_COUNT);
  });

  it('a stated count still wins over the default', () => {
    expect(parseRequestedCount('give me three movies')).toBe(3);
    expect(parseRequestedCount('a couple of movies')).toBe(2);
  });
});

describe('both readers share the definition', () => {
  it('the planner no longer plans a count nobody asked for', () => {
    expect(planCount('movies under two hours')).toBeNull();
    const p = buildQueryPlan('movies under two hours');
    expect(p.count.requested).toBeNull();
    expect(p.hardConstraints).not.toContain('count=2');
  });

  it('the detectors and the planner agree on real counts', () => {
    for (const q of ['give me five movies', 'three films', 'a couple of shows']) {
      expect(extractCount(q), q).toBe(planCount(q));
    }
  });
});
