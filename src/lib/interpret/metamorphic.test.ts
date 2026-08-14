import { describe, it, expect } from 'vitest';
import { interpret } from './interpret';
import { executable } from './types';

/**
 * THE INVARIANT THE PRODUCT RESTS ON.
 *
 * Adding conversation a person did not intend as a search must not change the
 * search. Stated as a metamorphic property rather than as a list of examples,
 * because the failure being fixed is not "burrito" — it is that the parser's
 * DEFAULT was to treat any unrecognised noun as a search term. A burrito test
 * would pass the moment "burrito" joined a stop-word list, and the next unusual
 * noun would fail exactly as before.
 *
 * So: for every request X and every irrelevant prefix P, the EXECUTABLE
 * projection of `interpret(P + X)` must equal that of `interpret(X)`. The
 * prefixes below are deliberately varied in subject — food, work, weather,
 * animals, days, numbers — and none of them appears anywhere in the
 * implementation. If the mechanism were a word list, most of these would fail.
 */

/** Requests that must survive being buried in conversation. */
const REQUESTS = [
  "I'm looking for another boxing movie.",
  'Give me three boxing movies.',
  '3 Sylvester Stallone movies',
  'Give me 5 Tom Hanks movies',
  'Find me a funny movie under two hours.',
  'Show me a crime show on Netflix.',
  'Give me three funny Sandra Bullock movies after 2005.',
  'I want a mystery, nothing too depressing.',
  'Give me three good heist movies.',
  'Find me two boxing movies under two hours.',
];

/**
 * Irrelevant conversational prefixes. None of these words is referenced by the
 * implementation — that is the point of listing this many, and of their range.
 */
const NOISE = [
  'Had a beef burrito for dinner.',
  'Had a burrito. Anyway,',
  'Long day at work.',
  'My dog is asleep.',
  "It's Thursday.",
  'I had tacos earlier;',
  'The weather sucks.',
  'My neighbour is mowing the lawn again.',
  'I just got back from the dentist.',
  'Traffic was unbelievable this morning.',
  'I have 4 emails I still need to answer.',
  'We repainted the kitchen last weekend.',
];

/**
 * ADVERSARIAL NOISE — background that COLLIDES with the search vocabulary.
 *
 * The benign corpus above is not a real test on its own: a clause about a
 * burrito leaks nothing even if it is mis-scoped, because no field wants the
 * word. These sentences each contain a genre, tone, provider, media noun or
 * count that a mis-scoped clause WOULD hand to the engine — "work was a horror
 * show", "I watched 3 episodes yesterday". They are still background, and the
 * only thing that keeps them out is the clause's role rather than its words.
 *
 * Mutation-checked: reverting the classifier's default to "everything
 * contributes" turns most of these red, which is the property the benign list
 * could not demonstrate on its own.
 */
const ADVERSARIAL_NOISE = [
  'Work was a horror show today.',
  'The kids are watching cartoons in the other room.',
  "I'm halfway through a romance novel.",
  'It was a dark and rainy morning.',
  'My comedy podcast crashed twice.',
  'I watched 3 episodes of something yesterday.',
  'That match last night was a proper thriller.',
  'Netflix keeps logging me out, by the way.',
  'The drama at the office is unreal.',
  'My documentary phase lasted about two weeks.',
  'I saw four people I know at the shop.',
  'This week has been a total mystery to me.',
];

describe('irrelevant conversation cannot change the executable request', () => {
  for (const request of REQUESTS) {
    for (const noise of [...NOISE, ...ADVERSARIAL_NOISE]) {
      it(`"${noise}" does not alter: ${request}`, () => {
        const alone = executable(interpret(request));
        const buried = executable(interpret(`${noise} ${request}`));
        expect(buried, `noise leaked into the search: ${noise}`).toEqual(alone);
      });
    }
  }

  it('records the ignored clause rather than silently dropping it', () => {
    // Deliberately inspectable: "we saw this and set it aside" is a different
    // claim from "we never noticed it", and only one of them is auditable.
    const out = interpret('Had a beef burrito for dinner. Give me three boxing movies.');
    expect(out.background.map((b) => b.text).join(' ')).toMatch(/burrito/i);
    expect(out.background[0]!.reason).toBe('no-request-signal');
  });

  it('never turns an irrelevant noun into a subject, genre, tone or title', () => {
    const out = interpret('Had a beef burrito for dinner. Give me three boxing movies.');
    const serialised = JSON.stringify({
      subjects: out.subjects,
      genres: out.genres,
      tones: out.tones,
      titles: out.titles,
      people: out.people,
      providers: out.providers,
    });
    for (const word of ['burrito', 'beef', 'dinner']) {
      expect(serialised, `"${word}" reached an executable field`).not.toContain(word);
    }
    expect(out.subjects.some((s) => s.span === 'boxing' && s.wanted)).toBe(true);
  });

  it('survives noise appended after the request as well as before', () => {
    const alone = executable(interpret('Give me three boxing movies.'));
    const after = executable(interpret('Give me three boxing movies. My dog is barking.'));
    expect(after).toEqual(alone);
  });

  it('survives noise on both sides at once', () => {
    const alone = executable(interpret('Give me three boxing movies.'));
    const wrapped = executable(
      interpret('Had a burrito for dinner. Give me three boxing movies. Anyway, the weather is awful.'),
    );
    expect(wrapped).toEqual(alone);
  });
});

describe('relevant context is NOT solved by deleting history', () => {
  /*
   * The cheap way to pass the suite above is to throw away everything that is
   * not the final imperative. These prove the mechanism discriminates instead:
   * a taste statement must still land, and in the right field.
   */
  it('a liked reference survives and is marked as taste, not as a request', () => {
    const out = interpret("I loved Rocky. I'm looking for another boxing movie.");
    const rocky = out.titles.find((t) => /rocky/i.test(t.span));
    expect(rocky, 'the liked reference was discarded').toBeDefined();
    expect(rocky!.relation).toBe('liked');
    expect(out.subjects.some((s) => s.span === 'boxing' && s.wanted)).toBe(true);
    // And it is not mistaken for the thing being asked for.
    expect(rocky!.relation).not.toBe('requested');
  });

  it('a disliked reference is negative, never positive', () => {
    const out = interpret('I hated Sinister. Give me a thriller.');
    const ref = out.titles.find((t) => /sinister/i.test(t.span));
    expect(ref?.relation, 'a hated film was recorded as liked').toBe('disliked');
  });

  it("a companion's veto is attributed to them, not to the user", () => {
    const out = interpret('My wife hates horror. Give me something funny tonight.');
    const horror = out.genres.find((g) => g.span === 'horror');
    expect(horror, 'the veto was dropped').toBeDefined();
    expect(horror!.wanted, 'a veto became a positive preference').toBe(false);
    expect(horror!.holder, "someone else's veto became the user's own taste").toBe('companion');
  });

  it('relevant prefixes change only the fields they support', () => {
    const base = executable(interpret('Give me a boxing movie.'));
    const withTaste = executable(interpret('I loved Rocky. Give me a boxing movie.'));
    // Everything except the reference list is untouched.
    expect({ ...withTaste, titles: [] }).toEqual({ ...base, titles: [] });
    expect(withTaste.titles.length).toBeGreaterThan(0);
  });
});
