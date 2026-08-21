/**
 * TASK #36 LITMUS — the canonical reading of the order's sentences, pinned.
 *
 * These are the PURE half of the litmus: the one interpretation each
 * sentence gets before any surface executes it. The execution half lives at
 * the real route boundaries (askLlmFence.test.ts, finderOwnership.test.ts,
 * airingOwnership.test.ts, boxingRegression.test.ts, the searchIntent/
 * intentCorpus routing suites) — together they prove: one reading, one
 * structured request, no second reader changing meaning downstream.
 */
import { describe, it, expect } from 'vitest';
import { interpret } from './interpret';

describe('one reading per sentence', () => {
  it('"less dumb" is a comparative taste STATEMENT (dumb, unwanted) — never a search term', () => {
    const c = interpret('less dumb');
    expect(c.kind).toBe('statement');
    expect(c.tones).toEqual([{ term: 'dumb', wanted: false, holder: 'user' }]);
  });

  it('"I love slow burns but I hate gore" is taste with BOTH polarities — never a grid', () => {
    const c = interpret('I love slow burns but I hate gore');
    expect(c.kind).toBe('statement');
    expect(c.tones).toContainEqual({ term: 'slow', wanted: true, holder: 'user' });
    expect(c.tones).toContainEqual({ term: 'gore', wanted: false, holder: 'user' });
  });

  it('"a Tom Hanks movie but nothing scary" is ONE reading: the person AND the veto together', () => {
    /* The failure this prevents is two competing interpretations — one arm
       seeing only the person, another only the veto. The canonical layer
       holds both in a single structure; every arm downstream is fenced to
       consult it (ownership.test.ts) rather than re-read the sentence. */
    const c = interpret('a Tom Hanks movie but nothing scary');
    expect(c.people.map((p) => p.span)).toEqual(['Tom Hanks']);
    expect(c.tones).toContainEqual({ term: 'scary', wanted: false, holder: 'user' });
  });

  it('"a funny movie under two hours but not a romance" carries all four constraints in one reading', () => {
    const c = interpret('a funny movie under two hours but not a romance');
    expect(c.kind).toBe('recommendation');
    expect(c.media).toBe('movie');
    expect(c.runtime.maxMinutes).toBe(120);
    expect(c.tones).toContainEqual({ term: 'funny', wanted: true, holder: 'user' });
    expect(c.genres).toContainEqual({ span: 'romance', wanted: false, holder: 'user' });
  });

  it('"I\'m tired of horror, give me a comedy" — the renounced genre is EXCLUDED, never wanted', () => {
    /* The audit's worst find: the owner's NEGATOR_WORDS lacked "tired of"
       (and sick of / never / rather not), so the canonical path executed
       horror as a WANTED genre — a polarity inversion in the single
       declaration every consumer trusts, while the legacy parser it
       replaced read the same sentence correctly. */
    /* Multi-clause phrasing: the clause layer already isolated the tired-of
       remark as background (this pin keeps that guard). The request executes
       on comedy alone; the renounced genre never executes as wanted. */
    const c = interpret("I'm tired of horror, give me a comedy");
    expect(c.kind).toBe('recommendation');
    expect(c.genres.find((g) => /horror/i.test(g.span) && g.wanted)).toBeUndefined();
    expect(c.genres.find((g) => /comed/i.test(g.span))?.wanted).toBe(true);
    expect(c.background.some((b) => /tired of horror/i.test(b.text))).toBe(true);

    /* Single-clause phrasing was the REAL inversion: "tired of" was not in
       the owner's negation vocabulary, so the renounced genre executed as
       WANTED — the user got exactly what they said they were done with. */
    const single = interpret('tired of horror movies, something else');
    expect(single.genres.find((g) => /horror/i.test(g.span))?.wanted).toBe(false);
  });

  it('"never horror" and "rather not a documentary" rule out, not in', () => {
    expect(interpret('a thriller but never horror').genres.find((g) => /horror/i.test(g.span))?.wanted).toBe(false);
    expect(interpret('something fun, rather not a documentary').genres.find((g) => /documentar/i.test(g.span))?.wanted).toBe(false);
  });

  it('"give me twelve thrillers" carries count=12 — the owner reads the ONE number vocabulary', () => {
    /* Consolidation pin, not a behavior fix: the request frame's own count
       list already read "twelve" for this phrasing. What changed is that the
       interpreter's private word-number copy (which stopped at ten) is gone —
       parseCount now reads nlu/count's exported table, so the two count
       vocabularies can never drift apart again. */
    expect(interpret('give me twelve thrillers').requestedCount).toBe(12);
    expect(interpret('twenty comedies').requestedCount).toBe(20);
  });

  it('a multi-clause request keeps the positive and the negative apart — and the request wanted', () => {
    const c = interpret('I love slow burns but I hate gore, find me a thriller');
    expect(c.kind).toBe('recommendation');
    expect(c.genres).toContainEqual({ span: 'thriller', wanted: true, holder: 'user' });
    expect(c.tones).toContainEqual({ term: 'gore', wanted: false, holder: 'user' });
    expect(c.tones).toContainEqual({ term: 'slow', wanted: true, holder: 'user' });
  });
});
