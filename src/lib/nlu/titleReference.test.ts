import { describe, it, expect } from 'vitest';
import { referenceCandidates, resolveNamedTitle, resolveFirst } from './titleReference';

/** A stand-in for TMDB search results. */
const t = (title: string, popularity = 1) => ({ title, popularity });

/**
 * THE CINDERELLA MAN PROBLEM.
 *
 * A substring test cannot tell "Cinderella Man" from "Cinderella" — it matches
 * in BOTH directions, so whichever film is more famous wins both questions.
 * Ask for the boxing picture, get the fairy tale.
 */
describe('Cinderella Man is not Cinderella', () => {
  // TMDB returns the fairy tale first for either query — it is far more popular.
  const results = [t('Cinderella', 900), t('Cinderella Man', 40), t('Cinderella II: Dreams Come True', 120)];

  it('asking for Cinderella Man returns Cinderella Man, not the more famous Cinderella', () => {
    const r = resolveNamedTitle('Cinderella Man', results);
    expect(r.match?.title).toBe('Cinderella Man');
    expect(r.reason).toBe('exact');
  });

  it('asking for Cinderella returns Cinderella, not Cinderella Man', () => {
    const r = resolveNamedTitle('Cinderella', results);
    expect(r.match?.title).toBe('Cinderella');
  });

  it('names what it declined to substitute', () => {
    // Someone asking for Cinderella Man was, under the old matcher, silently
    // given Cinderella. Now the near miss is recorded rather than served.
    const r = resolveNamedTitle('Cinderella Man', results);
    expect(r.nearMisses).toContain('Cinderella');
  });

  it('when the named title is genuinely absent, it substitutes NOTHING', () => {
    const r = resolveNamedTitle('Cinderella Man', [t('Cinderella', 900), t('Cinderella III', 50)]);
    expect(r.match).toBeNull();
    expect(r.reason).toBe('only_near_matches');
    expect(r.nearMisses).toContain('Cinderella');
  });

  it('the same trap, other franchises', () => {
    expect(resolveNamedTitle('The Terminal List', [t('The Terminal', 800), t('The Terminal List', 30)]).match?.title)
      .toBe('The Terminal List');
    expect(resolveNamedTitle('Gone', [t('Gone Girl', 900), t('Gone', 20)]).match?.title).toBe('Gone');
    expect(resolveNamedTitle('It', [t('It Follows', 400), t('It Chapter Two', 500), t('It', 300)]).match?.title).toBe('It');
    expect(resolveNamedTitle('Halloween', [t('Halloween Kills', 700), t('Halloween', 200)]).match?.title).toBe('Halloween');
  });
});

describe('choosing between real versions of the same title', () => {
  it('picks the best known when several match exactly, and flags the choice', () => {
    const r = resolveNamedTitle('Cinderella', [t('Cinderella', 120), t('Cinderella', 950), t('Cinderella', 300)]);
    expect(r.match?.popularity).toBe(950);
    expect(r.ambiguous).toBe(true);
  });

  it('a single exact match is not ambiguous', () => {
    expect(resolveNamedTitle('Cinderella Man', [t('Cinderella Man', 40), t('Cinderella', 900)]).ambiguous).toBe(false);
  });

  it('a leading article is not a different film', () => {
    expect(resolveNamedTitle('The Godfather', [t('Godfather', 500)]).match?.title).toBe('Godfather');
    expect(resolveNamedTitle('Godfather', [t('The Godfather', 500)]).match?.title).toBe('The Godfather');
  });

  it('but a sequel is', () => {
    expect(resolveNamedTitle('The Godfather', [t('The Godfather Part II', 800)]).match).toBeNull();
  });
});

/**
 * THE SENTENCE THAT BROKE IT.
 *
 * "kinda like Rocky or Cinderella Man that I probably haven't seen" was taken
 * as one title. It is two titles and a clause.
 */
describe('splitting a comparison into the titles it names', () => {
  it('THE REGRESSION: two titles and a trailing clause', () => {
    const c = referenceCandidates("Rocky or Cinderella Man that I probably haven't seen");
    expect(c).toContain('Rocky');
    expect(c).toContain('Cinderella Man');
    expect(c.every((s) => !/haven|seen/i.test(s))).toBe(true);
  });

  it('strips the clauses people actually append', () => {
    for (const [raw, want] of [
      ["Rocky that I probably haven't seen", 'Rocky'],
      ['Heat that I would like', 'Heat'],
      ["Fargo I've never seen", 'Fargo'],
      ['Sicario for me', 'Sicario'],
      ['Whiplash please', 'Whiplash'],
      ['Warrior I haven’t watched', 'Warrior'],
    ] as const) {
      expect(referenceCandidates(raw)[0], raw).toBe(want);
    }
  });

  it('offers the whole phrase first, so a title containing "and" survives', () => {
    const c = referenceCandidates('Sex, Lies, and Videotape');
    expect(c[0]).toBe('Sex, Lies, and Videotape');
  });

  it('and the resolver keeps whichever actually exists', () => {
    const catalogue = [t('Sex, Lies, and Videotape', 300), t('Videotape', 5), t('Lies', 8)];
    const got = resolveFirst(referenceCandidates('Sex, Lies, and Videotape'), (s) =>
      catalogue.filter((c) => c.title.toLowerCase().includes(s.toLowerCase().slice(0, 4))),
    );
    expect(got?.resolution.match?.title).toBe('Sex, Lies, and Videotape');
  });

  it('never eats a title that IS a first-person clause', () => {
    // "I Love You, Man" is a pronoun followed by a preference verb. A title
    // cannot be entirely trailing clause, so a match at position 0 is proof we
    // have matched the title itself.
    expect(referenceCandidates('I Love You, Man')[0]).toBe('I Love You, Man');
    expect(referenceCandidates('We Need to Talk About Kevin')[0]).toBe('We Need to Talk About Kevin');
    expect(referenceCandidates('I Saw the TV Glow')[0]).toBe('I Saw the TV Glow');
  });

  it('drops fragments too short to be a title', () => {
    expect(referenceCandidates('It or Up')).toEqual(['It or Up']);
  });

  it('returns nothing for an empty reference', () => {
    expect(referenceCandidates('')).toEqual([]);
    expect(referenceCandidates('   ')).toEqual([]);
  });
});

describe('resolveFirst — take the first candidate that genuinely exists', () => {
  const catalogue = [t('Rocky', 400), t('Cinderella Man', 40), t('Cinderella', 900)];
  const lookup = (s: string) => catalogue.filter((c) => c.title.toLowerCase().includes(s.toLowerCase().split(' ')[0]!));

  it('THE REGRESSION END TO END: the boxing ask seeds on a boxing film', () => {
    const got = resolveFirst(referenceCandidates("Rocky or Cinderella Man that I probably haven't seen"), lookup);
    expect(got?.resolution.match?.title).toBe('Rocky');
  });

  it('the whole phrase resolves to nothing rather than to a substring of itself', () => {
    // This is what used to seed the search: the full sentence "matched" any
    // result whose title appeared anywhere inside it.
    const whole = resolveNamedTitle("Rocky or Cinderella Man that I probably haven't seen", [
      ...catalogue, t('Man', 10), t('Seen', 3), t('That', 2),
    ]);
    expect(whole.match).toBeNull();
  });

  it('returns null when nothing in the ask is a real title', () => {
    expect(resolveFirst(referenceCandidates('something gritty and cold'), () => [])).toBeNull();
  });

  it('reports a near miss when the named title is absent entirely', () => {
    const got = resolveFirst(referenceCandidates('Cinderella Man'), () => [t('Cinderella', 900)]);
    expect(got?.resolution.match).toBeNull();
    expect(got?.resolution.reason).toBe('only_near_matches');
  });
});
