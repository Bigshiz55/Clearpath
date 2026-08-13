import { describe, it, expect } from 'vitest';
import { stripRequestFrame } from './requestFrame';
import { extractPersonName } from './queryRepair';

/**
 * THE REPORTED PRODUCTION FAILURE, AND ITS WHOLE CLASS.
 *
 * "find me 3 Sylvester Stallone movies you think I'll like" returned an EMPTY
 * result set on production — `results: []`, `people: []` — on a query naming
 * one of the most findable actors alive. Both deterministic person extractors
 * missed it, for different reasons, and the AI parser is the only thing that
 * could have caught it, so the product's answer to a spoken request depended
 * entirely on an optional API key.
 *
 * The failing shape is not exotic. It is what a microphone produces: a request
 * verb, a count, the actual subject, and a statement that the answer should
 * suit the asker. The more naturally somebody spoke, the more likely they were
 * to get nothing.
 *
 * The cases below are written as SENTENCES A PERSON WOULD SAY, because the
 * defect was never in the parsing of any one pattern — it was that the patterns
 * only ever described how a person TYPES.
 */

describe('the reported failure, exactly as it was reported', () => {
  const SAID = "find me 3 Sylvester Stallone movies you think I'll like";

  it('names the actor', () => {
    expect(extractPersonName(SAID)).toBe('Sylvester Stallone');
  });

  it('keeps the count the user actually stated', () => {
    // "3" is an instruction. Dropping it and returning a default page is a
    // different answer from the one that was asked for.
    expect(stripRequestFrame(SAID).count).toBe(3);
  });

  it('records that they asked for something suited to THEM', () => {
    // The difference between a catalogue listing and a recommendation.
    expect(stripRequestFrame(SAID).personalized).toBe(true);
  });

  it('leaves the substance, and only the substance', () => {
    expect(stripRequestFrame(SAID).text).toBe('Sylvester Stallone movies');
  });
});

describe('the same request, said the other ordinary ways', () => {
  const CASES: Array<[string, string | null, number | null]> = [
    ['show me some Tom Hanks movies I would enjoy', 'Tom Hanks', null],
    ['give me 5 Denzel Washington films', 'Denzel Washington', 5],
    ['find me 3 Sylvester Stallone movies', 'Sylvester Stallone', 3],
    ['3 Sylvester Stallone movies', 'Sylvester Stallone', 3],
    ['can you find me a few Scorsese movies', 'Scorsese', 3],
    ['I want to watch a couple of Tom Cruise movies', 'Tom Cruise', 2],
    ['looking for Meryl Streep films for me', 'Meryl Streep', null],
    ['recommend two Keanu Reeves movies you think I might like', 'Keanu Reeves', 2],
  ];
  for (const [said, person, count] of CASES) {
    it(`"${said}"`, () => {
      expect(extractPersonName(said), 'person').toBe(person);
      expect(stripRequestFrame(said).count, 'count').toBe(count);
    });
  }
});

describe('a bare query is untouched — the old behaviour is byte-identical', () => {
  for (const q of ['Sylvester Stallone movies', 'movies with Gary Sinise', 'who is David Fincher']) {
    it(`"${q}" still resolves`, () => {
      expect(extractPersonName(q)).not.toBeNull();
    });
  }

  it('a bare name still returns null, so the caller keeps its own fallback', () => {
    expect(extractPersonName('Sylvester Stallone')).toBeNull();
  });

  for (const q of ['Sylvester Stallone', 'Rocky', 'heist movies', 'Breaking Bad']) {
    it(`"${q}" is passed through unchanged`, () => {
      const f = stripRequestFrame(q);
      expect(f.text).toBe(q);
      expect(f.stripped).toBe(false);
    });
  }
});

describe('titles made of framing words survive — the trap this class of fix falls into', () => {
  /* EVERY ONE OF THESE IS A REAL FILM, and every one of them is built from the
     words a stripper is most tempted to remove. The first draft of this module
     turned "The Holiday" into "Holiday" and then offered it to the person index
     as a name. Stripping is only ever allowed to remove framing it can prove. */
  const TITLES = [
    'The Holiday',
    'Like a Boss',
    'A Quiet Place',
    'Get Out',
    'Us',
    'Some Like It Hot',
    'The Sylvester Stallone Story',
    'Three Billboards Outside Ebbing, Missouri',
    'Two Weeks Notice',
    'A Few Good Men',
  ];
  for (const t of TITLES) {
    it(`"${t}" is not reduced`, () => {
      expect(stripRequestFrame(t).text).toBe(t);
    });
    it(`"${t}" is not mistaken for a person`, () => {
      expect(extractPersonName(t)).toBeNull();
    });
  }
});

describe('a subject request is not a person request', () => {
  /* Peeling the frame exposes what is left to the person patterns, and the
     first draft let anything ending in "movies" through as a name — so
     "three comedies you think I will love" came back with the person
     "comedies". A genre is not a cast member. */
  const NOT_PEOPLE = [
    'three comedies you think I will love',
    'find me a good heist movie I would like',
    'some scary movies for tonight',
    'give me 5 best action films',
    'show me a new thriller I would enjoy',
  ];
  for (const q of NOT_PEOPLE) {
    it(`"${q}"`, () => {
      expect(extractPersonName(q)).toBeNull();
    });
  }
});

describe('peeling is safe to repeat and cannot empty a query', () => {
  it('is idempotent — a second pass changes nothing', () => {
    const once = stripRequestFrame("find me 3 Sylvester Stallone movies you think I'll like").text;
    expect(stripRequestFrame(once).text).toBe(once);
  });

  it('a query that is nothing BUT framing keeps its original text', () => {
    for (const q of ['find me some', 'show me', 'a few']) {
      expect(stripRequestFrame(q).text.length).toBeGreaterThan(0);
    }
  });

  it('empty in, empty out, no throw', () => {
    expect(stripRequestFrame('').text).toBe('');
    expect(stripRequestFrame('   ').text).toBe('');
  });

  it('an absurd count is not believed', () => {
    // "50 movies" is not a real request shape; the count guard keeps it out
    // rather than letting it set a 50-result limit.
    expect(stripRequestFrame('find me 50 Stallone movies').count).toBeNull();
  });
});

describe('the other things people say to a microphone', () => {
  /* Found by probing the fix against a wider set of real phrasings rather than
     by re-reading the regex. Two of these were pre-existing gaps in the same
     family as the reported bug, and one was a guard of mine that was too blunt:
     "how about a Bruce Willis movie" reduces to "a Bruce Willis", a real name
     wearing an article, and the first draft rejected it outright. */
  const RESOLVES: Array<[string, string]> = [
    ['what should I watch tonight with Tom Hanks', 'Tom Hanks'],
    ['movies directed by Christopher Nolan', 'Christopher Nolan'],
    ['how about a Bruce Willis movie', 'Bruce Willis'],
    ['got any Denzel Washington movies', 'Denzel Washington'],
    ['pull up Al Pacino movies', 'Al Pacino'],
    ["I'm looking for Robin Williams films I would love", 'Robin Williams'],
    ['suggest 4 Tom Hardy films for me', 'Tom Hardy'],
    ['anything with Meryl Streep', 'Meryl Streep'],
  ];
  for (const [said, person] of RESOLVES) {
    it(`"${said}"`, () => expect(extractPersonName(said)).toBe(person));
  }

  it('a bare "with" needs a FULL name behind it — "With Honors" is a film', () => {
    /* The weakest lead in the set, so it is the one that has to prove itself:
       two words minimum, or it is a title that happens to open with "with".

       "starring" and "featuring" deliberately do NOT carry the same floor, and
       a first draft of this test asserted they did. "starring Cher" is a real
       query with a one-word answer, and no rule can tell it apart from
       "Starring Adam" — so the floor goes on the preposition that films
       actually start with, and not on the participles they do not. */
    expect(extractPersonName('With Honors')).toBeNull();
    expect(extractPersonName('starring Cher'), 'a one-word name is still a name').toBe('Cher');
  });
});
