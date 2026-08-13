import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

/**
 * WHAT IS AND IS NOT WIRED — the file that refuses to let a claim outrun the code.
 *
 * GC5 found TWO independent gaps. GC1 CLOSED THE FIRST: the real `/api/ask`
 * request path now constructs the canonical critic state and issues the GC5
 * retrieval strands. The assertions below were inverted rather than deleted, so
 * they now guard the wiring against regressing instead of pinning its absence.
 *
 * THE SECOND IS STILL OPEN and is deliberately left pinned: production's final
 * ordering does not consume the critic plan. That is GC6.
 *
 * In one line: GC1 closed; GC6 still open.
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

describe('BLOCKER 1 — CLOSED by GC1: production constructs the critic state', () => {
  it('a real production caller now builds the objective', () => {
    // Was asserted to be 0. The ask route is the caller.
    expect(grepCount("buildCriticState"), 'GC1 wiring vanished from production').toBeGreaterThan(0);
  });

  it('the ask route no longer treats search order as identity', () => {
    const route = readFileSync('src/app/api/ask/route.ts', 'utf8');
    /* The exact line that made popularity into identity. Anchors now go
       through `resolveAnchor`, which refuses rather than guessing. */
    expect(route).not.toContain('searchTitles(name).catch(() => []))[0]');
    expect(route).toContain('resolveAnchor(');
  });

  it('the relation survives parsing instead of being discarded', () => {
    const route = readFileSync('src/app/api/ask/route.ts', 'utf8');
    expect(route).toContain('parseCriticRequest');
  });
});

describe('BLOCKER 2 — STILL OPEN: the critic ranker is not the production ranker', () => {
  it('rankWithPreference has NO production caller at all', () => {
    /* THE FINDING THAT MATTERS MOST, and GC1 did not change it. GC8 proved the
       critic term changes the order returned by `rankWithPreference` — and that
       function is a REPORTING HELPER. Its own docblock says it exists "so the
       before/after report reflects production behavior". Nothing calls it. */
    const uses = grepUses("rankWithPreference(");
    expect(uses, `rankWithPreference gained a caller: ${uses.join(' | ')}`).toEqual([]);
  });

  it('the critic path reports that final ranking does NOT consume the plan', () => {
    /* GC1 carries the plan to the boundary and stops. This constant is the
       honest record of that, and flipping it without wiring GC6 would make the
       API tell the user something untrue. */
    const orch = readFileSync('src/lib/critic/orchestrate.ts', 'utf8');
    expect(orch).toContain('finalRankingConsumesPlan: false');
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
