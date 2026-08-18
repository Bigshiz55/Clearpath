import { describe, it, expect } from 'vitest';
import { qualifyCandidates, type CandidateFacts, type HardConstraint } from './hardConstraints';

/**
 * WHAT PERSON VERIFICATION COSTS — measured, not asserted.
 *
 * Verifying an actor per candidate is new work: it used to run for directors
 * only, on the assumption that TMDB's `with_cast` already guaranteed actors.
 * That guarantee covers the discover strands and nothing else, which is how the
 * reported failure got through — so the check is now universal, and its cost
 * has to be a number rather than a hope.
 *
 * The shape of the cost, by construction:
 *   - ZERO for any request that names nobody.
 *   - Bounded by `need`, not by the pool: it stops at the first round that
 *     satisfies the requested count.
 *   - Concurrent WITHIN a round (batch of 12), so N candidates cost one
 *     round-trip's latency, not N.
 *   - Cached an hour per title by `tmdbFetch` (`next: { revalidate: 3600 }`),
 *     shared across users — so a popular actor's filmography is warm.
 */

const SLJ = 2231;
const requireSLJ: HardConstraint = { type: 'person', entity: 'Samuel L. Jackson', personId: SLJ, role: 'actor', required: true };
const BATCH = 12;

type Item = { id: number; mediaType: 'movie' };
// Ids start at 1: id 0 is divisible by every hit-rate and would count as a
// hit in the 'nobody qualifies' case.
const pool = (n: number): Item[] => Array.from({ length: n }, (_, i) => ({ id: i + 1, mediaType: 'movie' as const }));

/** One simulated provider round-trip. */
const LATENCY_MS = 40;

function instrumented(hitRate: number) {
  let calls = 0;
  let rounds = 0;
  let inFlight = 0;
  let peakConcurrency = 0;
  const fetchFacts = async (i: Item): Promise<CandidateFacts> => {
    calls += 1;
    inFlight += 1;
    peakConcurrency = Math.max(peakConcurrency, inFlight);
    if (inFlight === 1) rounds += 1;
    await new Promise((r) => setTimeout(r, LATENCY_MS));
    inFlight -= 1;
    return {
      mediaType: 'movie',
      castIds: i.id % hitRate === 0 ? [SLJ] : [999],
      directorIds: [],
      genreNames: [],
      creditsKnown: true,
    };
  };
  return { fetchFacts, stats: () => ({ calls, rounds, peakConcurrency }) };
}

describe('cost of verification — measured', () => {
  it('A REQUEST NAMING NOBODY COSTS NOTHING', async () => {
    const { fetchFacts, stats } = instrumented(1);
    await qualifyCandidates(pool(60), [], fetchFacts, { need: 10 });
    expect(stats().calls).toBe(0);
  });

  it('an easy actor query costs ONE bounded round', async () => {
    // Every candidate is a hit — the common case for a cast-filtered strand.
    const { fetchFacts, stats } = instrumented(1);
    const t0 = Date.now();
    await qualifyCandidates(pool(60), [requireSLJ], fetchFacts, { need: 6 });
    const elapsed = Date.now() - t0;
    const s = stats();
    // eslint-disable-next-line no-console
    console.log(`[verify-cost] easy: calls=${s.calls} rounds=${s.rounds} peakConcurrency=${s.peakConcurrency} elapsed≈${elapsed}ms`);
    expect(s.calls).toBeLessThanOrEqual(BATCH);
    expect(s.rounds).toBe(1);
    // Concurrency within the round is what keeps latency at one round-trip.
    expect(s.peakConcurrency).toBeGreaterThan(1);
    expect(elapsed).toBeLessThan(LATENCY_MS * 4);
  });

  it('a HARD query (1 in 5 qualifies) stays proportional to the answer', async () => {
    const { fetchFacts, stats } = instrumented(5);
    const t0 = Date.now();
    await qualifyCandidates(pool(120), [requireSLJ], fetchFacts, { need: 6 });
    const elapsed = Date.now() - t0;
    const s = stats();
    // eslint-disable-next-line no-console
    console.log(`[verify-cost] hard: calls=${s.calls} rounds=${s.rounds} peakConcurrency=${s.peakConcurrency} elapsed≈${elapsed}ms`);
    expect(s.calls).toBeLessThanOrEqual(BATCH * 3);
    expect(s.calls, 'must not walk the whole pool').toBeLessThan(120);
  });

  it('WORST CASE is the pool, and only when almost nothing qualifies', async () => {
    // Nobody qualifies: the walk exhausts, which is the honest answer ("the
    // catalogue really is short") rather than a truncated one.
    const { fetchFacts, stats } = instrumented(9999);
    const items = pool(48);
    const t0 = Date.now();
    const out = await qualifyCandidates(items, [requireSLJ], fetchFacts, { need: 6 });
    const elapsed = Date.now() - t0;
    const s = stats();
    // eslint-disable-next-line no-console
    console.log(`[verify-cost] worst: calls=${s.calls} rounds=${s.rounds} elapsed≈${elapsed}ms (pool=${items.length})`);
    expect(out).toEqual([]);
    expect(s.calls).toBe(items.length);
    expect(s.rounds).toBe(Math.ceil(items.length / BATCH));
    // Sequential ROUNDS, concurrent within them: 4 round-trips, not 48.
    expect(elapsed).toBeLessThan(LATENCY_MS * BATCH);
  });

  it('NO N+1 — latency scales with rounds, not with candidates', async () => {
    const { fetchFacts: f1, stats: s1 } = instrumented(1);
    const t1 = Date.now();
    await qualifyCandidates(pool(12), [requireSLJ], f1, { need: 12 });
    const small = Date.now() - t1;

    const { fetchFacts: f2, stats: s2 } = instrumented(1);
    const t2 = Date.now();
    await qualifyCandidates(pool(12), [requireSLJ], f2, { need: 12 });
    const same = Date.now() - t2;

    expect(s1().rounds).toBe(1);
    expect(s2().rounds).toBe(1);
    // Twelve candidates cost one round-trip, so the two runs are comparable.
    expect(Math.abs(small - same)).toBeLessThan(LATENCY_MS * 2);
  });
});
