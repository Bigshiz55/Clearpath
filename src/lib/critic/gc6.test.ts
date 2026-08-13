import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { deriveDna } from '@/lib/preference/engine';
import { MIN_RANK_CONF } from '@/lib/preference/rank';
import type { PreferenceEvent } from '@/lib/preference/types';
import type { TitleDimensions } from '@/lib/scoring/dimensions';
import { routeAsk } from './gate';
import { buildCriticState } from './orchestrate';
import { dimensionCacheKey } from './hydrate';
import { rankCriticCandidates, candidateKey, CRITIC_NUDGE_MAX, type CriticCandidate } from './decide';
import type { AnchorCandidate } from './anchor';

/**
 * GC6 — ONE REAL FINAL RANKING DECISION. Written to FAIL FIRST.
 *
 * GC1–GC5 carry a plan to the candidate pool and stop. This proves the plan now
 * changes the ORDER the user actually gets, and — critically — that GC6 rather
 * than GC5 caused it: every causal test below freezes the candidate set and
 * asserts the pool is IDENTICAL before and after, so only order can differ.
 *
 * The composition under test comes from the Phase 1 audit, not from assumption:
 *
 *     decisionScore = matchScore + planNudge
 *
 * `matchScore` already carries general quality + durable preference rules, and
 * `buildPlan` already consumes canonical DNA to choose its targets. Adding
 * `preferenceNudge(dna)` beside the plan would apply the same canonical DNA
 * twice. See `docs/CRITIC-SHIP.md` for the full term table.
 */

const BETTER = 'Better than Furious';

// ── GC2 candidates. Decoy first, so search order can never become identity ──
const CANDIDATES: Record<string, AnchorCandidate[]> = {
  Furious: [
    { id: 501, title: 'Furious 7', mediaType: 'movie', year: 2015 },
    { id: 502, title: 'Furious', mediaType: 'movie', year: 2017 },
  ],
};
const searchCandidates = async (name: string) => CANDIDATES[name] ?? [];

const dims = (o: Partial<Record<string, number>>): TitleDimensions =>
  ({
    pacing: 50, darkness: 50, warmth: 50, humor: 50, suspense: 50, emotion: 50,
    complexity: 50, realism: 50, character: 50, stakes: 50, morality: 50,
    violence: 50, attention: 50, serialized: 50, romance: 50,
    ...o,
  }) as TitleDimensions;

/**
 * THE REALISTIC CRITIC CASE.
 *
 * The anchor is strong on three axes this user loves (darkness, complexity,
 * suspense) AND strong on one they reject (humor). That combination is the
 * whole point: undirected "be different from the anchor" cannot tell the two
 * kinds of trait apart, and GC4 proved the plan can. GC6 must prove the
 * production ORDER now acts on it.
 */
const ANCHOR_DIMS = dims({ darkness: 85, complexity: 82, suspense: 88, humor: 80 });

/** A: keeps everything they liked, fixes the one thing they didn't. */
const A_DIMS = dims({ darkness: 85, complexity: 82, suspense: 88, humor: 12 });
/** B: merely more different from the anchor, in every direction. */
const B_DIMS = dims({ darkness: 20, complexity: 25, suspense: 20, humor: 15 });

const loadDimensions = async (keys: { tmdb_id: number; media_type: 'movie' | 'tv' }[]) => {
  const m = new Map<string, TitleDimensions>();
  for (const k of keys) m.set(dimensionCacheKey(k.media_type, k.tmdb_id), ANCHOR_DIMS);
  return m;
};
const loadNothing = async () => new Map<string, TitleDimensions>();

const NOW = Date.UTC(2026, 5, 1);
const dnaFrom = (d: Record<string, number>) =>
  deriveDna(
    Array.from({ length: 16 }, (_, i): PreferenceEvent => ({
      id: `e${i}`,
      at: NOW - (i + 1) * 86_400_000,
      titleId: `movie:${5000 + i}`,
      action: 'seen_liked',
      dims: d,
      genres: ['thriller'],
    })),
    NOW,
  );

/** Loves dark/complex/tense, rejects jokey. */
const DNA_DARK = dnaFrom({ darkness: 85, complexity: 84, suspense: 88, humor: 10 });
/** The exact opposite, equally mature. */
const DNA_LIGHT = dnaFrom({ darkness: 15, complexity: 16, suspense: 12, humor: 90 });

/** THE FROZEN POOL. Same ids, same base scores, same dims, every case. */
const POOL: CriticCandidate[] = [
  { id: 9001, mediaType: 'movie', matchScore: 70, generalScore: 70, dims: B_DIMS },
  { id: 9002, mediaType: 'movie', matchScore: 70, generalScore: 70, dims: A_DIMS },
];
const A = candidateKey('movie', 9002);
const B = candidateKey('movie', 9001);

/** The real GC1→GC5 orchestration, entered through the production gate. */
async function planFor(text: string, dna: ReturnType<typeof dnaFrom>, load = loadDimensions) {
  const decision = routeAsk(text, 'legacy');
  const state = await buildCriticState({
    request: decision.request!,
    dna,
    hard: { mediaType: 'movie' },
    searchCandidates,
    loadDimensions: load,
    anchorKeywordIds: [9001],
    anchorGenreIds: [53],
  });
  return state;
}

const order = (r: { decisions: { key: string }[] }) => r.decisions.map((d) => d.key);
const poolOf = (r: { decisions: { key: string }[] }) => [...order(r)].sort();

// ───────────────────────────────────────────────────────────────────────────
// 1 · THE CAUSALITY GATE — same pool, order changes
// ───────────────────────────────────────────────────────────────────────────

describe('GC6 · the plan changes the order the user actually gets', () => {
  it('1 · same candidate set, plan present → A beats B', async () => {
    const s = await planFor(BETTER, DNA_DARK);
    const ranked = rankCriticCandidates(POOL, s.plan);
    expect(order(ranked)).toEqual([A, B]);
    expect(ranked.applied).toBe(true);
  });

  it('2 · SAME-POOL PROOF — retrieval did not cause this, ranking did', async () => {
    /* The assertion that separates GC6 from GC5. Membership is identical
       before and after; only the sequence moved. */
    const s = await planFor(BETTER, DNA_DARK);
    const ranked = rankCriticCandidates(POOL, s.plan);
    expect(poolOf(ranked)).toEqual([...POOL.map((c) => candidateKey(c.mediaType, c.id))].sort());
    expect(ranked.decisions).toHaveLength(POOL.length);
  });

  it('3 · direction matches the plan — preserve kept, avoid fixed', async () => {
    const s = await planFor(BETTER, DNA_DARK);
    const kinds = new Map(s.plan.instructions.map((i) => [i.axis, i.kind]));
    /* The plan must be making the distinction, not merely producing a number:
       keep the three the user likes, drop the one they don't. */
    expect(kinds.get('darkness')).toBe('preserve');
    expect(kinds.get('complexity')).toBe('preserve');
    expect(kinds.get('suspense')).toBe('preserve');
    expect(kinds.get('humor')).toBe('avoid');

    const ranked = rankCriticCandidates(POOL, s.plan);
    const a = ranked.decisions.find((d) => d.key === A)!;
    const b = ranked.decisions.find((d) => d.key === B)!;
    expect(a.criticNudge).toBeGreaterThan(b.criticNudge);
    expect(a.criticAxes).toContain('humor');
  });

  it('4 · a candidate merely DIFFERENT from the anchor does not win', async () => {
    const s = await planFor(BETTER, DNA_DARK);
    const ranked = rankCriticCandidates(POOL, s.plan);
    expect(order(ranked)[0]).toBe(A);
    expect(order(ranked)[0]).not.toBe(B);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2 · OPPOSITE USER — personalization is real, not decorative
// ───────────────────────────────────────────────────────────────────────────

describe('GC6 · opposite mature taste produces the opposite order', () => {
  it('5 · same anchors, same candidates, same base scores — order flips', async () => {
    const dark = rankCriticCandidates(POOL, (await planFor(BETTER, DNA_DARK)).plan);
    const light = rankCriticCandidates(POOL, (await planFor(BETTER, DNA_LIGHT)).plan);
    expect(poolOf(dark)).toEqual(poolOf(light)); // identical membership
    expect(order(dark)).not.toEqual(order(light));
    expect(order(dark)[0]).toBe(A);
    expect(order(light)[0]).toBe(B);
  });

  it('6 · the plans themselves differ, so the order is not a coincidence', async () => {
    const dark = (await planFor(BETTER, DNA_DARK)).plan;
    const light = (await planFor(BETTER, DNA_LIGHT)).plan;
    const shape = (p: typeof dark) =>
      p.instructions.map((i) => `${i.axis}:${i.kind}:${Math.round(i.target)}`).sort();
    expect(shape(dark)).not.toEqual(shape(light));
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 3 · INERTNESS — no objective means exactly the old behaviour
// ───────────────────────────────────────────────────────────────────────────

describe('GC6 · absent or powerless critic leaves ordering byte-identical', () => {
  it('7 · no plan → input order preserved exactly', () => {
    const ranked = rankCriticCandidates(POOL, undefined);
    expect(order(ranked)).toEqual([B, A]); // the order POOL was given in
    expect(ranked.applied).toBe(false);
    expect(ranked.decisions.every((d) => d.criticNudge === 0)).toBe(true);
  });

  it('8 · authority 0 → input order preserved exactly', async () => {
    /* An anchor with no cached fingerprint. Identity resolved, nothing to say. */
    const s = await planFor(BETTER, DNA_DARK, loadNothing);
    expect(s.objective.authority).toBe(0);
    const ranked = rankCriticCandidates(POOL, s.plan);
    expect(order(ranked)).toEqual([B, A]);
    expect(ranked.applied).toBe(false);
  });

  it('9 · a candidate with NO cached dims gets exactly zero, never a neutral 50', async () => {
    const s = await planFor(BETTER, DNA_DARK);
    const mixed: CriticCandidate[] = [
      { id: 9003, mediaType: 'movie', matchScore: 70, generalScore: 70 }, // no dims
      ...POOL,
    ];
    const ranked = rankCriticCandidates(mixed, s.plan);
    const blind = ranked.decisions.find((d) => d.key === candidateKey('movie', 9003))!;
    expect(blind.criticNudge).toBe(0);
    expect(blind.fingerprinted).toBe(false);
    expect(blind.criticAxes).toEqual([]);
    expect(blind.decisionScore).toBe(blind.matchScore);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 4 · AUTHORITY AND BOUNDS
// ───────────────────────────────────────────────────────────────────────────

describe('GC6 · the critic is a lens, never the lens', () => {
  it('10 · a materially stronger baseline cannot be overpowered', async () => {
    const s = await planFor(BETTER, DNA_DARK);
    /* B is 25 points better on durable merit and is the WORST possible fit for
       the plan. The critic must not be able to buy that gap: ±10 is the bound,
       so the widest possible swing is 20. */
    const strongB: CriticCandidate[] = [
      { id: 9001, mediaType: 'movie', matchScore: 95, generalScore: 95, dims: B_DIMS },
      { id: 9002, mediaType: 'movie', matchScore: 70, generalScore: 70, dims: A_DIMS },
    ];
    const ranked = rankCriticCandidates(strongB, s.plan);
    expect(order(ranked)[0]).toBe(B);
  });

  it('11 · every contribution stays within ±CRITIC_NUDGE_MAX', async () => {
    expect(CRITIC_NUDGE_MAX).toBe(10);
    for (const dna of [DNA_DARK, DNA_LIGHT]) {
      const s = await planFor(BETTER, dna);
      for (const d of rankCriticCandidates(POOL, s.plan).decisions) {
        expect(Math.abs(d.criticNudge)).toBeLessThanOrEqual(CRITIC_NUDGE_MAX);
      }
    }
  });

  it('12 · MIN_RANK_CONF untouched', () => {
    expect(MIN_RANK_CONF).toBe(0.25);
  });

  it('13 · decisionScore is exactly matchScore + criticNudge — no hidden term', async () => {
    const s = await planFor(BETTER, DNA_DARK);
    for (const d of rankCriticCandidates(POOL, s.plan).decisions) {
      expect(d.decisionScore).toBeCloseTo(d.matchScore + d.criticNudge, 10);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 5 · DISPLAY SEMANTICS AND DOUBLE COUNTING
// ───────────────────────────────────────────────────────────────────────────

describe('GC6 · the request-specific score is not a personal rating', () => {
  it('14 · matchScore and generalScore survive the ranking untouched', async () => {
    const s = await planFor(BETTER, DNA_DARK);
    const ranked = rankCriticCandidates(POOL, s.plan);
    for (const d of ranked.decisions) {
      const src = POOL.find((c) => candidateKey(c.mediaType, c.id) === d.key)!;
      expect(d.matchScore).toBe(src.matchScore);
      expect(d.generalScore).toBe(src.generalScore);
    }
  });

  it('15 · the route orders by decisionScore but does not overwrite matchScore', () => {
    const route = readFileSync('src/app/api/ask/route.ts', 'utf8');
    expect(route).toContain('rankCriticCandidates');
    /* The card keeps showing its durable Match. Overwriting it with a
       request-specific number would turn "best answer to what you asked right
       now" into "what we think of you", which is a different claim entirely. */
    expect(route).not.toMatch(/matchScore:\s*d\.decisionScore/);
    expect(route).not.toMatch(/matchScore:\s*decisionScore/);
  });

  it('16 · NO preferenceNudge is stacked on top of matchScore', () => {
    /* THE DOUBLE-COUNT GUARD. `buildPlan` already consumes canonical DNA to
       choose its targets; adding preferenceNudge beside it would apply the same
       evidence twice, invisibly. */
    const decide = readFileSync('src/lib/critic/decide.ts', 'utf8');
    expect(decide).not.toContain('preferenceNudge(');
    const route = readFileSync('src/app/api/ask/route.ts', 'utf8');
    const criticBlock = route.slice(route.indexOf('buildCriticState'), route.indexOf('// 1) Named-title'));
    expect(criticBlock).not.toContain('preferenceNudge');
  });

  it('17 · no critic state is written to permanent Taste DNA', () => {
    const decide = readFileSync('src/lib/critic/decide.ts', 'utf8');
    for (const forbidden of ['recordEvents', 'preference_events', 'upsert', 'insert(']) {
      expect(decide, `decide.ts must not persist: ${forbidden}`).not.toContain(forbidden);
    }
    const route = readFileSync('src/app/api/ask/route.ts', 'utf8');
    const criticBlock = route.slice(route.indexOf('buildCriticState'), route.indexOf('// 1) Named-title'));
    expect(criticBlock).not.toContain('recordEvents');
    expect(criticBlock).not.toContain('preference_events');
  });

  it('18 · no request-path AI or classification was added', () => {
    for (const f of ['src/lib/critic/decide.ts', 'src/lib/critic/orchestrate.ts']) {
      const src = readFileSync(f, 'utf8');
      expect(src).not.toContain('openai');
      expect(src).not.toContain('anthropic');
      expect(src).not.toContain('getTitleDimensions'); // the classifier
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 6 · IDENTITY AND PRODUCTION WIRING
// ───────────────────────────────────────────────────────────────────────────

describe('GC6 · identity and the real call site', () => {
  it('19 · candidate identity is mediaType + tmdbId, never a title string', async () => {
    const s = await planFor(BETTER, DNA_DARK);
    for (const d of rankCriticCandidates(POOL, s.plan).decisions) {
      expect(d.key).toMatch(/^(movie|tv)-\d+$/);
    }
    // A movie and a series sharing a numeric id must not collide.
    expect(candidateKey('movie', 42)).not.toBe(candidateKey('tv', 42));
  });

  it('20 · the production Ask path hydrates candidate dims cache-only', () => {
    const route = readFileSync('src/app/api/ask/route.ts', 'utf8');
    const criticBlock = route.slice(route.indexOf('runStrands('), route.indexOf('// 1) Named-title'));
    expect(criticBlock).toContain('getCachedDimensions');
    expect(criticBlock).toContain('rankCriticCandidates');
  });

  it('21 · the comparative response is ordered by the GC6 decision', () => {
    const route = readFileSync('src/app/api/ask/route.ts', 'utf8');
    const criticBlock = route.slice(route.indexOf('runStrands('), route.indexOf('// 1) Named-title'));
    /* The returned items come from the ranked decisions, not from the raw
       strand order. */
    expect(criticBlock).toMatch(/decisions/);
  });

  it('22 · finalRankingConsumesPlan is now true, and honestly so', () => {
    const orch = readFileSync('src/lib/critic/orchestrate.ts', 'utf8');
    expect(orch).not.toContain('finalRankingConsumesPlan: false');
    const route = readFileSync('src/app/api/ask/route.ts', 'utf8');
    expect(route).toContain('finalRankingConsumesPlan');
  });
});
