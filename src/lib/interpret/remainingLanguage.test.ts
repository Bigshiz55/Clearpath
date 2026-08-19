import { describe, it, expect } from 'vitest';
import { interpret } from '@/lib/interpret/interpret';
import { splitClauses, classifyClause } from '@/lib/interpret/clauses';
import { intentToQuery } from '@/lib/ask/canonicalExecution';

/** The final four natural-language defects, each pinned at its own cause. */

describe('A · trailing negative fragments attach to the request', () => {
  const CASES: Array<[string, string]> = [
    ['I want a thriller, nothing scary', 'scary'],
    ['something funny, nothing depressing', 'depressing'],
    ['a comedy tonight, nothing violent', 'violent'],
    ['give me a documentary, nothing sad', 'sad'],
  ];
  for (const [text, term] of CASES) {
    it(`"${text}" keeps ${term} as NOT wanted`, () => {
      const i = interpret(text);
      expect(i.kind, text).toBe('recommendation');
      const tone = i.tones.find((t) => t.term === term);
      expect(tone, `${text}: ${term} never bound`).toBeDefined();
      expect(tone!.wanted, `${text}: ${term} bound as WANTED`).toBe(false);
    });
  }

  it('the polarity survives into the canonical query, not just the parser', () => {
    const mapped = intentToQuery(interpret('I want a thriller, nothing horror') as never);
    const q = mapped.query as unknown as Record<string, unknown>;
    expect(((q.excludeGenreIds ?? []) as number[]), 'horror should be excluded').toContain(27);
  });

  it('a fragment with no request to attach to is still background', () => {
    expect(interpret('nothing scary').kind).not.toBe('recommendation');
  });
});

describe('B · cross-clause taste is classified, not discarded', () => {
  /* "I like Yellowstone. What should I watch?" used to classify its first
     clause as BACKGROUND with reason `no-request-signal` — the reader's one
     piece of evidence, labelled irrelevant. It is now a TASTE clause.

     It is deliberately NOT turned into a title reference. `likeGrammar.test.ts`
     pins that a preference sentence produces zero titles, because a named title
     in that position is something the route tries to RESOLVE, and that
     resolution failing is what produced "Which title did you mean?". Labelling
     the clause correctly is the canonical representation; consuming stored
     taste is the personalization layer's job, not the intent's. */
  it('the preference clause is taste, not background', () => {
    const cs = splitClauses('I like Yellowstone. What should I watch?');
    expect(cs.map((c) => classifyClause(c))).toEqual(['taste', 'request']);
  });

  it('the sentence is still a recommendation request', () => {
    expect(interpret('I like Yellowstone. What should I watch?').kind).toBe('recommendation');
  });

  it('and it manufactures NO title anchor — the fake-anchor contract holds', () => {
    expect(interpret('I like Yellowstone. What should I watch?').titles.map((t) => t.span)).toEqual([]);
    expect(interpret('I like Rocky, what else would I like?').titles.map((t) => t.span)).toEqual([]);
  });

  it('irrelevant background does not become taste evidence', () => {
    const burrito = interpret('I had a burrito and want something fun tonight.');
    expect(burrito.titles.map((t) => t.span), 'a burrito became a title').toHaveLength(0);
    const day = interpret('I had a long day and want something easy tonight.');
    expect(day.titles.map((t) => t.span)).toHaveLength(0);
    const work = interpret('Work was awful — what should I watch?');
    expect(work.titles.map((t) => t.span)).toHaveLength(0);
  });

  it('irrelevant background is NOT classified as taste', () => {
    expect(classifyClause('I had a burrito')).not.toBe('taste');
    expect(classifyClause('Work was awful')).not.toBe('taste');
  });
});

describe('C · a described request is not a count of one', () => {
  const NOT_COUNTED = [
    'a movie my wife and I would both like',
    'a movie that is not too long',
    'a movie without gore',
    'a show my family can watch',
  ];
  for (const text of NOT_COUNTED) {
    it(`"${text}" states no count`, () => {
      expect(interpret(text).requestedCount, text).toBeNull();
    });
  }

  it('an explicit unit request STILL means one', () => {
    expect(interpret('Give me a boxing movie.').requestedCount).toBe(1);
    expect(interpret('how about a Bruce Willis movie').requestedCount).toBe(1);
    expect(interpret('give me just one movie').requestedCount).toBe(1);
  });

  it('explicit numerals are untouched', () => {
    expect(interpret('three Sylvester Stallone movies').requestedCount).toBe(3);
    expect(interpret('give me 5 thrillers').requestedCount).toBe(5);
  });
});

describe('D · the missing tone vocabulary', () => {
  const CASES: Array<[string, string, boolean]> = [
    ['something that is not dumb', 'dumb', false],
    ['a thriller that does not drag', 'drag', false],
    ['a movie without gore', 'gore', false],
    ['a movie that is not too long', 'long', false],
    ['a dumb comedy', 'dumb', true],
    ['a long epic movie', 'long', true],
  ];
  for (const [text, term, wanted] of CASES) {
    it(`"${text}" → ${term}:${wanted}`, () => {
      const tone = interpret(text).tones.find((t) => t.term === term);
      expect(tone, `${text}: ${term} not in the vocabulary`).toBeDefined();
      expect(tone!.wanted, text).toBe(wanted);
    });
  }
});
