import { describe, it, expect } from 'vitest';
import { interpret } from './interpret';
import { stripRequestFrame } from '@/lib/nlu/requestFrame';
import { classifyClause } from './clauses';

/**
 * THE CANONICAL INTERPRETER INHERITS THE PRODUCTION REPAIR. IT DOES NOT REPLACE IT.
 *
 * ── THE ARCHITECTURAL RISK THIS FILE EXISTS TO CLOSE ──────────────────────
 * Two layers were about to decide the same five things independently: request
 * scaffolding, counts, person spans, personalization tails, and whether a
 * string is a title or an order. `nlu/requestFrame.ts` shipped to production as
 * a tactical repair; `interpret/` is meant to become the canonical front door.
 * Left alone, `/api/ask` would eventually disagree with itself depending on
 * which layer answered — and the disagreement would arrive silently, as a
 * behaviour change nobody wrote.
 *
 * ── THE OWNERSHIP DECISION, ENFORCED HERE RATHER THAN DOCUMENTED ──────────
 *
 *   requestFrame   LEXICAL PRIMITIVE. Knows which framings are real: the lead
 *                  phrases, the count forms, the personalization tail, and the
 *                  discipline that keeps "Get Out" and "A Few Good Men" from
 *                  looking like orders. It has NO opinion about what a request
 *                  is for. Nothing semantic may be added to it.
 *
 *   interpret      CANONICAL SEMANTICS. Decides clause role, `kind`,
 *                  `requestedCount`, person spans and — the thing only it can
 *                  express — the CREDIT ROLE. It CONSUMES the primitive rather
 *                  than re-deriving it.
 *
 * ── MEASURED BEFORE THE WIRING ────────────────────────────────────────────
 * Two of the six spoken cases the production repair fixed came back WRONG from
 * the canonical layer, which is exactly the drift this prevents:
 *
 *   "how about a Bruce Willis movie"        kind=statement, people=[]
 *   "movies directed by Christopher Nolan"  kind=statement, people=[]
 *
 * and "Get Out" was read as an order. All three are fixed by consuming the
 * primitive instead of competing with it.
 */

/** The exact titles the production repair protects. Every one is a real film. */
const PROTECTED_TITLES = [
  'The Holiday',
  'Two Weeks Notice',
  'A Few Good Men',
  'Three Billboards Outside Ebbing, Missouri',
  'Some Like It Hot',
  'Get Out',
];

describe('the protected titles survive the canonical layer too', () => {
  for (const title of PROTECTED_TITLES) {
    it(`"${title}" is not read as a request`, () => {
      expect(interpret(title).kind).not.toBe('recommendation');
    });

    it(`"${title}" yields no person and no count`, () => {
      const i = interpret(title);
      expect(i.people, 'a title is not a cast constraint').toEqual([]);
      expect(i.requestedCount, 'a leading quantity in a title is not a count').toBeNull();
    });

    it(`"${title}" is not reduced by the lexical primitive either`, () => {
      // Both layers have to hold the line, or the one that does not becomes the
      // way the protection is lost.
      expect(stripRequestFrame(title).text).toBe(title);
    });
  }
});

describe('the spoken requests survive, and gain the role the primitive cannot express', () => {
  const CASES: Array<{ said: string; span: string; role: string; count: number | null }> = [
    { said: "find me 3 Sylvester Stallone movies you think I'll like", span: 'Sylvester Stallone', role: 'any', count: 3 },
    { said: 'show me some Tom Hanks movies I would enjoy', span: 'Tom Hanks', role: 'any', count: null },
    { said: 'what should I watch tonight with Tom Hanks', span: 'Tom Hanks', role: 'actor', count: null },
    { said: 'how about a Bruce Willis movie', span: 'Bruce Willis', role: 'any', count: 1 },
    { said: 'movies directed by Christopher Nolan', span: 'Christopher Nolan', role: 'director', count: null },
    { said: 'give me 5 Denzel Washington films', span: 'Denzel Washington', role: 'any', count: 5 },
  ];

  for (const { said, span, role, count } of CASES) {
    it(`"${said}"`, () => {
      const i = interpret(said);
      expect(i.kind, 'must be executed, not filed as background').toBe('recommendation');
      expect(i.people.map((p) => p.span), 'person span').toContain(span);
      expect(i.people.find((p) => p.span === span)!.role, 'credit role').toBe(role);
      expect(i.requestedCount, 'requested count').toBe(count);
    });
  }

  it('THE DIRECTOR CASE IS THE ONE ONLY THIS LAYER CAN ANSWER', () => {
    /* `extractPersonName` can name Christopher Nolan and can never say what he
       did on the film. The lexical layer has no field for it — which is the
       whole argument for the canonical intent owning semantics, and the reason
       "movies directed by X" must not be answered by a cast filter. */
    const i = interpret('movies directed by Christopher Nolan');
    const nolan = i.people.find((p) => p.span === 'Christopher Nolan')!;
    expect(nolan.role).toBe('director');
    expect(nolan.role).not.toBe('actor');
  });
});

describe('the primitive is consumed, not duplicated', () => {
  it('a clause the primitive recognises as framed is a request here', () => {
    /* The wiring itself, asserted directly: if someone later deletes the
       `stripRequestFrame` call from `classifyClause` and re-implements its
       lead list locally, this is what fails. */
    const said = 'how about a Bruce Willis movie';
    expect(stripRequestFrame(said).stripped, 'the primitive sees framing').toBe(true);
    expect(classifyClause(said), 'and this layer acts on it').toBe('request');
  });

  it('a clause the primitive leaves alone is NOT promoted to a request by it', () => {
    for (const title of PROTECTED_TITLES) {
      expect(stripRequestFrame(title).stripped, title).toBe(false);
    }
  });

  it('the primitive is never asked to name a role — it has no concept of one', () => {
    // `RequestFrame` carries exactly four fields, none of them semantic.
    expect(Object.keys(stripRequestFrame('find me 3 Stallone movies')).sort()).toEqual(
      ['count', 'personalized', 'stripped', 'text'],
    );
  });
});
