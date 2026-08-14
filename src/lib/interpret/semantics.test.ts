import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { interpret } from './interpret';
import { executable } from './types';

/**
 * THE DISTINCTIONS A GOOD HUMAN LISTENER WOULD DRAW.
 *
 * Counts belong to the order, not to the anecdote. Negation stays negative.
 * Naming a film is not asking for it. Each of these is a place where a parser
 * that flattens language into search terms produces a confidently wrong answer
 * rather than a broad one.
 */

describe('counts belong to the request, not to autobiography', () => {
  it('reads the count from the order', () => {
    expect(interpret('Give me three boxing movies.').requestedCount).toBe(3);
    expect(interpret('3 Sylvester Stallone movies').requestedCount).toBe(3);
    expect(interpret('give me three Stallone movies').requestedCount).toBe(3);
    expect(interpret('five movies with Denzel').requestedCount).toBe(5);
    expect(interpret('Show me 5 Tom Hanks movies I haven’t already rated.').requestedCount).toBe(5);
  });

  it('reads loose counts people actually use', () => {
    expect(interpret('a couple of boxing movies').requestedCount).toBe(2);
    expect(interpret('give me a few heist movies').requestedCount).toBe(3);
  });

  it('NEVER takes a number from a background or taste clause', () => {
    /*
     * THE CASE THAT MOTIVATES SCOPING COUNTS AT ALL. Both sentences contain a
     * number and a media noun; only one of them is an order. A parser that
     * scans the whole utterance for "<number> movies" returns three results to
     * someone who asked for one, and looks like it was not listening.
     */
    const out = interpret('I watched 3 movies yesterday. Give me a Stallone movie.');
    expect(out.requestedCount, 'a number from autobiography became the result count').not.toBe(3);
    expect(out.requestedCount).toBe(1);
  });

  it('ignores an autobiographical count even when it comes LAST', () => {
    /*
     * Ordering matters to this guard. When the anecdote comes first, the real
     * order is the later clause and wins on recency alone — so that sentence
     * cannot tell a working scope rule from a broken one. Here the anecdote
     * trails the request, which is how people actually tail off, and only the
     * clause's ROLE keeps its number out of the result count.
     */
    const out = interpret('Give me a Stallone movie. I watched 3 movies yesterday.');
    expect(out.requestedCount, 'a trailing anecdote set the result count').toBe(1);
    const alone = interpret('Give me a Stallone movie.');
    expect(executable(out)).toEqual(executable(alone));
  });

  it('is null when no count was given, never a silent default', () => {
    expect(interpret('Give me a boxing movie.').requestedCount).toBe(1);
    expect(interpret("I'm looking for something funny.").requestedCount).toBeNull();
  });

  it('ignores numbers in irrelevant conversation entirely', () => {
    const alone = interpret('Give me three boxing movies.');
    const noisy = interpret('I have 4 emails to answer. Give me three boxing movies.');
    expect(noisy.requestedCount).toBe(alone.requestedCount);
  });
});

describe('negation never becomes its positive', () => {
  const cases: Array<[string, string]> = [
    ['Give me a thriller, not horror.', 'horror'],
    ['Anything except horror.', 'horror'],
    ['Give me a mystery, no supernatural.', 'supernatural'],
    ['A crime movie without serial killers.', 'serial killers'],
  ];

  for (const [text, term] of cases) {
    it(`"${text}" excludes ${term}`, () => {
      const out = interpret(text);
      const positive = [
        ...out.genres.filter((g) => g.wanted).map((g) => g.span),
        ...out.subjects.filter((s) => s.wanted).map((s) => s.span),
        ...out.tones.filter((t) => t.wanted).map((t) => t.term),
      ].join(' ');
      expect(positive, `"${term}" was requested when it was refused`).not.toContain(term.split(' ')[0]!);

      const negative = [
        ...out.genres.filter((g) => !g.wanted).map((g) => g.span),
        ...out.subjects.filter((s) => !s.wanted).map((s) => s.span),
        ...out.tones.filter((t) => !t.wanted).map((t) => t.term),
      ].join(' ');
      expect(negative, `the refusal of "${term}" was dropped entirely`).toContain(term.split(' ')[0]!);
    });
  }

  it('"nothing too depressing" is a refusal, not a request for depressing', () => {
    const out = interpret('Nothing too depressing. Maybe a mystery.');
    const depressing = out.tones.find((t) => t.term === 'depressing');
    expect(depressing?.wanted, 'a refusal became a request').not.toBe(true);
  });

  it('a refused person is excluded, not required', () => {
    const out = interpret('Give me an action movie, but not Stallone.');
    const required = out.people.filter((p) => p.relation === 'required').map((p) => p.span);
    expect(required.join(' '), 'a refused person became a requirement').not.toContain('Stallone');
  });
});

describe('naming a film is not asking for it', () => {
  it('"I liked Rocky" is taste evidence, not the answer', () => {
    const out = interpret('I liked Rocky.');
    expect(out.titles[0]!.relation).toBe('liked');
    expect(out.kind, 'a statement was treated as a request').toBe('statement');
  });

  it('"Something like Rocky" asks for neighbours', () => {
    const out = interpret('Give me something like Rocky.');
    expect(out.titles.some((t) => /rocky/i.test(t.span) && t.relation === 'similar')).toBe(true);
    expect(out.kind).toBe('recommendation');
  });

  it('"Better than Rocky" is a bar, not a neighbourhood', () => {
    const out = interpret('Give me a boxing movie better than Rocky.');
    expect(out.titles.some((t) => /rocky/i.test(t.span) && t.relation === 'betterThan')).toBe(true);
  });

  it('a mentioned film does not hijack a different request', () => {
    /*
     * THE ONE THAT MATTERS MOST. Rocky is named, and the request is about
     * baseball. A similarity search on Rocky would be a confident, plausible,
     * wrong answer — and it is what any parser that treats "a title was
     * mentioned" as "find things like it" would produce.
     */
    const out = interpret('I watched Rocky three weeks ago but tonight I want a baseball movie.');
    const rocky = out.titles.find((t) => /rocky/i.test(t.span));
    expect(rocky, 'the reference was lost').toBeDefined();
    expect(rocky!.relation, 'a past watch became a similarity search').not.toBe('similar');
    expect(out.subjects.some((s) => s.span === 'baseball' && s.wanted), 'the actual request was lost').toBe(true);
  });

  it('the burrito sentence resolves the way a person would read it', () => {
    const out = interpret(
      "Had a beef burrito for dinner, I liked Rocky a few weeks ago, I'm looking for another boxing movie.",
    );
    expect(out.kind).toBe('recommendation');
    expect(out.media).toBe('movie');
    expect(out.subjects.some((s) => s.span === 'boxing' && s.wanted)).toBe(true);
    expect(out.titles.some((t) => /rocky/i.test(t.span) && t.relation === 'liked')).toBe(true);
    // "another" means not the one just named.
    expect(out.excludeSeen).toBe(true);
    expect(out.background.some((b) => /burrito/i.test(b.text))).toBe(true);
    expect(JSON.stringify(executable(out)), 'food reached the search').not.toMatch(/burrito|beef|dinner/i);
  });
});

describe('interpretation is independent of the serving mode', () => {
  const MODES = ['legacy', 'shadow', 'anthropic', ''];
  const original = process.env.AI_DISCOVERY_MODE;
  afterEach(() => {
    if (original === undefined) delete process.env.AI_DISCOVERY_MODE;
    else process.env.AI_DISCOVERY_MODE = original;
  });

  const SENTENCES = [
    "Had a beef burrito for dinner, I liked Rocky a few weeks ago, I'm looking for another boxing movie.",
    '3 Sylvester Stallone movies',
    'Give me three funny Sandra Bullock movies after 2005.',
    'I loved Heat. Give me something like it but newer.',
    'My wife hates horror, give us something funny tonight.',
  ];

  it('produces byte-identical intent under every mode', () => {
    for (const sentence of SENTENCES) {
      const results = MODES.map((mode) => {
        if (mode) process.env.AI_DISCOVERY_MODE = mode;
        else delete process.env.AI_DISCOVERY_MODE;
        return JSON.stringify(interpret(sentence));
      });
      expect(new Set(results).size, `"${sentence}" meant different things under different modes`).toBe(1);
    }
  });

  it('does not read the environment at all', () => {
    /*
     * Structural, not behavioural: interpretation sits ABOVE the provider
     * choice, so it must not be able to consult it even accidentally. A module
     * that never imports env cannot vary with it.
     */
    const root = join(__dirname, '..', '..', '..');
    for (const f of ['src/lib/interpret/interpret.ts', 'src/lib/interpret/clauses.ts', 'src/lib/interpret/types.ts']) {
      const src = readFileSync(join(root, f), 'utf8');
      expect(src, `${f} reads configuration`).not.toMatch(/process\.env|serverEnv|publicEnv|aiDiscoveryMode/);
    }
  });
});

describe('compound requests keep every constraint at once', () => {
  it('three funny Sandra Bullock movies after 2005', () => {
    const out = interpret('Give me three funny Sandra Bullock movies after 2005.');
    expect(out.requestedCount).toBe(3);
    expect(out.media).toBe('movie');
    expect(out.tones.some((t) => t.term === 'funny' && t.wanted)).toBe(true);
    expect(out.people.some((p) => /sandra bullock/i.test(p.span) && p.relation === 'required')).toBe(true);
    expect(out.date.minYear).toBe(2005);
  });

  it('two boxing movies under two hours', () => {
    const out = interpret('Find me two boxing movies under two hours.');
    expect(out.requestedCount).toBe(2);
    expect(out.subjects.some((s) => s.span === 'boxing' && s.wanted)).toBe(true);
    expect(out.runtime.maxMinutes).toBe(120);
  });

  it('crime movies on Max that I haven’t already seen', () => {
    const out = interpret('Give me 5 crime movies on Max that I haven’t already seen.');
    expect(out.requestedCount).toBe(5);
    expect(out.genres.some((g) => g.span === 'crime' && g.wanted)).toBe(true);
    expect(out.providers).toContain('max');
    expect(out.excludeSeen).toBe(true);
  });

  it('Tom Hanks movies from the 1990s', () => {
    const out = interpret('Three Tom Hanks movies from the 1990s.');
    expect(out.requestedCount).toBe(3);
    expect(out.people.some((p) => /tom hanks/i.test(p.span))).toBe(true);
    expect(out.date.minYear).toBe(1990);
    expect(out.date.maxYear).toBe(1999);
  });
});
