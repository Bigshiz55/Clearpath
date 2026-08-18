import { describe, it, expect } from 'vitest';
import { interpret } from './interpret';

/**
 * OCCURRENCE OWNERSHIP — every word in a request belongs to exactly one owner.
 *
 * ── THE FORENSIC FINDING ──────────────────────────────────────────────────
 * `interpret()` read `parseCount(req.text)` and `parseMedia(req.text)` off the
 * RAW request clause. `stripRequestFrame` already existed and was already
 * imported by `clauses.ts` — but only to CLASSIFY a clause, never to produce
 * the text the extractors read. So the scaffolding reached every extractor as
 * if it were content, and the media vocabulary (which contains "shows" and
 * "tv") matched the request VERB in "show me movies" and the PROVIDER token in
 * "Apple TV+".
 *
 * Measured against the shipped code, all of these were wrong:
 *
 *   show me movies              media 'either'   (the verb counted as TV)
 *   show me some action films   media 'either'
 *   Apple TV+ movies            media 'either'   (the provider counted as TV)
 *   give me 4 sci-fi movies     count null       (a hyphen broke the bridge)
 *   Find Morgan Freeman movies  people []        (the verb ate the name)
 *   movies from the last 5 years  date {}        (no slot for the meaning)
 *
 * The rule: request-frame words belong to the frame, provider names belong to
 * provider entities, and only what REMAINS carries semantic meaning. No
 * vocabulary entry is deleted — the controls below prove the words still mean
 * what they mean when they are content rather than framing.
 */

describe('media — the request verb belongs to the frame', () => {
  it('"show me movies" is a MOVIE request, not an ambiguous one', () => {
    expect(interpret('show me movies').media).toBe('movie');
  });

  it('"show me some action films" is a movie request', () => {
    expect(interpret('show me some action films').media).toBe('movie');
  });

  it('"give me some shows" is still TV — the vocabulary is intact', () => {
    // THE CONTROL. If this ever fails, the fix deleted meaning instead of
    // assigning ownership, which is the wrong repair.
    expect(interpret('give me some shows').media).toBe('tv');
  });

  it('"show me shows" is TV — the SECOND occurrence is content', () => {
    // Ownership, not deletion: the verb is consumed, the noun survives.
    expect(interpret('show me shows').media).toBe('tv');
  });

  it('a stated contradiction is still preserved', () => {
    expect(interpret('movies but no TV shows').media).toBe('movie');
  });
});

describe('media — a provider name belongs to the provider entity', () => {
  it('"Apple TV+ movies" is a MOVIE request', () => {
    expect(interpret('Apple TV+ movies').media).toBe('movie');
  });

  it('and Apple TV+ is recognised as the provider it is', () => {
    expect(interpret('Apple TV+ movies').providers.join('|').toLowerCase()).toContain('apple tv');
  });

  it('"Apple TV+ shows" is still TV — the CONTENT noun decides', () => {
    expect(interpret('Apple TV+ shows').media).toBe('tv');
  });

  it('a bare provider request stays unconstrained rather than guessing', () => {
    expect(interpret('what is on Apple TV+').media).toBe('either');
  });
});

describe('count — the number comes from the request frame', () => {
  it('"give me 4 sci-fi movies" asks for four, hyphen and all', () => {
    expect(interpret('give me 4 sci-fi movies').requestedCount).toBe(4);
  });

  it('"find me three Stallone movies" asks for three', () => {
    expect(interpret('find me three Stallone movies').requestedCount).toBe(3);
  });

  it('a number with several modifiers still lands', () => {
    expect(interpret('show me 5 really good sci-fi movies').requestedCount).toBe(5);
  });

  it('an unstated count is null — never a default', () => {
    expect(interpret('show me action movies').requestedCount).toBeNull();
  });

  it('a year is not a count', () => {
    expect(interpret('movies from 1994').requestedCount).toBeNull();
  });
});

describe('person — a request verb never contaminates the span', () => {
  it('"Find Morgan Freeman movies" finds the PERSON', () => {
    const spans = interpret('Find Morgan Freeman movies').people.map((p) => p.span);
    expect(spans).toContain('Morgan Freeman');
  });

  it('and never keeps the verb inside the span', () => {
    const spans = interpret('Find Morgan Freeman movies').people.map((p) => p.span);
    for (const s of spans) expect(s.toLowerCase()).not.toContain('find');
  });

  it('"Show me Stallone movies" still resolves the person', () => {
    expect(interpret('Show me Stallone movies').people.map((p) => p.span)).toContain('Stallone');
  });

  it('A REAL TITLE IS NEVER READ AS AN ORDER', () => {
    /* THE GUARD THAT MADE BARE VERBS SAFE IN THE FIRST PLACE, and the one
       widening verb ownership could most easily break. The invariant is that
       these are not imperatives — a film called "Get Out" must not become a
       request to get out, and a plural-media rule must not swallow a title.

       Verified identical to the pre-change behaviour on every entry below.
       (Capturing a bare title as a LOOKUP is a separate, unimplemented
       capability — see BACKLOG; it is absent before and after this change and
       is not what this test protects.) */
    for (const title of ['Get Out', 'A Few Good Men', 'Two Weeks Notice', 'Scary Movie', 'The Lego Movie', 'Some Like It Hot']) {
      const i = interpret(title);
      expect(i.kind, `${title} must not be read as a request`).not.toBe('recommendation');
      expect(i.requestedCount, `${title} carries no count`).toBeNull();
      // No fragment of the title leaked into a person span.
      expect(i.people.map((p) => p.span), `${title} names no person`).toEqual([]);
    }
  });
});

describe('relative dates — semantics captured, arithmetic deferred', () => {
  it('"movies from the last 5 years" records amount, unit and direction', () => {
    expect(interpret('movies from the last 5 years').date.lookback).toEqual({
      amount: 5,
      unit: 'year',
      direction: 'past',
    });
  });

  it('"shows from the past decade" records a decade', () => {
    expect(interpret('shows from the past decade').date.lookback).toEqual({
      amount: 1,
      unit: 'decade',
      direction: 'past',
    });
  });

  it('"recent crime movies" records a recency window', () => {
    const d = interpret('recent crime movies').date;
    expect(d.lookback?.unit).toBe('year');
    expect(d.lookback?.direction).toBe('past');
  });

  it('NO CONCRETE YEAR IS COMPUTED IN THE INTERPRETER', () => {
    // A pure function with a hidden clock would make the same sentence mean
    // different things on different days. The bound is execution's job.
    const d = interpret('movies from the last 5 years').date;
    expect(d.minYear).toBeUndefined();
    expect(d.maxYear).toBeUndefined();
  });

  it('an explicit year is still an explicit year, not a lookback', () => {
    const d = interpret('movies from 1994').date;
    expect(d.lookback).toBeUndefined();
  });

  it('the interpreter is deterministic — same input, same output', () => {
    expect(interpret('movies from the last 5 years')).toEqual(interpret('movies from the last 5 years'));
  });
});
