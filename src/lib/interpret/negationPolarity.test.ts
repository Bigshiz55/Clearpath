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

/**
 * "LESS X" RULES X OUT. IT DID THE OPPOSITE — TWICE.
 *
 * First as a language gap: "something like that but less dumb" recorded
 * `dumb: WANTED`, "something less slow" the same, and "less gory"/"less
 * violent"/"less scary" recorded nothing at all. One phrasing, two wrong
 * answers, and the worse of them is the reversal the negation architecture
 * exists to prevent.
 *
 * Then as a toolchain defect the first fix itself shipped: the diminisher was
 * interpolated into a PLAIN template literal, SWC constant-folded it into a
 * string and mis-escaped `\b` into a literal backspace, and the deployed
 * regex matched nothing — every "no X" on /api/ask inverted while this suite
 * stayed green, because vitest runs unminified source. These tests therefore
 * prove the LANGUAGE, and `scripts/verify/bundleEscapes.mjs` (postbuild)
 * proves the EMISSION; neither can stand in for the other.
 *
 * The vocabulary lives once, in `DIMINISHER` (clauses.ts), consumed by the
 * clause layer (a diminishing fragment is a request) and the polarity layer
 * (a diminisher scopes like a negator). Media polarity deliberately does NOT
 * learn these words: "fewer movies" is not "no movies" — a diminisher rules
 * out an attribute, never a whole medium.
 */
describe('a diminisher rules the axis end out', () => {
  const toneOf = (text: string, term: string) =>
    interpret(text).tones.find((t) => t.term === term);

  it('the sentences that exposed it', () => {
    expect(toneOf('something like that but less dumb', 'dumb')?.wanted, 'recorded as WANTED').toBe(false);
    expect(toneOf('something less slow', 'slow')?.wanted).toBe(false);
  });

  it('every ordinary way of saying it', () => {
    for (const text of [
      'I want a comedy, less gory',
      'a thriller, less violent',
      'something a bit less dark',
      'a movie that is less scary',
      'a drama, a little less bleak',
    ]) {
      const t = interpret(text).tones;
      expect(t.length, `"${text}" recorded no tone at all`).toBeGreaterThan(0);
      expect(t.every((x) => x.wanted === false), `"${text}" → ${JSON.stringify(t)}`).toBe(true);
    }
  });

  it('"more X" still means X, so the diminisher is a direction and not a blanket', () => {
    expect(toneOf('something more funny', 'funny')?.wanted).toBe(true);
    expect(toneOf('I want a more gritty thriller', 'gritty')?.wanted).toBe(true);
    expect(toneOf('a movie that is more violent', 'violent')?.wanted).toBe(true);
  });

  it('a genre is diminished the same way a tone is', () => {
    const g = interpret('a thriller with less romance').genres.find((x) => x.span === 'romance');
    expect(g?.wanted).toBe(false);
  });

  it('a diminisher rules out an attribute, never a medium', () => {
    expect(interpret('fewer movies, more shows').media).toBe('either');
  });

  it('the untouched negators still carry their polarity — the fold killed ALL of them at once', () => {
    // These four are exactly the probes run against the corrupted compiled
    // bundle, where every one returned NO MATCH. They are ordinary negations
    // that never mention a diminisher; the regression class is "the negation
    // regex itself stopped matching", so they pin the whole alternation.
    expect(interpret('Give me a thriller but no supernatural stuff.').genres).toEqual(
      expect.arrayContaining([expect.objectContaining({ span: 'supernatural', wanted: false })]),
    );
    expect(toneOf('I want a thriller, nothing that drags', 'drag')?.wanted).toBe(false);
    expect(toneOf("a thriller that isn't slow", 'slow')?.wanted).toBe(false);
    expect(interpret('no horror').genres).toEqual([
      expect.objectContaining({ span: 'horror', wanted: false }),
    ]);
  });
});

describe('the diminisher never swallows the QUANTITY comparative', () => {
  // "less THAN 90 minutes" is a runtime bound, not a quality veto. Before the
  // lookahead, the diminisher captured "than 90 minutes" as a negated span and
  // `than` reached execution as an excluded SUBJECT — caught in review.
  it('"less than N minutes" stays a runtime bound with no phantom subject', () => {
    for (const text of ['movies less than 90 minutes', 'a thriller less than 2 hours', 'fewer than 3 seasons']) {
      const i = interpret(text);
      expect(i.subjects, `"${text}" → ${JSON.stringify(i.subjects)}`).toEqual([]);
    }
    expect(interpret('movies less than 90 minutes').runtime.maxMinutes).toBe(90);
  });

  it('the quality form still vetoes', () => {
    expect(interpret('a comedy, less gory').tones.find((t) => t.term === 'gory')?.wanted).toBe(false);
  });
});
