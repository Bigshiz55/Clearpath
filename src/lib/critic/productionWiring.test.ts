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
    /* The route reaches the parser through the comparative-intent gate, so the
       chain is asserted rather than a single string: route -> routeAsk ->
       parseCriticRequest. Pinning only the route's own text would go green
       again the day someone inlined a SECOND parser beside the gate. */
    const route = readFileSync('src/app/api/ask/route.ts', 'utf8');
    expect(route).toContain('routeAsk(');
    const gate = readFileSync('src/lib/critic/gate.ts', 'utf8');
    expect(gate).toContain('parseCriticRequest(');
  });
});

describe('BLOCKER 2 — CLOSED by GC6: the critic orders the real response', () => {
  it('the comparative Ask response is ordered by the critic decision', () => {
    expect(grepCount("rankCriticCandidates"), 'GC6 wiring vanished').toBeGreaterThan(0);
    const route = readFileSync('src/app/api/ask/route.ts', 'utf8');
    expect(route).toContain('rankCriticCandidates');
    expect(route).toContain('finalRankingConsumesPlan');
  });

  it('rankWithPreference STILL has no production caller — deliberately', () => {
    /* GC6 did NOT wire this. It is the GC8 helper: its own docblock says it
       exists "so the before/after report reflects production behavior", and it
       composes `objective + preferenceNudge + critic`. Feeding the Finder's
       already-personalized `matchScore` into it would apply the user's taste
       twice (audit in docs/CRITIC-SHIP.md), so GC6 built an explicit
       composition instead and left this as the lower-level invariant.

       Kept pinned because it is now genuinely dead production code and the next
       session should decide its fate on purpose rather than by accident. */
    const uses = grepUses("rankWithPreference(");
    expect(uses, `rankWithPreference gained a caller: ${uses.join(' | ')}`).toEqual([]);
  });

  it('the Finder itself is untouched — the critic composes above it', () => {
    /* Non-comparative requests must keep the exact ordering they had. The
       critic never reached inside the finder to do its work. */
    const finder = readFileSync('src/lib/finder.ts', 'utf8');
    expect(finder).toMatch(/sort\(\(a, b\) => b\.matchScore - a\.matchScore\)/);
    expect(finder).not.toContain('rankWithPreference');
    expect(finder).not.toContain('criticPlan');
    expect(finder).not.toContain('rankCriticCandidates');
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
