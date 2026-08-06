import { describe, it, expect } from 'vitest';
import { naiveParseQuery, describeQuery, parseTopicTerms } from '@/lib/finderParse';
import { buildQueryPlan } from '@/lib/nlu/queryPlan';
import { classifySearch } from '@/lib/nlu/searchMode';
import { referenceCandidates } from '@/lib/nlu/titleReference';
import { extractReference } from '@/lib/askJudge';
import { GENRE_IDS } from '@/lib/finderGenres';

/**
 * NO RECOGNISED CONSTRAINT MAY DISAPPEAR SILENTLY.
 *
 * The forensic audit found the request reaching the right destination with its
 * meaning stripped off on the way: "I like Rocky, but I want to see other
 * boxing movies that were filmed after 2020" arrived as a bare movie search.
 * These tests assert the STRUCTURED INTERPRETATION — the reference, the years,
 * the exclusions — not merely the route, because the route was already right
 * and the answer was still wrong.
 */

/** What the ask route actually uses to seed a similarity search. */
const resolvedReference = (text: string): string | null => {
  const raw = extractReference(text);
  return raw ? (referenceCandidates(raw)[0] ?? null) : null;
};

describe('the canonical Rocky request', () => {
  const ROCKY = 'I like Rocky, but I want to see other boxing movies that were filmed after 2020.';

  it('keeps Rocky as a similarity reference, not a destination', () => {
    expect(resolvedReference(ROCKY)).toBe('Rocky');
    // And the classifier agrees this is a comparison, not a title lookup — the
    // ask route only takes the similarity path when the mode says so.
    expect(classifySearch(ROCKY).mode).toBe('similar_to');
  });

  it('keeps "movie" as the requested media type', () => {
    expect(naiveParseQuery(ROCKY).mediaType).toBe('movie');
    expect(buildQueryPlan(ROCKY).mediaTypes).toContain('movie');
  });

  it('keeps "after 2020" as a release-year floor', () => {
    expect(naiveParseQuery(ROCKY).minYear).toBe(2020);
  });

  it('states the year back to the user rather than applying it invisibly', () => {
    expect(describeQuery(naiveParseQuery(ROCKY))).toContain('2020 or later');
  });

  it('does not turn the request into an exact-title lookup for Rocky', () => {
    const cls = classifySearch(ROCKY);
    expect(cls.mode).not.toBe('exact_title');
    expect(cls.requestedTitle).toBeNull();
  });
});

describe('close paraphrases of the Rocky request', () => {
  const CASES: [string, { ref: string | null; media?: 'movie' | 'tv' | 'any'; minYear?: number }][] = [
    ['Movies like Rocky after 2020.', { ref: 'Rocky', media: 'movie', minYear: 2020 }],
    ['Newer boxing movies like Rocky.', { ref: 'Rocky', media: 'movie' }],
    ['I like Rocky. What else should I watch?', { ref: 'Rocky' }],
    ['I enjoyed Rocky, but show me recent boxing films without Stallone.', { ref: 'Rocky', media: 'movie' }],
  ];
  for (const [text, want] of CASES) {
    it(`recovers the reference from ${JSON.stringify(text)}`, () => {
      expect(resolvedReference(text)).toBe(want.ref);
      const q = naiveParseQuery(text);
      if (want.media) expect(q.mediaType).toBe(want.media);
      if (want.minYear) expect(q.minYear).toBe(want.minYear);
    });
  }

  it('"Boxing movies after 2020, no documentaries" keeps BOTH the year and the exclusion', () => {
    const text = 'Boxing movies after 2020, no documentaries.';
    const q = naiveParseQuery(text);
    expect(q.minYear).toBe(2020);
    expect(q.excludeGenreIds).toContain(GENRE_IDS.documentary);
    // …and the exclusion must never re-appear as a REQUESTED genre.
    expect(q.genreIds).not.toContain(GENRE_IDS.documentary);

    // The plan drives the ask route's final whitelist. Documentary landing in
    // `mediaTypes` is what let the excluded kind through the filter.
    const plan = buildQueryPlan(text);
    expect(plan.mediaTypes).not.toContain('documentary');
    expect(plan.excludedMediaTypes).toContain('documentary');
    expect(plan.hardConstraints).toContain('mediaType!=documentary');
  });
});

describe('similarity references', () => {
  const CASES: [string, string][] = [
    ['shows like Mindhunter', 'Mindhunter'],
    ['similar to Mindhunter but less violent', 'Mindhunter'],
    ['something with the same feel as Prisoners', 'Prisoners'],
    ['more shows like Criminal Minds', 'Criminal Minds'],
    ['another movie like The Holdovers', 'Holdovers'],
    ['in the style of Fargo', 'Fargo'],
    ['something like Like Water for Chocolate', 'Like Water for Chocolate'],
  ];
  for (const [text, want] of CASES) {
    it(`${JSON.stringify(text)} → ${want}`, () => {
      expect(resolvedReference(text)).toBe(want);
    });
  }

  it('keeps a title that legitimately contains a comma', () => {
    // "Murder, She Wrote" must survive as the FIRST candidate; the fragments
    // are only fallbacks for the resolver.
    expect(resolvedReference('movies like Murder, She Wrote')).toBe('Murder, She Wrote');
  });

  it('still strips the preference clause the module was written for', () => {
    const c = referenceCandidates("Rocky or Cinderella Man that I probably haven't seen");
    expect(c.every((s) => !/haven|seen/i.test(s))).toBe(true);
  });
});

describe('negative constraints stay attached to the right concept', () => {
  const NEG: [string, number][] = [
    ['something good but no documentaries', GENRE_IDS.documentary!],
    ['a thriller, nothing animated', GENRE_IDS.animation!],
    ['anything except horror', GENRE_IDS.horror!],
    ['a drama without romance', GENRE_IDS.romance!],
    ['not a musical', GENRE_IDS.music!],
    ['crime shows, nothing scary', GENRE_IDS.horror!],
  ];
  for (const [text, id] of NEG) {
    it(`${JSON.stringify(text)} excludes rather than requests`, () => {
      const q = naiveParseQuery(text);
      expect(q.excludeGenreIds ?? []).toContain(id);
      expect(q.genreIds).not.toContain(id);
    });
  }

  it('a negation does not leak across a clause boundary', () => {
    // "no horror" must not also exclude the comedy that follows it.
    const q = naiveParseQuery('no horror, and some comedy please');
    expect(q.excludeGenreIds ?? []).toContain(GENRE_IDS.horror);
    expect(q.genreIds).toContain(GENRE_IDS.comedy);
    expect(q.excludeGenreIds ?? []).not.toContain(GENRE_IDS.comedy);
  });

  it('reads exclusions back to the user', () => {
    expect(describeQuery(naiveParseQuery('a comedy but no romance'))).toContain('no romance');
  });

  it('matches the plurals people actually say', () => {
    // `documentary` + "s" is not "documentaries"; every -y genre was invisible
    // in the plural, so the exclusion had nothing to attach to.
    expect(naiveParseQuery('no documentaries').excludeGenreIds).toContain(GENRE_IDS.documentary);
    expect(naiveParseQuery('some comedies').genreIds).toContain(GENRE_IDS.comedy);
    expect(naiveParseQuery('good mysteries').genreIds).toContain(GENRE_IDS.mystery);
  });
});

describe('date and year constraints', () => {
  it('after / since / newer than', () => {
    expect(naiveParseQuery('movies after 2020').minYear).toBe(2020);
    expect(naiveParseQuery('shows since 2021').minYear).toBe(2021);
    expect(naiveParseQuery('films newer than 2015').minYear).toBe(2015);
  });

  it('before / prior to', () => {
    expect(naiveParseQuery('movies before 1995').maxYear).toBe(1995);
    expect(naiveParseQuery('films prior to 1980').maxYear).toBe(1980);
  });

  it('decades become a closed window', () => {
    const q = naiveParseQuery('crime dramas from the 1980s');
    expect(q.minYear).toBe(1980);
    expect(q.maxYear).toBe(1989);
  });

  it('leaves the existing relative-recency path alone', () => {
    // `sinceMonths` was already handled and must keep working untouched.
    expect(naiveParseQuery('something from the last 2 years').sinceMonths).toBe(24);
    expect(naiveParseQuery('recent movies').sinceMonths).toBe(24);
  });

  it('does not invent a year where none was stated', () => {
    const q = naiveParseQuery('a good crime thriller');
    expect(q.minYear).toBeUndefined();
    expect(q.maxYear).toBeUndefined();
  });
});

describe('a year beside a title disambiguates instead of breaking the lookup', () => {
  for (const [text, title, year] of [
    ['Creed 2015', 'Creed', 2015],
    ['Dune 2021', 'Dune', 2021],
    ['It 2017', 'It', 2017],
  ] as [string, string, number][]) {
    it(`${text} → title ${title}, year ${year}`, () => {
      const cls = classifySearch(text);
      expect(cls.requestedTitle).toBe(title);
      expect(cls.year).toBe(year);
    });
  }

  it('a query that is ONLY a year stays that title', () => {
    // "1917" and "2012" are films. Stripping the year would leave nothing.
    expect(classifySearch('1917').requestedTitle).toBe('1917');
    expect(classifySearch('1917').year).toBeNull();
  });
});

describe('protected behaviour — what already worked must keep working', () => {
  it('a bare title is still an exact-title lookup', () => {
    const cls = classifySearch('CSI: NY');
    expect(cls.mode).toBe('exact_title');
    expect(cls.requestedTitle).toBe('CSI: NY');
  });

  it('a title plus a provider is still an exact-title lookup', () => {
    const cls = classifySearch('Gone on BritBox');
    expect(cls.mode).toBe('exact_title');
    expect(cls.requiredProvider?.name).toMatch(/britbox/i);
  });

  it('a bare title yields no reference and no invented constraints', () => {
    expect(extractReference('Cinderella Man')).toBeNull();
    const q = naiveParseQuery('Cinderella Man');
    expect(q.excludeGenreIds).toBeUndefined();
    expect(q.minYear).toBeUndefined();
  });

  it('empty and malformed input parse without throwing', () => {
    for (const bad of ['', '   ', '!!!!', ' ', 'a'.repeat(5000), '<script>alert(1)</script>']) {
      expect(() => naiveParseQuery(bad)).not.toThrow();
      expect(() => classifySearch(bad)).not.toThrow();
      expect(() => buildQueryPlan(bad)).not.toThrow();
      expect(() => referenceCandidates(bad)).not.toThrow();
    }
  });

  it('an injection payload is parsed as text, never as a constraint', () => {
    const q = naiveParseQuery("'; DROP TABLE users;--");
    expect(q.genreIds).toEqual([]);
    expect(q.excludeGenreIds).toBeUndefined();
  });
});

describe('multiple constraints survive together', () => {
  it('reference + media type + year + exclusion in one sentence', () => {
    const text = 'Movies like Rocky after 2020, no documentaries';
    expect(resolvedReference(text)).toBe('Rocky');
    const q = naiveParseQuery(text);
    expect(q.mediaType).toBe('movie');
    expect(q.minYear).toBe(2020);
    expect(q.excludeGenreIds).toContain(GENRE_IDS.documentary);
    expect(buildQueryPlan(text).excludedMediaTypes).toContain('documentary');
  });

  it('a decade plus an exclusion', () => {
    const q = naiveParseQuery('crime dramas from the 1980s, nothing animated');
    expect(q.minYear).toBe(1980);
    expect(q.maxYear).toBe(1989);
    expect(q.genreIds).toContain(GENRE_IDS.crime);
    expect(q.excludeGenreIds).toContain(GENRE_IDS.animation);
  });
});

describe('subject matter that is not a genre', () => {
  it('the canonical request keeps "boxing" as a subject term', () => {
    const topics = parseTopicTerms('I like Rocky, but I want to see other boxing movies that were filmed after 2020.');
    expect(topics).toContain('boxing');
  });

  it('a negated subject is not requested', () => {
    // "Something like Rocky but not about boxing" must not filter FOR boxing.
    expect(parseTopicTerms('Something like Rocky but not about boxing')).not.toContain('boxing');
    expect(parseTopicTerms('a heist movie, no zombies')).toEqual(['heist']);
  });

  it('finds nothing to invent in an ordinary title lookup', () => {
    expect(parseTopicTerms('Cinderella Man')).toEqual([]);
    expect(parseTopicTerms('')).toEqual([]);
  });

  it('is bounded so one sentence cannot flood the keyword filter', () => {
    const many = 'boxing heist zombie vampire spy prison christmas wedding dinosaur';
    expect(parseTopicTerms(many).length).toBeLessThanOrEqual(4);
  });
});
