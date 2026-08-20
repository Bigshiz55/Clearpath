/**
 * A GENRE SAID IN THE PLURAL IS STILL A GENRE.
 *
 * THE DEFECT, FOUND WHILE EXTENDING THE DEPLOYED HARNESS. "My wife likes
 * comedies. What should we watch?" mapped to `genreIds: []` and
 * `requiredSubjects: ['comedies']`. The canonical reading was right — a genre,
 * wanted — but `genreIdFromName` matches TMDB's own names, which are singular,
 * so every plural fell through the mapper's unmapped-genre fallback and became
 * a STRICT SUBJECT. That is not a near miss: a subject demands the word be
 * CENTRAL to the title's own evidence, so "comedies" asked the catalog for
 * films about comedies rather than for comedies.
 *
 * It is not about comedy. Every plural genre name in English does it, which is
 * why the fix is one morphological rule at the canonical vocabulary boundary
 * and not a table of plurals.
 *
 * AND ITS NEIGHBOUR: "recommend thrillers" bound the SUBJECT "recommend". The
 * qualifier guard in the subject extractor was a hand-kept list that had
 * drifted from the request vocabulary the clause architecture already owns —
 * it knew `want`, `find` and `show` but not `recommend`, `suggest`, `need` or
 * `get`. Both lists now come from one place.
 */
import { describe, it, expect } from 'vitest';
import { interpret } from './interpret';
import { intentToQuery } from '@/lib/ask/canonicalExecution';
import { REQUEST_VERBS } from './clauses';

const mapped = (text: string) => {
  const intent = interpret(text);
  const m = intentToQuery(intent) as unknown as {
    query: { genreIds: number[] };
    pending: { requiredSubjects: string[] };
  };
  return { intent, genreIds: m.query.genreIds, subjects: m.pending.requiredSubjects };
};

describe('plural genre names reach the genre filter', () => {
  const PAIRS: [string, string][] = [
    ['comedy', 'comedies'],
    ['thriller', 'thrillers'],
    ['drama', 'dramas'],
    ['western', 'westerns'],
    ['mystery', 'mysteries'],
    ['horror', 'horrors'],
    ['romance', 'romances'],
    ['documentary', 'documentaries'],
  ];

  it('the plural resolves to the same genre id as the singular', () => {
    for (const [one, many] of PAIRS) {
      const s = mapped(`I want a ${one}`);
      const p = mapped(`I want ${many}`);
      expect(s.genreIds.length, `singular "${one}" did not map`).toBeGreaterThan(0);
      expect(p.genreIds, `plural "${many}"`).toEqual(s.genreIds);
    }
  });

  it('and is NOT demoted to a strict subject, which would demand it be central', () => {
    for (const [, many] of PAIRS) {
      expect(mapped(`I want ${many}`).subjects, many).toEqual([]);
    }
  });

  it('the companion sentence the harness caught maps to a genre, not a subject', () => {
    const m = mapped('My wife likes comedies. What should we watch?');
    expect(m.genreIds.length).toBeGreaterThan(0);
    expect(m.subjects).toEqual([]);
  });

  it('a genuine subject is still a subject — the fallback is not removed', () => {
    const m = mapped('movies about chess');
    expect(m.subjects).toEqual(['chess']);
  });

  it('a word that is not a genre at all is still a subject', () => {
    expect(mapped('a boxing movie').subjects).toEqual(['boxing']);
  });
});

describe('a request verb is not a subject', () => {
  it('the sentence that exposed it', () => {
    const m = mapped('recommend thrillers');
    expect(m.subjects, 'the verb became the topic of the search').toEqual([]);
    expect(m.genreIds.length).toBeGreaterThan(0);
  });

  it('holds for every verb the clause architecture calls a request', () => {
    for (const verb of REQUEST_VERBS) {
      if (verb.includes(' ')) continue; // multi-word cues cannot be a qualifier
      const m = mapped(`${verb} thrillers`);
      expect(m.subjects, `"${verb} thrillers"`).toEqual([]);
    }
  });

  it('a real qualifier in the same shape still binds', () => {
    expect(mapped('another courtroom drama').subjects).toEqual(['courtroom']);
    expect(mapped('a political thriller').subjects).toEqual(['political']);
  });
});

/**
 * A TONE VERB IS THE SAME PROBLEM IN A DIFFERENT VOCABULARY.
 *
 * `drag` was listed and `drags` was not, so "a comedy that does not drag" kept
 * the constraint and "I want a thriller, nothing that drags" — the way anyone
 * actually says it — dropped it. Verbs now carry their inflections by
 * construction, and every form records the base term so downstream sees one
 * word rather than four.
 */
describe('a tone verb is recognised however it is inflected', () => {
  const toneOf = (text: string, term: string) =>
    interpret(text).tones.find((t) => t.term === term);

  it('the sentence that exposed it', () => {
    const t = toneOf('I want a thriller, nothing that drags', 'drag');
    expect(t, 'the constraint was dropped entirely').toBeDefined();
    expect(t!.wanted).toBe(false);
  });

  it('every inflection binds, and all of them record the base term', () => {
    for (const form of ['drag', 'drags', 'dragging', 'dragged', 'draggy']) {
      const t = toneOf(`a comedy that is ${form}`, 'drag') ?? toneOf(`a comedy that ${form}`, 'drag');
      expect(t, form).toBeDefined();
    }
  });

  it('polarity survives the inflection', () => {
    expect(toneOf('a movie that drags', 'drag')!.wanted).toBe(true);
    expect(toneOf('a comedy that does not drag', 'drag')!.wanted).toBe(false);
    expect(toneOf('I want a drama, nothing that drags', 'drag')!.wanted).toBe(false);
  });

  it('the adjectives the earlier pass added still work, both ways', () => {
    expect(toneOf('I want a comedy, nothing dumb', 'dumb')!.wanted).toBe(false);
    expect(toneOf('a thriller, nothing gory', 'gory')!.wanted).toBe(false);
    expect(toneOf('something good, not too long', 'long')!.wanted).toBe(false);
    expect(toneOf('something long', 'long')!.wanted).toBe(true);
  });

  it('does not invent a tone from an unrelated word', () => {
    expect(interpret('a movie about a drag queen').tones.map((t) => t.term)).not.toContain('dragqueen');
    expect(toneOf('I want a thriller', 'drag')).toBeUndefined();
  });
});

/**
 * A WORD THAT CANNOT MODIFY A NOUN CANNOT BE THE TOPIC OF ONE.
 *
 * THE DEFECT, FOUND WHILE BUILDING THE NL ACCEPTANCE MATRIX. "anything except
 * horror" bound the SUBJECT "except". The genre layer read the sentence
 * correctly — horror, vetoed — and then the subject extractor read the
 * exclusion marker itself as the topic, so the request executed as "titles
 * about except, excluding horror" and the catalog had nothing to say.
 *
 * It is not about `except`. The pre-nominal rule is "<word> <media|genre>",
 * and its guard was a hand-kept list of determiners, numerals and request
 * verbs. English also puts CLOSED-CLASS words in that slot — coordinators
 * ("movies AND shows"), exclusion markers ("anything BUT horror", "something
 * BESIDES comedy") and plain prepositions ("a movie WITH drama"). A
 * closed-class word links, negates or relates; it is grammatically incapable
 * of modifying the noun it precedes, so it can never be that noun's topic.
 * The set is finite and closed — that is what makes stating it a grammatical
 * rule rather than a list of sentences someone tripped over.
 *
 * The exclusion members are DERIVED from the negation vocabulary this file
 * already declares, so a negator added there can never resurface here as a
 * topic. That is the third time one vocabulary kept in two places has drifted
 * in this parser, and the last place it could.
 *
 * AND ITS NEIGHBOUR, THE HALF-COVERED TONE AXIS: "a smart thriller" bound the
 * SUBJECT "smart". `dumb`, `cerebral` and `challenging` were already tone
 * words; `smart` and `clever` — the ordinary way to say the other end of the
 * same axis — were not, so an evaluative adjective became an aboutness filter.
 * A tone with no execution home is DISCLOSED, which is the honest outcome; a
 * fabricated subject is not.
 */
describe('a closed-class word is never a subject', () => {
  it('the sentence that exposed it', () => {
    const m = mapped('anything except horror');
    expect(m.subjects, 'the exclusion marker became the topic').toEqual([]);
    expect(interpret('anything except horror').genres).toEqual([
      expect.objectContaining({ span: 'horror', wanted: false }),
    ]);
  });

  it('holds across the closed classes English puts in that slot', () => {
    expect(mapped('anything but horror').subjects, 'coordinator').toEqual([]);
    expect(mapped('something besides comedy').subjects, 'exclusion preposition').toEqual([]);
    expect(mapped('a movie with drama').subjects, 'preposition').toEqual([]);
    expect(mapped('a thriller or drama').subjects, 'coordinator').toEqual([]);
    expect(mapped('excluding horror movies').subjects, 'derived from NEGATORS').toEqual([]);
  });

  it('a coordinator between two media nouns is not the topic of the request', () => {
    // The subject gate is conjunctive: `and` alongside `chess` demanded every
    // title be about both, so the real topic could never be satisfied.
    expect(mapped('I want movies and shows about chess').subjects).toEqual(['chess']);
  });

  it('an evaluative adjective is a tone, disclosed — not a topic, invented', () => {
    const smart = interpret('a smart thriller');
    expect(smart.subjects.map((s) => s.span)).toEqual([]);
    expect(smart.tones.map((t) => t.term)).toContain('smart');
    expect(mapped('I had a beef burrito for dinner and I want a smart thriller.').subjects).toEqual([]);
    expect(interpret('a clever comedy').tones.map((t) => t.term)).toContain('clever');
  });

  it('a real qualifier in the same shape still binds', () => {
    expect(mapped('another courtroom drama').subjects).toEqual(['courtroom']);
    expect(mapped('a political thriller').subjects).toEqual(['political']);
    expect(mapped('three good heist movies').subjects).toEqual(['heist']);
    expect(mapped('movies about chess').subjects).toEqual(['chess']);
    expect(mapped('another boxing movie').subjects).toEqual(['boxing']);
  });
});
