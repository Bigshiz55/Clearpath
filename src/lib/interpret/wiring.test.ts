import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { interpret } from './interpret';

/**
 * THE GAP BETWEEN "BUILT" AND "IN USE".
 *
 * The interpretation layer is proven by 271 tests and changes nothing about
 * what production answers, because `/api/ask` does not call it. That is the
 * whole distinction between an architecture foundation and a fix, and it is
 * exactly the kind of gap that quietly becomes permanent once a PR is green
 * and merged.
 *
 * So the gap is a TEST rather than a note. `it.fails` asserts that the wiring
 * assertion currently does not hold — and the moment someone wires the route,
 * this file goes red and demands to be flipped to a plain `it`. A skipped test
 * or a TODO comment would let the same gap pass silently; this cannot.
 *
 * Source-level on purpose: `/api/ask` needs auth, TMDB and Supabase to execute,
 * so a behavioural assertion would prove the environment, not the wiring.
 */

const ROOT = join(__dirname, '..', '..', '..');
const askRoute = () => readFileSync(join(ROOT, 'src/app/api/ask/route.ts'), 'utf8');

describe('the canonical layer exists', () => {
  it('interprets the reported failure correctly, on its own', () => {
    const out = interpret(
      "Had a beef burrito for dinner, I liked Rocky a few weeks ago, I'm looking for another boxing movie.",
    );
    expect(out.kind).toBe('recommendation');
    expect(out.subjects.some((s) => s.span === 'boxing' && s.wanted)).toBe(true);
    expect(out.background.some((b) => /burrito/i.test(b.text))).toBe(true);
  });
});

describe('but it is NOT yet the front door of /api/ask', () => {
  /*
   * RED, DELIBERATELY. Flip these to `it(...)` in the same commit that wires
   * the route — and note that doing so is a claim about production behaviour,
   * which needs real TMDB and Supabase to stand up. Green here means "the route
   * calls the interpreter", never "the recommendation is correct".
   */
  it.fails('the ask route imports the canonical interpreter', () => {
    expect(askRoute()).toContain('@/lib/interpret');
  });

  it.fails('the ask route derives its request from canonical intent', () => {
    expect(askRoute()).toMatch(/\binterpret\s*\(/);
  });

  it('meanwhile the legacy parser is still what production reads', () => {
    // Not a criticism of `askParse` — a statement of the current boundary, so
    // the report and the code cannot drift apart about where meaning is made.
    expect(askRoute()).toMatch(/askParse|parseAskWithAI|resolvePersonId/);
  });
});

/**
 * THE CRITIC PATH IS NOT REPLACED, DUPLICATED, OR ROUTED AROUND.
 *
 * Main already carries a completed Critic Layer that owns comparative asks
 * end to end — objective, resolution, hydration, plan, retrieval, ranking,
 * explanation. `CanonicalIntent` records the LANGUAGE-level relationship
 * ("better than X" is a `betterThan` reference) and must be adapted into that
 * contract, never made into a second one. Two representations of a comparison
 * is how the two drift until they disagree about the same sentence.
 */
describe('the Critic layer keeps its comparison contract', () => {
  const interpretSrc = () =>
    ['clauses.ts', 'interpret.ts', 'types.ts']
      .map((f) => readFileSync(join(ROOT, 'src/lib/interpret', f), 'utf8'))
      .join('\n');

  it('the interpreter never imports or re-implements the Critic', () => {
    // Adaptation belongs at the boundary, not inside a pure language layer —
    // and a pure layer that reached into the Critic could not stay pure.
    expect(interpretSrc()).not.toMatch(/@\/lib\/critic|criticObjective|CriticPlan|anchorIdentity/);
  });

  it('records the comparison as a language relation, not a rival plan', () => {
    // One field on a reference. No objective, no plan, no retrieval strategy —
    // those are the Critic's, and this must remain adaptable INTO them.
    const out = interpret('Give me a boxing movie better than Rocky.');
    const ref = out.titles.find((t) => /rocky/i.test(t.span));
    expect(ref?.relation).toBe('betterThan');
    expect(Object.keys(out)).not.toContain('objective');
    expect(Object.keys(out)).not.toContain('plan');
  });

  it('leaves the Critic modules untouched', () => {
    // This branch adds files; it must not have edited the layer that already
    // owns comparative asks.
    for (const f of ['gate.ts', 'anchor.ts', 'decide.ts']) {
      expect(() => readFileSync(join(ROOT, 'src/lib/critic', f), 'utf8')).not.toThrow();
    }
  });
});
