import { describe, it, expect } from 'vitest';
import { deriveDna } from '@/lib/preference/engine';
import type { PreferenceEvent } from '@/lib/preference/types';
import type { TitleDimensions } from '@/lib/scoring/dimensions';
import { routeAsk } from './gate';
import { buildCriticState } from './orchestrate';
import { dimensionCacheKey } from './hydrate';
import { MAX_STRANDS } from './strandBudget';
import type { AnchorCandidate } from './anchor';

/**
 * GC11 — LATENCY BUDGET + CACHING.
 *
 * The ledger records this gate as "tuning is GC11" for the strand fan-out, and
 * BACKLOG as "needs measuring". Latency is BEHAVIOURAL, so nothing here is
 * satisfied by reading source: every budget below is measured by instrumenting
 * the real `buildCriticState` and counting what it actually does.
 *
 * ── WHY SERIAL DEPTH, NOT MILLISECONDS ────────────────────────────────────
 * Wall-clock in CI measures the machine. ROUND-TRIP DEPTH — how many network
 * hops must happen one-after-another before the answer can exist — is the thing
 * the code controls and the thing a user feels. Every assertion is on depth and
 * call counts, which are deterministic. One wall-clock test exists as a
 * cross-check, with simulated per-call latency and a bound only parallelism can
 * meet.
 */

const dims = (o: Partial<Record<string, number>>): TitleDimensions =>
  ({
    pacing: 50, darkness: 50, warmth: 50, humor: 50, suspense: 50, emotion: 50,
    complexity: 50, realism: 50, character: 50, stakes: 50, morality: 50,
    violence: 50, attention: 50, serialized: 50, romance: 50,
    ...o,
  }) as TitleDimensions;

const ANCHOR_DIMS = dims({ suspense: 88, darkness: 85, complexity: 82, humor: 80 });

const CATALOGUE: Record<string, AnchorCandidate[]> = {
  Furious: [
    { id: 501, title: 'Furious 7', mediaType: 'movie', year: 2015 },
    { id: 502, title: 'Furious', mediaType: 'movie', year: 2017 },
  ],
  'Widows Bay': [
    { id: 601, title: 'Widows', mediaType: 'movie', year: 2018 },
    { id: 602, title: 'Widows Bay', mediaType: 'movie', year: 2021 },
  ],
};

const NOW = Date.UTC(2026, 5, 1);
const DNA = deriveDna(
  Array.from({ length: 16 }, (_, i): PreferenceEvent => ({
    id: `e${i}`,
    at: NOW - (i + 1) * 86_400_000,
    titleId: `movie:${12000 + i}`,
    action: 'seen_liked',
    dims: { suspense: 88, darkness: 85, complexity: 84, humor: 10 },
    genres: ['thriller'],
  })),
  NOW,
);

const TWO_ANCHORS = 'Better than Furious or Widows Bay';

/** A stopwatch that counts calls, peak concurrency and serial depth. */
function meter(latencyMs = 0) {
  const calls: Record<string, number> = {};
  let live = 0;
  let peak = 0;
  /** Depth = how many calls had to finish before this one could start. */
  let depth = 0;
  let openedAt = 0;

  const wrap = <A extends unknown[], R>(name: string, fn: (...a: A) => Promise<R>) =>
    async (...a: A): Promise<R> => {
      calls[name] = (calls[name] ?? 0) + 1;
      if (live === 0) {
        depth += 1;
        openedAt = calls[name]!;
      }
      live += 1;
      peak = Math.max(peak, live);
      /* ALWAYS YIELD, even at zero simulated latency. Returning synchronously
         would drop `live` back to 0 between two calls that genuinely started
         together, so every call would look like a fresh hop and `depth` would
         just count calls. A real network call always yields; the meter must
         too, or it measures the instrument instead of the code. */
      await new Promise((r) => setTimeout(r, latencyMs));
      live -= 1;
      return fn(...a);
    };

  return {
    wrap,
    get calls() { return { ...calls }; },
    get peak() { return peak; },
    get depth() { return depth; },
    get openedAt() { return openedAt; },
  };
}

interface Instrumented {
  m: ReturnType<typeof meter>;
  searchCandidates: (name: string) => Promise<AnchorCandidate[]>;
  loadDimensions: (k: { tmdb_id: number; media_type: 'movie' | 'tv' }[]) => Promise<Map<string, TitleDimensions>>;
  loadAnchorKeywords: (anchors: readonly { tmdbId: number; mediaType: 'movie' | 'tv' }[]) => Promise<number[]>;
  keywordArgs: { tmdbId: number }[][];
}

function instrument(latencyMs = 0): Instrumented {
  const m = meter(latencyMs);
  const keywordArgs: { tmdbId: number }[][] = [];
  return {
    m,
    keywordArgs,
    searchCandidates: m.wrap('searchCandidates', async (name: string) => CATALOGUE[name] ?? []),
    loadDimensions: m.wrap('loadDimensions', async (keys: { tmdb_id: number; media_type: 'movie' | 'tv' }[]) => {
      const map = new Map<string, TitleDimensions>();
      for (const k of keys) map.set(dimensionCacheKey(k.media_type, k.tmdb_id), ANCHOR_DIMS);
      return map;
    }),
    loadAnchorKeywords: m.wrap('loadAnchorKeywords', async (anchors: readonly { tmdbId: number; mediaType: 'movie' | 'tv' }[]) => {
      keywordArgs.push(anchors.map((a) => ({ tmdbId: a.tmdbId })));
      return [9001, 9002];
    }),
  };
}

const run = (text: string, io: Instrumented) =>
  buildCriticState({
    request: routeAsk(text, 'legacy').request!,
    dna: DNA,
    hard: { mediaType: 'movie' },
    searchCandidates: io.searchCandidates,
    loadDimensions: io.loadDimensions,
    loadAnchorKeywords: io.loadAnchorKeywords,
    anchorGenreIds: [53],
  });

// ───────────────────────────────────────────────────────────────────────────
// 1 · IDENTITY IS RESOLVED ONCE
// ───────────────────────────────────────────────────────────────────────────

describe('GC11 · no duplicated work in the interpretation stage', () => {
  it('1 · each anchor is searched EXACTLY once across the whole stage', async () => {
    /* THE DEFECT THIS MEASURES. The route previously derived anchor keywords by
       calling `searchTitles` + `resolveAnchor` a SECOND time per anchor, so a
       two-anchor comparison paid for four identity searches and resolved each
       title twice — two independent resolutions of the same name that were free
       to disagree. */
    const io = instrument();
    const s = await run(TWO_ANCHORS, io);
    expect(s.objective.anchors).toHaveLength(2);
    expect(io.m.calls.searchCandidates).toBe(2);
  });

  it('2 · anchor keywords are derived from the RESOLVED anchors, once', async () => {
    const io = instrument();
    await run(TWO_ANCHORS, io);
    expect(io.m.calls.loadAnchorKeywords).toBe(1);
    /* Derived from identity, never from a name. The resolved ids are the
       decoy-free ones, which is also strictly more correct than the old path:
       it used to fetch the keywords of Furious 7 for "Furious". */
    expect(io.keywordArgs[0]!.map((a) => a.tmdbId).sort()).toEqual([502, 602]);
  });

  it('3 · fingerprints are fetched in ONE batch, cache-only', async () => {
    const io = instrument();
    await run(TWO_ANCHORS, io);
    expect(io.m.calls.loadDimensions).toBe(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2 · LATENCY BUDGET — measured, not asserted from source
// ───────────────────────────────────────────────────────────────────────────

describe('GC11 · the interpretation stage stays within its round-trip budget', () => {
  it('4 · anchors resolve CONCURRENTLY, not one after another', async () => {
    const io = instrument(5);
    await run(TWO_ANCHORS, io);
    /* Peak concurrency > 1 is the only observable that distinguishes a
       `Promise.all` from a `for … await`, and it is what turns N serial
       round-trips into one. */
    expect(io.m.peak).toBeGreaterThan(1);
  });

  it('5 · serial depth is bounded regardless of anchor count', async () => {
    /* THE BUDGET. Identity (parallel) → keywords + fingerprints (parallel) is
       two dependent hops. Adding an anchor must not add a hop. */
    const one = instrument();
    await run('Better than Furious', one);
    const two = instrument();
    await run(TWO_ANCHORS, two);
    expect(two.m.depth).toBeLessThanOrEqual(one.m.depth);
    expect(two.m.depth).toBeLessThanOrEqual(3);
  });

  it('6 · wall-clock reflects parallelism, not the sum of the parts', async () => {
    const LAT = 25;
    const io = instrument(LAT);
    const t0 = Date.now();
    await run(TWO_ANCHORS, io);
    const elapsed = Date.now() - t0;
    const total = Object.values(io.m.calls).reduce((a, b) => a + b, 0);
    /* Serial would be `total × LAT`. Allow generous headroom for CI jitter and
       still fail the serial shape decisively. */
    expect(total).toBeGreaterThanOrEqual(4);
    expect(elapsed).toBeLessThan(total * LAT * 0.8);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 3 · THE STRAND FAN-OUT BUDGET — the thing the ledger deferred here
// ───────────────────────────────────────────────────────────────────────────

describe('GC11 · the retrieval fan-out is bounded and declared', () => {
  it('7 · the strand cap is a single exported constant', () => {
    expect(MAX_STRANDS).toBeGreaterThan(0);
    expect(MAX_STRANDS).toBeLessThanOrEqual(5);
  });

  it('8 · no relation can emit more strands than the cap', async () => {
    for (const text of [
      'Better than Furious or Widows Bay',
      'something like Furious',
      'Furious but faster',
      'Furious meets Widows Bay',
    ]) {
      const io = instrument();
      const s = await run(text, io);
      expect(s.hints.strands.length, text).toBeLessThanOrEqual(MAX_STRANDS);
    }
  });

  it('9 · the fan-out does not grow with the number of anchors', async () => {
    const one = await run('Better than Furious', instrument());
    const two = await run(TWO_ANCHORS, instrument());
    /* `blend` fans per seed, every other relation does not. A comparison naming
       more titles must not multiply the TMDB budget. */
    expect(two.hints.strands.length).toBe(one.hints.strands.length);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 4 · CACHING IS REAL AND SAFE
// ───────────────────────────────────────────────────────────────────────────

describe('GC11 · caching does not change meaning', () => {
  it('10 · a fingerprint cache MISS still degrades safely and cheaply', async () => {
    const io = instrument();
    const s = await buildCriticState({
      request: routeAsk(TWO_ANCHORS, 'legacy').request!,
      dna: DNA,
      hard: { mediaType: 'movie' },
      searchCandidates: io.searchCandidates,
      loadDimensions: async () => new Map(),
      loadAnchorKeywords: io.loadAnchorKeywords,
    });
    expect(s.objective.anchors).toHaveLength(2); // identity survived
    expect(s.objective.authority).toBe(0); // …and says nothing
    expect(s.plan.instructions).toEqual([]);
    expect(io.m.calls.searchCandidates).toBe(2); // no retry storm
  });

  it('11 · a keyword-loader failure never breaks the request', async () => {
    const io = instrument();
    const s = await buildCriticState({
      request: routeAsk(TWO_ANCHORS, 'legacy').request!,
      dna: DNA,
      hard: { mediaType: 'movie' },
      searchCandidates: io.searchCandidates,
      loadDimensions: io.loadDimensions,
      loadAnchorKeywords: async () => {
        throw new Error('tmdb down');
      },
    });
    // The comparison still works; only the SOFT keyword seed is missing.
    expect(s.objective.relation).toBe('better_than');
    expect(s.objective.anchors).toHaveLength(2);
    expect(s.plan.instructions.length).toBeGreaterThan(0);
    expect(s.hints.strands.some((x) => x.label === 'recall-floor')).toBe(true);
  });

  it('12 · repeated identical requests produce identical state', async () => {
    /* Caching may not make two identical asks disagree. */
    const a = await run(TWO_ANCHORS, instrument());
    const b = await run(TWO_ANCHORS, instrument());
    expect(JSON.stringify(b.plan)).toEqual(JSON.stringify(a.plan));
    expect(JSON.stringify(b.hints)).toEqual(JSON.stringify(a.hints));
    expect(b.objective.authority).toBe(a.objective.authority);
  });

  it('12b · the production route uses the single-resolution keyword path', async () => {
    const { readFileSync } = await import('node:fs');
    const route = readFileSync('src/app/api/ask/route.ts', 'utf8');
    /* Anchored on the critic BLOCK, not the import line — slicing from the
       import swept in the whole file, including the conversational path that
       legitimately still calls `referenceKeywordIds`. */
    const block = route.slice(route.indexOf('0.9) THE CRITIC PATH'), route.indexOf('// 1) Named-title'));
    expect(block.length).toBeGreaterThan(500);
    // Comments legitimately DISCUSS the old path; the CODE must not call it.
    const critic = block.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    /* The critic block must derive its seed from resolved anchors, not by
       re-searching names. `referenceKeywordIds` still exists for the
       conversational path, which has strings and no resolution. */
    expect(critic).toContain('loadAnchorKeywords');
    expect(critic).not.toContain('referenceKeywordIds');
    // …and the preference read goes through the cache that had no callers.
    expect(critic).toContain('loadPreferenceCached');
  });

  it('13 · NO model call was introduced into the request path', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    for (const f of readdirSync('src/lib/critic')) {
      if (!f.endsWith('.ts') || f.includes('.test.')) continue;
      const src = readFileSync(`src/lib/critic/${f}`, 'utf8');
      expect(src, f).not.toContain('api.openai.com');
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(code, f).not.toContain('getTitleDimensions'); // the classifier
    }
  });
});
