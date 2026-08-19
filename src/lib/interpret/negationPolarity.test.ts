import { describe, it, expect } from 'vitest';
import { interpret } from '@/lib/interpret/interpret';
import { intentToQuery } from '@/lib/ask/canonicalExecution';

/**
 * A CONTRACTED NEGATION INVERTED THE REQUEST.
 *
 * "a thriller that isn't slow" produced `slow: true` — not a dropped
 * constraint but a REVERSED one, asking for exactly what the user ruled out.
 * The tone model already carries polarity (`ToneConstraint.wanted`) and
 * `negatedSpans` already scopes negation properly; the negator vocabulary
 * simply had no contracted auxiliaries. "not slow" worked, "isn't slow" did
 * not, and the two mean the same thing.
 *
 * This fixes the vocabulary, not the mechanism. Which FIELD a negation lands
 * in is unchanged: a negated tone stays a tone with `wanted: false`, a negated
 * genre stays a genre with `wanted: false`. A negative preference is not
 * promoted to a hard exclusion here — that distinction belongs to execution,
 * and this test asserts the polarity survives *into* execution rather than
 * stopping at the parser.
 */

describe('contracted negation is negation', () => {
  const NEGATED_TONE: Array<[string, string]> = [
    ["a thriller that isn't slow", 'slow'],
    ['a thriller that is not slow', 'slow'],
    ["a movie that isn't scary", 'scary'],
    ["something that isn't depressing", 'depressing'],
    ["a comedy that isn't dark", 'dark'],
    ["a film that doesn't get gory", 'gory'],
    ["something that won't be violent", 'violent'],
  ];

  for (const [text, term] of NEGATED_TONE) {
    it(`"${text}" marks ${term} unwanted`, () => {
      const tone = interpret(text).tones.find((t) => t.term === term);
      expect(tone, `${text}: ${term} not captured at all`).toBeDefined();
      expect(tone!.wanted, `${text}: ${term} captured but WANTED — the meaning is inverted`).toBe(false);
    });
  }

  it('the uncontracted forms that already worked still work', () => {
    expect(interpret('something not too dark').tones.find((t) => t.term === 'dark')?.wanted).toBe(false);
    expect(interpret('a movie that is not violent').tones.find((t) => t.term === 'violent')?.wanted).toBe(false);
    expect(interpret('something not scary').tones.find((t) => t.term === 'scary')?.wanted).toBe(false);
  });

  it('a POSITIVE tone is still positive — the fix must not invert everything', () => {
    expect(interpret('something funny tonight').tones.find((t) => t.term === 'funny')?.wanted).toBe(true);
    expect(interpret('a slow burn thriller').tones.find((t) => t.term === 'slow')?.wanted).toBe(true);
    expect(interpret('something dark and gritty').tones.find((t) => t.term === 'dark')?.wanted).toBe(true);
  });

  it('negated GENRES keep their polarity too', () => {
    const i = interpret("a movie that isn't horror");
    expect(i.genres.find((g) => g.span === 'horror')?.wanted).toBe(false);
  });

  /* POLARITY MUST REACH EXECUTION. A parser that records `wanted: false` and an
     executor that never reads it is the same defect wearing a nicer hat. */
  it('a negated genre reaches execution as an exclusion, not a filter', () => {
    const mapped = intentToQuery(interpret("a movie that isn't horror") as never);
    const q = mapped.query as unknown as Record<string, unknown>;
    const excluded = (q.excludeGenreIds ?? []) as number[];
    const included = (q.genreIds ?? []) as number[];
    expect(included, 'a ruled-out genre must not become a positive filter').not.toContain(27);
    expect(excluded, 'horror should be excluded downstream').toContain(27);
  });
});
