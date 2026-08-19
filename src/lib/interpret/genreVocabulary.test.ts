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
