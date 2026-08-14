import { describe, it, expect } from 'vitest';
import { interpret } from './interpret';
import { classifyClause } from './clauses';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * SEMANTIC ROLE OWNERSHIP — ONE OCCURRENCE, ONE ROLE.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Within a single interpretation pass, a particular occurrence of language
 * assigned to an entity role may not ALSO be emitted as a generic content
 * subject. "Sylvester Stallone" is a person; it is not additionally a subject
 * called "stallone".
 *
 * This is one of two independent manifestations of the same ownership defect.
 * The legacy `/api/ask` path shows it as a re-read of the full utterance after
 * a person was already resolved (addressed separately). This file owns the
 * CANONICAL interpreter's manifestation, which needs no route at all — it is
 * visible in a direct `interpret()` call.
 *
 * The rule is deliberately NOT "if a person exists, drop all subjects": cases C
 * and D require a person AND a real subject simultaneously. It is also NOT a
 * vocabulary of performer names. It is occurrence ownership — a subject
 * candidate is refused only when its source range overlaps language already
 * spent on a person.
 */

const positiveSubjects = (r: ReturnType<typeof interpret>) =>
  r.kind === 'recommendation' ? r.subjects.filter((s) => s.wanted).map((s) => s.span.toLowerCase()) : [];
const people = (r: ReturnType<typeof interpret>) =>
  r.kind === 'recommendation' ? r.people.map((p) => p.span) : [];

/** No emitted subject may be derived from the person's own name. */
function expectNoPersonDerivedSubject(r: ReturnType<typeof interpret>, nameParts: string[]) {
  for (const s of positiveSubjects(r)) {
    for (const part of nameParts) {
      expect(s, `"${s}" is the person's own name spent again as a subject`).not.toContain(part.toLowerCase());
    }
  }
}

describe('A — an anecdote count must not steal the request, and the person is not a subject', () => {
  const r = interpret('I watched 3 movies yesterday. Give me a Sylvester Stallone movie.');
  it('is a movie recommendation for exactly one', () => {
    expect(r.kind).toBe('recommendation');
    if (r.kind !== 'recommendation') return;
    expect(r.media).toBe('movie');
    expect(r.requestedCount, 'the background "3 movies" was mistaken for the ask').toBe(1);
  });
  it('carries the person', () => expect(people(r)).toContain('Sylvester Stallone'));
  it('emits NO Stallone-derived subject', () => expectNoPersonDerivedSubject(r, ['stallone', 'sylvester']));
});

describe('B — the production incident', () => {
  const r = interpret('3 Sylvester Stallone movies');
  it('is a movie recommendation for exactly three', () => {
    expect(r.kind).toBe('recommendation');
    if (r.kind !== 'recommendation') return;
    expect(r.media).toBe('movie');
    expect(r.requestedCount).toBe(3);
  });
  it('carries the person', () => expect(people(r)).toContain('Sylvester Stallone'));
  it('emits NO Stallone-derived subject', () => expectNoPersonDerivedSubject(r, ['stallone', 'sylvester']));
});

describe('C — a person AND a real subject must coexist', () => {
  const r = interpret('a Tom Hanks courtroom movie');
  it('is a movie recommendation for one', () => {
    expect(r.kind).toBe('recommendation');
    if (r.kind !== 'recommendation') return;
    expect(r.media).toBe('movie');
    expect(r.requestedCount).toBe(1);
  });
  it('carries the person', () => expect(people(r)).toContain('Tom Hanks'));
  it('keeps the real subject', () => expect(positiveSubjects(r)).toContain('courtroom'));
  it('does not spend the name as a subject', () => expectNoPersonDerivedSubject(r, ['hanks', 'tom']));
});

describe('D — the same, with a curated subject', () => {
  const r = interpret('a Sylvester Stallone boxing movie');
  it('is a movie recommendation for one', () => {
    expect(r.kind).toBe('recommendation');
    if (r.kind !== 'recommendation') return;
    expect(r.media).toBe('movie');
    expect(r.requestedCount).toBe(1);
  });
  it('carries the person', () => expect(people(r)).toContain('Sylvester Stallone'));
  it('keeps the real subject', () => expect(positiveSubjects(r)).toContain('boxing'));
  it('does not spend the name as a subject', () => expectNoPersonDerivedSubject(r, ['stallone', 'sylvester']));
});

describe('controls — the new rules must not over-reach', () => {
  it('a bare subject noun phrase needs no person', () => {
    const r = interpret('a courtroom movie');
    expect(r.kind).toBe('recommendation');
    expect(positiveSubjects(r)).toContain('courtroom');
    expect(people(r)).toEqual([]);
  });

  it('"a horror show" is NOT promoted by the bare-movie-noun rule', () => {
    // A named existing regression: `show` is also an ordinary noun, so the new
    // bare noun-phrase form is limited to unambiguous movie nouns.
    const r = interpret('a horror show');
    expect(r.kind, 'a horror show became an order').not.toBe('recommendation');
  });

  it('a capitalised TITLE is not relabelled as a person', () => {
    for (const t of ['A Few Good Men', 'Get Out', 'The Holiday']) {
      const r = interpret(t);
      if (r.kind !== 'recommendation') continue;
      expect(r.people.map((p) => p.span), `${t} was read as a person`).toEqual([]);
    }
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════════
 * DEFECT 1B — A TITLE THAT ENDS IN "MOVIE" IS NOT A NOUN PHRASE.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The bare noun-phrase rule matches `article + description + movie`. So does
 * "The Lego Movie". The leading article was claimed as the safety property
 * that kept titles out; it is not one — it only excludes titles that happen to
 * lack an article, which is why "Get Out" and "A Few Good Men" passed and gave
 * false confidence.
 *
 * Measured at f7eac49:
 *   "The Lego Movie"  -> recommendation, subjects ["lego"]
 *   "A Goofy Movie"   -> recommendation, count 1, subjects ["goofy"]
 *
 * Both would execute a content search for a word lifted out of a title. The
 * canonical layer's own principle applies: a miss should lose a reference
 * rather than confidently invent one.
 *
 * Asserted at BOTH levels, because they can diverge — the clause role is what
 * the bare rule decides, and the emitted subject is what reaches execution.
 * Fixing only the second would leave the wrong role in place for the adapter.
 */
describe('1b — titles ending in a media noun are not recommendation noun phrases', () => {
  for (const title of ['The Lego Movie', 'A Goofy Movie']) {
    it(`"${title}" is not promoted to a request clause`, () => {
      expect(classifyClause(title), `${title} was classified as an order`).not.toBe('request');
    });

    it(`"${title}" never yields a subject lifted from its own name`, () => {
      const r = interpret(title);
      const subs = r.kind === 'recommendation' ? r.subjects.filter((s) => s.wanted).map((s) => s.span.toLowerCase()) : [];
      for (const word of title.toLowerCase().replace(/\b(the|a|movie)\b/g, '').trim().split(/\s+/).filter(Boolean)) {
        expect(subs, `"${word}" was lifted out of the title and made an executable subject`).not.toContain(word);
      }
    });

    it(`"${title}" is not relabelled as a person`, () => {
      const r = interpret(title);
      const ppl = r.kind === 'recommendation' ? r.people.map((p) => p.span) : [];
      expect(ppl, `${title} was read as a person`).toEqual([]);
    });
  }
});

/**
 * The person matcher must refuse article-led title-shaped language on its own,
 * independently of the bare-clause rule — an explicit request frame promotes
 * the clause, so the 1b classifier never sees it.
 */
describe('the person matcher refuses article-led title language', () => {
  for (const q of ['Show me The Lego Movie', 'Give me A Goofy Movie']) {
    it(`"${q}" invents no person`, () => {
      const r = interpret(q);
      const ppl = r.kind === 'recommendation' ? r.people.map((p) => p.span) : [];
      for (const bad of ['The Lego', 'A Goofy', 'Lego', 'Goofy']) {
        expect(ppl, `${q} produced person "${bad}"`).not.toContain(bad);
      }
    });
  }
});

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ARTICLE_LED'S ACTUAL CONTRACT — proven, not assumed.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Removing ARTICLE_LED once killed zero tests, and the reason was not that the
 * guard is useless — it was that the guard never ran. All three person matchers
 * spell their media nouns lowercase with no `i` flag, so "The Lego Movie" with
 * a capital M never reaches a person matcher at all. The capital-M cases are
 * held by media-noun case sensitivity; ARTICLE_LED had no opportunity to act.
 *
 * These lowercase variants give it that opportunity, and it demonstrably acts:
 *
 *   "Show me The Lego movie"   with ARTICLE_LED -> people ["Lego"]
 *                              without          -> people ["The Lego"]
 *
 * So the contract is narrow and real: ONCE an article-led capitalised phrase
 * reaches a person matcher, reject it as title-shaped. It is not what protects
 * the capital-M spellings, and this file no longer implies that it is.
 */
describe('ARTICLE_LED rejects article-led title language that reaches a matcher', () => {
  for (const q of ['The Lego movie', 'A Goofy movie', 'Show me The Lego movie']) {
    it(`"${q}" never emits the article-led phrase as a person`, () => {
      const r = interpret(q);
      const ppl = r.kind === 'recommendation' ? r.people.map((p) => p.span) : [];
      for (const bad of ['The Lego', 'A Goofy']) {
        expect(ppl, `${q} emitted article-led "${bad}" as a person`).not.toContain(bad);
      }
    });
  }
});
