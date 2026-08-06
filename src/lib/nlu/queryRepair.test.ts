import { describe, it, expect } from 'vitest';
import { splitTitleYear, extractPersonName, misspellingCandidates, isGenericPhrase } from '@/lib/nlu/queryRepair';
import { resolveSearchDestination, type CatalogResult } from '@/lib/search/searchIntent';
import { naiveParseQuery, parseTopicTerms } from '@/lib/finderParse';
import { extractReference } from '@/lib/askJudge';

/**
 * The repairs for the audit's three biggest P0 clusters, plus the adversarial
 * PAIRS: for every phrase that must change behaviour, its close sibling that
 * must NOT. A repair that fires on both halves of a pair is a new bug wearing
 * the old one's fix.
 */

describe('title + year splitting', () => {
  const CASES: [string, string, number | null][] = [
    ['Creed 2015', 'Creed', 2015],
    ['Dune 2021', 'Dune', 2021],
    ['It 2017', 'It', 2017],
    ['Crash 2004', 'Crash', 2004],
    ['Heat (1995)', 'Heat', 1995],
    ['2001 A Space Odyssey', 'A Space Odyssey', 2001],
  ];
  for (const [raw, title, year] of CASES) {
    it(`${JSON.stringify(raw)} → ${title} / ${year}`, () => {
      expect(splitTitleYear(raw)).toEqual({ title, year });
    });
  }

  it('ADVERSARIAL PAIR: a query that IS a year stays a title', () => {
    expect(splitTitleYear('1917')).toEqual({ title: '1917', year: null });
    expect(splitTitleYear('2012')).toEqual({ title: '2012', year: null });
  });

  it('a query with no year is untouched', () => {
    expect(splitTitleYear('Cinderella Man')).toEqual({ title: 'Cinderella Man', year: null });
  });
});

describe('person phrasing', () => {
  const CASES: [string, string][] = [
    ['who is Sylvester Stallone', 'Sylvester Stallone'],
    ['Gary Sinise movies', 'Gary Sinise'],
    ['films with Cameron Diaz', 'Cameron Diaz'],
    ['movies with Denzel Washington', 'Denzel Washington'],
    ['David Fincher filmography', 'David Fincher'],
    ['Ryan Coogler filmography', 'Ryan Coogler'],
    ['directed by Christopher Nolan', 'Christopher Nolan'],
    ['written by Taylor Sheridan', 'Taylor Sheridan'],
    ['starring Michelle Yeoh', 'Michelle Yeoh'],
    ['Denzel movies', 'Denzel'],
  ];
  for (const [raw, name] of CASES) {
    it(`${JSON.stringify(raw)} → ${name}`, () => {
      expect(extractPersonName(raw)).toBe(name);
    });
  }

  it('ADVERSARIAL PAIR: a bare name has no phrasing to strip — behaviour unchanged', () => {
    expect(extractPersonName('Sylvester Stallone')).toBeNull();
    expect(extractPersonName('Tom Hanks')).toBeNull();
  });

  it('ADVERSARIAL PAIR: a title is not mistaken for a person', () => {
    // "Movies" is a tail only when something is left; digits disqualify.
    expect(extractPersonName('movies with 500 days of summer')).toBeNull();
    expect(extractPersonName('Cinderella Man')).toBeNull();
  });
});

describe('misspelling candidates', () => {
  const RECOVERS: [string, string][] = [
    ['Roocky', 'Rocky'],
    ['boxxing', 'boxing'],
    ['Southpaww', 'Southpaw'],
    ['UUs', 'Us'],
    ['Parsaite', 'Parasite'],
    ['Raigng Bull', 'Raging Bull'],
    ['Knivse Out', 'Knives Out'],
    ['crimnal minds', 'crimnal minds'], // deletion — see the honest case below
  ];
  for (const [typo, want] of RECOVERS.slice(0, 7)) {
    it(`${JSON.stringify(typo)} candidates include ${JSON.stringify(want)}`, () => {
      expect(misspellingCandidates(typo).map((c) => c.toLowerCase())).toContain(want.toLowerCase());
    });
  }

  it('is bounded — a hostile string cannot fan out', () => {
    expect(misspellingCandidates('a'.repeat(100))).toEqual([]);
    expect(misspellingCandidates('<script>alert(1)</script>').length).toBeLessThanOrEqual(12);
    expect(misspellingCandidates('')).toEqual([]);
  });

  it('HONEST LIMIT: pure deletions ("crimnal", "Holday") are not covered', () => {
    // Insertion candidates are 26×n lookups; not worth it. Recorded so the
    // limit is a decision, not a surprise.
    expect(misspellingCandidates('The Holday').map((c) => c.toLowerCase())).not.toContain('the holiday');
  });
});

describe('generic phrases never navigate', () => {
  // The five audit failures, verbatim, plus the routing consequence: each had
  // a real catalog result whose title literally matched, and each opened it.
  const AUDIT_FIVE: [string, CatalogResult][] = [
    ['something good', { id: 236329, mediaType: 'movie', title: 'Something Good' }],
    ['a movie', { id: 128682, mediaType: 'movie', title: 'A Movie' }],
    ['newer', { id: 1007663, mediaType: 'movie', title: 'Newer' }],
    ['not that', { id: 10184, mediaType: 'movie', title: 'Not That' }],
    ['the sequel', { id: 1163319, mediaType: 'movie', title: 'The Sequel' }],
  ];
  for (const [q, decoy] of AUDIT_FIVE) {
    it(`${JSON.stringify(q)} goes to the Judge even with a literal catalog match`, () => {
      expect(isGenericPhrase(q)).toBe(true);
      const dest = resolveSearchDestination(q, [decoy]);
      expect(dest?.reason).toBe('ask');
      expect(dest?.href).toContain('/app/ask');
    });
  }

  it('ADVERSARIAL PAIR: famous pronoun-titles still navigate', () => {
    // "It" and "Us" are films; keeping them out of the generic list is the
    // whole point of the list being explicit.
    for (const [q, hit] of [
      ['It', { id: 346364, mediaType: 'movie' as const, title: 'It', year: 2017 }],
      ['Us', { id: 458723, mediaType: 'movie' as const, title: 'Us', year: 2019 }],
      ['Show Me a Hero', { id: 62127, mediaType: 'tv' as const, title: 'Show Me a Hero' }],
    ] as [string, CatalogResult][]) {
      expect(isGenericPhrase(q)).toBe(false);
      expect(resolveSearchDestination(q, [hit])?.reason).toBe('exact-title');
    }
  });
});

describe('year-aware exact-title routing', () => {
  const CREEDS: CatalogResult[] = [
    { id: 312221, mediaType: 'movie', title: 'Creed', year: 2015 },
    { id: 1, mediaType: 'movie', title: 'Creed II', year: 2018 },
  ];

  it('"Creed 2015" opens the 2015 Creed', () => {
    const dest = resolveSearchDestination('Creed 2015', CREEDS);
    expect(dest?.reason).toBe('exact-title');
    expect(dest?.href).toBe('/app/title/movie/312221');
  });

  it('ADVERSARIAL PAIR: "movies like Creed" is a request, not a destination', () => {
    // The similarity phrasing reads as a request; it must not open Creed.
    const dest = resolveSearchDestination('movies like Creed', CREEDS);
    expect(dest?.reason).toBe('ask');
  });

  it('a wrong year still prefers the exact title over the Judge', () => {
    // "Creed 2016" — no candidate carries that year; the exact bare-title
    // match is a better answer than pretending the query is a mystery.
    const dest = resolveSearchDestination('Creed 2016', CREEDS);
    expect(dest?.reason).toBe('exact-title');
  });
});

describe('adversarial constraint pairs', () => {
  it('boxing vs not boxing', () => {
    expect(parseTopicTerms('boxing movies after 2020')).toContain('boxing');
    expect(parseTopicTerms('something like Rocky but not about boxing')).not.toContain('boxing');
  });

  it('before 2020 vs after 2020 vs not before 2020', () => {
    expect(naiveParseQuery('movies before 2020').maxYear).toBe(2020);
    expect(naiveParseQuery('movies after 2020').minYear).toBe(2020);
    const notBefore = naiveParseQuery('movies not before 2020');
    expect(notBefore.minYear).toBe(2020);
    expect(notBefore.maxYear).toBeUndefined();
  });

  it('between 2005 and 2015 becomes a closed window', () => {
    const q = naiveParseQuery('a thriller between 2005 and 2015');
    expect(q.minYear).toBe(2005);
    expect(q.maxYear).toBe(2015);
  });

  it('"newer than Rocky" seeds Rocky; "newer than 2015" seeds nothing', () => {
    expect(extractReference('something newer than Rocky')).toBe('Rocky');
    expect(extractReference('movies newer than 2015')).toBeNull();
    expect(naiveParseQuery('movies newer than 2015').minYear).toBe(2015);
  });

  it('"less violent than John Wick" carries the reference', () => {
    expect(extractReference('less violent than John Wick')).toBe('John Wick');
  });

  it('"not another Yellowstone" is not a similarity request for Yellowstone', () => {
    expect(extractReference('not another Yellowstone')).toBeNull();
  });

  it('"shows like Yellowstone" IS a similarity request for Yellowstone', () => {
    expect(extractReference('shows like Yellowstone')).toBe('Yellowstone');
  });
});
