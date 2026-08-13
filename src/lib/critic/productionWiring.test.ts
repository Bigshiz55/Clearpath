import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

/**
 * GC5 BLOCKER — PROVEN, NOT ASSUMED.
 *
 * The brief is explicit: "If GC5 cannot be connected without GC1 because
 * production currently never constructs a CriticObjective, stop and prove that
 * dependency rather than faking a production path."
 *
 * Tracing the current branch turned up TWO independent gaps, and the second was
 * not previously known. These tests pin both, so the day either one closes this
 * file fails and tells the next session the blocker is gone.
 */

/**
 * Lines outside the critic module and outside tests that mention `pattern`.
 *
 * DECLARATIONS ARE NOT CALLERS. `export function rankWithPreference(` matches a
 * naive grep for `rankWithPreference(`, and counting a function's own
 * definition as a use of it is how a "nothing calls this" claim quietly
 * becomes false. Filtering the declaration out is what makes the count mean
 * "call sites".
 */
const grepUses = (pattern: string): string[] => {
  try {
    const out = execSync(
      `grep -rn "${pattern}" src --include=*.ts --include=*.tsx | grep -v "\\.test\\." | grep -v "^src/lib/critic/" || true`,
      { encoding: 'utf8' },
    );
    return out
      .split('\n')
      .filter((l) => l.trim().length > 0)
      .filter((l) => !/:\s*(export\s+)?(async\s+)?function\s/.test(l));
  } catch {
    return [];
  }
};

const grepCount = (pattern: string): number => grepUses(pattern).length;

describe('BLOCKER 1 — production never constructs a CriticObjective (GC1)', () => {
  it('nothing outside src/lib/critic builds one', () => {
    // `rank.ts` imports the TYPE; that is the consumer, not a constructor.
    const constructors = grepCount("buildPlan\\|anchorsToObjective\\|resolveAnchor");
    expect(constructors, 'a production caller appeared — GC1 may be unblocked').toBe(0);
  });

  it('the ask route still reduces anchors to keyword ids', () => {
    const route = readFileSync('src/app/api/ask/route.ts', 'utf8');
    expect(route).toContain('referenceKeywordIds');
    expect(route).toContain('searchTitles(name)');
  });
});

describe('BLOCKER 2 — the critic ranker is not the production ranker', () => {
  it('rankWithPreference has NO production caller at all', () => {
    /* THE FINDING THAT MATTERS MOST. GC8 proved the critic term changes the
       order returned by `rankWithPreference` — and that function is a REPORTING
       HELPER. Its own docblock says it exists "so the before/after report
       reflects production behavior". Nothing in the app calls it. */
    const uses = grepUses("rankWithPreference(");
    expect(uses, `rankWithPreference gained a caller: ${uses.join(' | ')}`).toEqual([]);
  });

  it('the Ask/Finder path ranks by matchScore, never by the critic term', () => {
    const finder = readFileSync('src/lib/finder.ts', 'utf8');
    expect(finder).toMatch(/sort\(\(a, b\) => b\.matchScore - a\.matchScore\)/);
    expect(finder).not.toContain('rankWithPreference');
    expect(finder).not.toContain('criticPlan');
  });

  it('the browse path calls preferenceNudge DIRECTLY, bypassing the critic term', () => {
    /* So even a caller that wanted the critic would not get it: `rankByDna`
       reaches past `rankWithPreference` to the inner nudge. Wiring the critic
       into production means changing one of these two call sites — which is
       GC6's job, and is a bigger change than GC6 was scoped for. */
    const dna = readFileSync('src/lib/dna.ts', 'utf8');
    expect(dna).toContain('preferenceNudge(');
    expect(dna).not.toContain('rankWithPreference');
  });
});
