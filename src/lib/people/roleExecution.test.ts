import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { planPersonConstraint } from './constraint';
import { qualifyCandidates } from '@/lib/ask/hardConstraints';

/**
 * THREE DEFECTS IN THE FIRST CUT OF THE ROLE WORK — pinned red, then fixed.
 *
 * Each is a way the engine can still answer a question it was not asked.
 *
 *   1. AN UNSUPPORTED ROLE RETURNED GENERIC RESULTS WITH A DISCLAIMER.
 *      "movies written by Aaron Sorkin" dropped the person filter, ran the
 *      query anyway, and appended a sentence to `interpretation`. A list of
 *      films that has nothing to do with Sorkin is not a smaller answer to the
 *      question — it is an answer to a different one, and a note underneath does
 *      not convert it back. Zero qualifying recommendations is the honest
 *      result.
 *
 *   2. THE EXECUTION LAYER READ RAW LANGUAGE.
 *      `requestedRoleFor(text)` lived in `people/constraint.ts` — regexes over
 *      user prose, inside the module whose whole job is to execute a decision
 *      already made. That is the parallel-semantics defect this codebase keeps
 *      paying for, installed one layer lower. Execution must consume a TYPED
 *      role and be incapable of inferring one.
 *
 *   3. QUALIFICATION RAN ON A TRUNCATED HEAD AND AFTER RANKING.
 *      The finder verified `items.slice(0, max(24, cap*4))`. A director whose
 *      qualifying films ranked below that window was silently under-delivered:
 *      the count was cut to what happened to be verified, not to what exists.
 *      Verification has to cover the candidate set — or keep going until enough
 *      verified titles are found or the candidates are exhausted.
 */

const NOLAN = 525;

describe('1 — an unsupported role must refuse, not degrade', () => {
  it('planning a writer constraint yields a structured refusal', () => {
    const plan = planPersonConstraint(NOLAN, 'writer', 'movie');
    expect(plan.kind).toBe('refuse');
    if (plan.kind !== 'refuse') throw new Error('unreachable');
    expect(plan.reason.length).toBeGreaterThan(0);
    expect(plan.requested).toBe('writer');
  });

  it('a refusal carries NO constraint to apply — there is nothing to run', () => {
    const plan = planPersonConstraint(NOLAN, 'creator', 'movie');
    expect((plan as { constraint?: unknown }).constraint).toBeUndefined();
  });

  it('a supported role plans an application, typed', () => {
    const plan = planPersonConstraint(NOLAN, 'director', 'movie');
    expect(plan.kind).toBe('apply');
    if (plan.kind !== 'apply') throw new Error('unreachable');
    expect(plan.constraint).toEqual({ personId: NOLAN, role: 'director' });
  });
});

describe('2 — execution may not read raw language', () => {
  it('the execution module exports no language reader', async () => {
    const mod = await import('./constraint');
    expect(
      Object.keys(mod).some((k) => /requestedRoleFor|roleFor|parse|infer/i.test(k)),
      'execution consumes a typed role; it does not derive one from prose',
    ).toBe(false);
  });

  it('and contains no prose patterns at all', () => {
    /* THE PROPERTY, NOT THE SYMBOL. Deleting the export while leaving the
       regexes behind would satisfy a name check and none of the intent. */
    const src = readFileSync('src/lib/people/constraint.ts', 'utf8');
    const proseCues = /directed\s\\?s\+by|written\s\\?s\+by|created\s\\?s\+by|\\bstarring\\b/i;
    expect(proseCues.test(src), 'no user-language cues may live in the execution layer').toBe(false);
  });
});

describe('3 — qualification covers the candidates, and stops when satisfied', () => {
  /* These properties moved with the walker. `qualifyByRole` verified people
     only and is retired; `qualifyCandidates` verifies every explicit
     requirement through one predicate. The guarantees are unchanged and are
     asserted here against the new owner. */
  const NOLAN_C = { type: 'person' as const, entity: 'Christopher Nolan', personId: NOLAN, role: 'director' as const, required: true as const };
  const items = Array.from({ length: 40 }, (_, i) => ({ id: i, mediaType: 'movie' as const }));
  const factsFor = async (i: { id: number; mediaType: 'movie' | 'tv' }) => ({
    mediaType: i.mediaType,
    castIds: [] as number[],
    directorIds: i.id >= 30 ? [NOLAN] : [],
    genreNames: [] as string[],
    creditsKnown: true,
  });

  it('finds qualifying titles that rank BELOW the old head window', async () => {
    const out = await qualifyCandidates(items, [NOLAN_C], factsFor, { need: 3 });
    expect(out.map((r) => r.item.id)).toEqual([30, 31, 32]);
  });

  it('stops as soon as enough are verified rather than checking everything', async () => {
    let calls = 0;
    const counted = async (i: { id: number; mediaType: 'movie' | 'tv' }) => {
      calls += 1;
      return factsFor(i);
    };
    await qualifyCandidates(items, [NOLAN_C], counted, { need: 1 });
    expect(calls, 'verification is bounded by what the answer needs').toBeLessThan(items.length);
  });

  it('exhausts the candidates when fewer qualify than were asked for', async () => {
    const out = await qualifyCandidates(items, [NOLAN_C], factsFor, { need: 50 });
    expect(out).toHaveLength(10);
  });
});
