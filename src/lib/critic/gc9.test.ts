import { describe, it, expect } from 'vitest';
import { deriveDna } from '@/lib/preference/engine';
import type { PreferenceEvent } from '@/lib/preference/types';
import type { TitleDimensions } from '@/lib/scoring/dimensions';
import { routeAsk } from './gate';
import { parseCriticRequest } from './request';
import { buildCriticState, type CriticState } from './orchestrate';
import { dimensionCacheKey } from './hydrate';
import { rankCriticCandidates, type CriticCandidate } from './decide';
import { buildComparativeExplanation } from './explain';
import type { AnchorCandidate } from './anchor';
import type { HardConstraints } from './retrieval';

/**
 * GC9 — COUNTERFACTUAL CAUSALITY SUITE.
 *
 * Not "more critic tests". Each of the five sources of meaning is changed ONE
 * AT A TIME with everything else held constant, and the claim under test is
 * always the same: THE ARITHMETIC MOVED, not a label.
 *
 * A factor passes only if the production computation depends on it. Explicitly
 * insufficient, everywhere below:
 *   · an attribution field changed
 *   · a different title name appears in the copy
 *   · a strand label differs
 *   · metadata differs
 *
 * Every path runs the real production functions — `parseCriticRequest`,
 * `buildCriticState`, `rankCriticCandidates`, `planNudge`,
 * `buildComparativeExplanation`. Fixtures are controlled; logic is never
 * re-implemented here.
 */

// ═══ FIXTURES ══════════════════════════════════════════════════════════════

const dims = (o: Partial<Record<string, number>>): TitleDimensions =>
  ({
    pacing: 50, darkness: 50, warmth: 50, humor: 50, suspense: 50, emotion: 50,
    complexity: 50, realism: 50, character: 50, stakes: 50, morality: 50,
    violence: 50, attention: 50, serialized: 50, romance: 50,
    ...o,
  }) as TitleDimensions;

const NOW = Date.UTC(2026, 5, 1);
const dnaFrom = (d: Record<string, number>) =>
  deriveDna(
    Array.from({ length: 16 }, (_, i): PreferenceEvent => ({
      id: `e${i}`,
      at: NOW - (i + 1) * 86_400_000,
      titleId: `movie:${9000 + i}`,
      action: 'seen_liked',
      dims: d,
      genres: ['thriller'],
    })),
    NOW,
  );

/** Mature and decisive: wants dark/tense/complex, rejects jokey. */
const DNA_DARK = dnaFrom({ darkness: 86, suspense: 88, complexity: 84, humor: 10 });
/** Its mirror image, equally mature. */
const DNA_LIGHT = dnaFrom({ darkness: 14, suspense: 12, complexity: 16, humor: 90 });

/** Two anchors with genuinely different fingerprints, same identity machinery. */
const ANCHOR_TENSE = dims({ darkness: 85, suspense: 88, complexity: 82, humor: 80 });
const ANCHOR_COZY = dims({ darkness: 18, suspense: 15, complexity: 20, humor: 82 });

const CANDIDATES: Record<string, AnchorCandidate[]> = {
  Furious: [
    { id: 501, title: 'Furious 7', mediaType: 'movie', year: 2015 }, // decoy first
    { id: 502, title: 'Furious', mediaType: 'movie', year: 2017 },
  ],
  'Widows Bay': [
    { id: 601, title: 'Widows', mediaType: 'movie', year: 2018 },
    { id: 602, title: 'Widows Bay', mediaType: 'movie', year: 2021 },
  ],
  Meadowlark: [{ id: 701, title: 'Meadowlark', mediaType: 'movie', year: 2019 }],
};
const searchCandidates = async (name: string) => CANDIDATES[name] ?? [];

/** A loader that gives EVERY anchor the same fingerprint — the controlled knob. */
const loaderFor = (d: TitleDimensions) =>
  async (keys: { tmdb_id: number; media_type: 'movie' | 'tv' }[]) => {
    const m = new Map<string, TitleDimensions>();
    for (const k of keys) m.set(dimensionCacheKey(k.media_type, k.tmdb_id), d);
    return m;
  };
const loadNothing = async () => new Map<string, TitleDimensions>();

interface RunOpts {
  dna?: ReturnType<typeof dnaFrom>;
  anchorDims?: TitleDimensions;
  hard?: HardConstraints;
  load?: (k: { tmdb_id: number; media_type: 'movie' | 'tv' }[]) => Promise<Map<string, TitleDimensions>>;
}

/** The real production chain, entered through the production gate. */
async function state(text: string, o: RunOpts = {}): Promise<CriticState> {
  const decision = routeAsk(text, 'legacy');
  expect(decision.request, `no critic request parsed: ${text}`).not.toBeNull();
  return buildCriticState({
    request: decision.request!,
    dna: o.dna ?? DNA_DARK,
    hard: o.hard ?? { mediaType: 'movie' },
    searchCandidates,
    loadDimensions: o.load ?? loaderFor(o.anchorDims ?? ANCHOR_TENSE),
    anchorKeywordIds: [9001, 9002],
    anchorGenreIds: [53],
  });
}

const rank = (pool: CriticCandidate[], s: CriticState) => rankCriticCandidates(pool, s.plan);
const order = (r: ReturnType<typeof rank>) => r.decisions.map((d) => d.key);
const nudgeOf = (r: ReturnType<typeof rank>, key: string) =>
  r.decisions.find((d) => d.key === key)!.criticNudge;

const explainTop = (s: CriticState, r: ReturnType<typeof rank>) => {
  const top = r.decisions[0]!;
  return buildComparativeExplanation({
    relation: s.objective.relation,
    anchors: s.objective.anchors,
    contributions: top.contributions,
    nudge: top.criticNudge,
  });
};
const prose = (e: ReturnType<typeof explainTop>) => (e ? [...e.helped, ...e.cautions].join(' ') : '');

/** Identical base scores everywhere, so only the critic can decide anything. */
const cand = (id: number, d: TitleDimensions): CriticCandidate => ({
  id, mediaType: 'movie', matchScore: 70, generalScore: 70, dims: d,
});

// ═══ GC9-A · ANCHOR ════════════════════════════════════════════════════════

describe('GC9-A · the anchor is causal', () => {
  /* ── HOW THE ANCHOR ACTUALLY REACHES THE ARITHMETIC ──────────────────────
     `planNudge` consumes `target` and `strength` only; `kind` is explanatory.
     That is correct — "preserve at 85" and "avoid, move to 86" point at the
     same destination, so they SHOULD score alike — but it means the anchor's
     causal channels for RANKING are precisely two:

       1. WHICH AXES get an instruction at all (the anchor must express one)
       2. THE TARGET, wherever the user has no confident belief to override it

     An earlier draft of this test used two anchors that expressed the SAME
     axes for a user confident on all of them, which neutralises both channels:
     the nudges moved 9.51 → 9.64 and the order never changed. It passed a
     `not.toBeCloseTo` assertion while proving nothing, which is exactly the
     decorative pass this gate exists to reject. The fixtures below exercise
     the real channels and demand an ORDER FLIP. */

  /** Expresses darkness + suspense; deliberately silent (50) elsewhere. */
  const ANCHOR_TENSE_ONLY = dims({ darkness: 88, suspense: 90 });
  /** Expresses humour + warmth; silent on darkness and suspense. */
  const ANCHOR_FUNNY_ONLY = dims({ humor: 88, warmth: 85 });

  const X = cand(1, dims({ darkness: 90, suspense: 92, humor: 85 }));
  const Y = cand(2, dims({ darkness: 15, suspense: 12, humor: 8 }));
  const POOL = [X, Y];
  const KX = 'movie-1';
  const KY = 'movie-2';
  /** Material = bigger than any rounding wobble, on a ±10 scale. */
  const MATERIAL = 2;

  it('A1 · a different anchor fingerprint changes which axes the plan speaks about', async () => {
    const tense = await state('Better than Furious', { anchorDims: ANCHOR_TENSE_ONLY });
    const funny = await state('Better than Furious', { anchorDims: ANCHOR_FUNNY_ONLY });
    const axes = (s: CriticState) => s.plan.instructions.map((i) => i.axis).sort();
    expect(axes(tense)).toEqual(['darkness', 'suspense']);
    expect(axes(funny)).toEqual(['humor']); // warmth: no confident belief, better_than licenses nothing
    expect(axes(tense)).not.toEqual(axes(funny));
  });

  it('A2 · the RANKING ARITHMETIC depends on the anchor — the order flips', async () => {
    const tense = rank(POOL, await state('Better than Furious', { anchorDims: ANCHOR_TENSE_ONLY }));
    const funny = rank(POOL, await state('Better than Furious', { anchorDims: ANCHOR_FUNNY_ONLY }));
    // Same pool, same DNA, same relation, same modifiers, same base scores.
    expect([...order(tense)].sort()).toEqual([...order(funny)].sort());
    expect(order(tense)[0]).toBe(KX);
    expect(order(funny)[0]).toBe(KY);
    expect(Math.abs(nudgeOf(tense, KX) - nudgeOf(funny, KX))).toBeGreaterThan(MATERIAL);
    expect(Math.abs(nudgeOf(tense, KY) - nudgeOf(funny, KY))).toBeGreaterThan(MATERIAL);
  });

  it('A3 · with no confident DNA the anchor sets the TARGET directly', async () => {
    /* The second channel, isolated: a neutral user cannot override anything, so
       the plan's target IS the anchor's own value and resemblance is the whole
       judgment.

       A dedicated pool, because `like` + neutral DNA preserves EVERY expressed
       axis — including warmth, which `better_than` declines to touch. The A2
       pool has one candidate high on everything, so it resembles both anchors
       and separates nothing. Each candidate here resembles exactly one. */
    const NEUTRAL = deriveDna([], NOW);
    const P = cand(11, dims({ darkness: 90, suspense: 92, humor: 10, warmth: 15 }));
    const Q = cand(12, dims({ darkness: 12, suspense: 10, humor: 90, warmth: 88 }));
    const RESEMBLANCE_POOL = [P, Q];

    const tense = await state('something like Furious', { dna: NEUTRAL, anchorDims: ANCHOR_TENSE_ONLY });
    const funny = await state('something like Furious', { dna: NEUTRAL, anchorDims: ANCHOR_FUNNY_ONLY });
    expect(tense.plan.instructions.find((i) => i.axis === 'darkness')?.target).toBeCloseTo(88, 5);
    expect(funny.plan.instructions.find((i) => i.axis === 'humor')?.target).toBeCloseTo(88, 5);

    expect(order(rank(RESEMBLANCE_POOL, tense))[0]).toBe('movie-11');
    expect(order(rank(RESEMBLANCE_POOL, funny))[0]).toBe('movie-12');
  });

  it('A4 · the explanation follows the contribution trail, not a name swap', async () => {
    const tense = await state('Better than Furious', { anchorDims: ANCHOR_TENSE_ONLY });
    const funny = await state('Better than Furious', { anchorDims: ANCHOR_FUNNY_ONLY });
    const eT = explainTop(tense, rank(POOL, tense));
    const eF = explainTop(funny, rank(POOL, funny));
    // The anchor NAME is identical in both — only its fingerprint moved.
    expect(eT!.anchors).toEqual(['Furious']);
    expect(eF!.anchors).toEqual(['Furious']);
    /* So every difference below is caused by the contribution trail alone,
       which is what "not canned copy with a name substituted in" means. */
    expect(prose(eT)).not.toEqual(prose(eF));
    const axesOf = (e: ReturnType<typeof explainTop>) => e!.axes.map((a) => a.axis).sort();
    expect(axesOf(eT)).toEqual(['darkness', 'suspense']);
    expect(axesOf(eF)).toEqual(['humor']);
  });

  it('A5 · a different anchor IDENTITY reaches a different fingerprint', async () => {
    /* Identity → fingerprint → plan → order, with per-title dims so the only
       thing that changed is WHICH TITLE was resolved. */
    const perTitle = async (keys: { tmdb_id: number; media_type: 'movie' | 'tv' }[]) => {
      const m = new Map<string, TitleDimensions>();
      for (const k of keys) {
        m.set(dimensionCacheKey(k.media_type, k.tmdb_id), k.tmdb_id === 502 ? ANCHOR_TENSE_ONLY : ANCHOR_FUNNY_ONLY);
      }
      return m;
    };
    const furious = await state('Better than Furious', { load: perTitle });
    const meadow = await state('Better than Meadowlark', { load: perTitle });
    expect(furious.objective.anchors[0]!.tmdbId).toBe(502);
    expect(meadow.objective.anchors[0]!.tmdbId).toBe(701);
    const rf = rank(POOL, furious);
    const rm = rank(POOL, meadow);
    expect(order(rf)[0]).toBe(KX);
    expect(order(rm)[0]).toBe(KY);
    expect(Math.abs(nudgeOf(rf, KX) - nudgeOf(rm, KX))).toBeGreaterThan(MATERIAL);
  });
});

// ═══ GC9-B · TASTE DNA ═════════════════════════════════════════════════════

describe('GC9-B · Taste DNA is causal', () => {
  /* A genuine trade-off: each candidate keeps some anchor qualities and drops
     others, so neither is universally better — only a taste can separate them. */
  const KEEPS_TENSION = cand(1, dims({ darkness: 88, suspense: 90, complexity: 85, humor: 12 }));
  const KEEPS_HUMOR = cand(2, dims({ darkness: 15, suspense: 14, complexity: 20, humor: 88 }));
  const POOL = [KEEPS_HUMOR, KEEPS_TENSION];
  const TENSE = 'movie-1';
  const FUNNY = 'movie-2';

  it('B1 · opposite mature DNA reverses the order on an identical pool', async () => {
    const dark = rank(POOL, await state('Better than Furious', { dna: DNA_DARK }));
    const light = rank(POOL, await state('Better than Furious', { dna: DNA_LIGHT }));
    expect([...order(dark)].sort()).toEqual([...order(light)].sort()); // same membership
    expect(order(dark)[0]).toBe(TENSE);
    expect(order(light)[0]).toBe(FUNNY);
  });

  it('B2 · the arithmetic moves, not only the copy', async () => {
    const dark = rank(POOL, await state('Better than Furious', { dna: DNA_DARK }));
    const light = rank(POOL, await state('Better than Furious', { dna: DNA_LIGHT }));
    expect(nudgeOf(dark, TENSE)).toBeGreaterThan(0);
    expect(nudgeOf(light, TENSE)).toBeLessThan(0);
    expect(nudgeOf(dark, FUNNY)).toBeLessThan(0);
    expect(nudgeOf(light, FUNNY)).toBeGreaterThan(0);
  });

  it('B3 · the explanation never claims a preference the DNA does not support', async () => {
    const light = await state('Better than Furious', { dna: DNA_LIGHT });
    const e = explainTop(light, rank(POOL, light));
    const text = prose(e);
    /* This user's mature DNA REJECTS darkness and suspense. No sentence may
       present either as something their profile favours. */
    expect(text).not.toMatch(/darkness your profile favou?rs/i);
    expect(text).not.toMatch(/suspense your profile favou?rs/i);
    for (const a of e!.axes) {
      if (a.evidence.includes('user_dna')) {
        expect(['darkness', 'suspense', 'complexity', 'humor', 'pacing']).toContain(a.axis);
      }
    }
  });

  it('B4 · a user with NO confident DNA gets no taste claim at all', async () => {
    const blank = await state('something like Furious', { dna: deriveDna([], NOW) });
    const e = explainTop(blank, rank(POOL, blank));
    if (e) {
      expect(prose(e)).not.toMatch(/your taste|your profile/i);
      for (const a of e.axes) expect(a.evidence).not.toContain('user_dna');
    }
  });
});

// ═══ GC9-C · RELATIONSHIP (load-bearing) ═══════════════════════════════════

describe('GC9-C · the relationship is causal', () => {
  /* THE ORIGINAL DEFECT CLASS. `like X` and `better than X` once produced a
     byte-identical search.

     RESEMBLANCE AND IMPROVEMENT GENUINELY DISAGREE HERE:
       TWIN   nearly identical to the anchor — INCLUDING its high humour, which
              this user's mature DNA rejects
       BETTER keeps the anchor qualities the DNA likes, drops the humour */
  const TWIN = cand(1, dims({ darkness: 84, suspense: 87, complexity: 81, humor: 79 }));
  const BETTER = cand(2, dims({ darkness: 86, suspense: 89, complexity: 83, humor: 10 }));
  const POOL = [BETTER, TWIN];
  const T = 'movie-1';
  const B = 'movie-2';

  /** A user with no confident DNA — so the RELATION alone must do the work. */
  const NEUTRAL = deriveDna([], NOW);

  it('C1 · like vs better_than produce different plans for a neutral user', async () => {
    const like = await state('something like Furious', { dna: NEUTRAL });
    const better = await state('Better than Furious', { dna: NEUTRAL });
    /* `like` may preserve the anchor's shape on relation alone; `better_than`
       may NOT — "the anchor has it" is one fact, and GC4 refuses to preserve on
       one fact. That asymmetry is the relation being load-bearing. */
    expect(like.plan.instructions.length).toBeGreaterThan(0);
    expect(better.plan.instructions.length).toBe(0);
  });

  it('C2 · with a neutral user, like ranks the twin top and better_than is inert', async () => {
    const like = rank(POOL, await state('something like Furious', { dna: NEUTRAL }));
    const better = rank(POOL, await state('Better than Furious', { dna: NEUTRAL }));
    expect(order(like)[0]).toBe(T); // resemblance is the goal
    expect(like.applied).toBe(true);
    // Nothing licensed: no instructions, so no movement and an honest report.
    expect(better.applied).toBe(false);
    expect(better.decisions.every((d) => d.criticNudge === 0)).toBe(true);
  });

  it('C3 · with a confident user, better_than prefers the improved candidate', async () => {
    const better = rank(POOL, await state('Better than Furious', { dna: DNA_DARK }));
    expect(order(better)[0]).toBe(B);
    expect(nudgeOf(better, B)).toBeGreaterThan(nudgeOf(better, T));
  });

  it('C4 · the relation changes the JUDGMENT, not merely a label or a strand', async () => {
    const like = rank(POOL, await state('something like Furious', { dna: NEUTRAL }));
    const better = rank(POOL, await state('Better than Furious', { dna: DNA_DARK }));
    expect(order(like)).not.toEqual(order(better));
    expect(nudgeOf(like, T)).not.toBeCloseTo(nudgeOf(better, T), 3);
  });

  it('C5 · like_but and blend keep distinct semantics from like', async () => {
    const like = await state('something like Furious', { dna: NEUTRAL });
    const likeBut = await state('Furious but faster', { dna: NEUTRAL });
    const blend = await state('Furious meets Widows Bay', { dna: NEUTRAL });
    expect(like.objective.relation).toBe('like');
    expect(likeBut.objective.relation).toBe('like_but');
    expect(blend.objective.relation).toBe('blend');

    /* `like_but` carries a REQUEST instruction that `like` cannot have — the
       structural difference that stops a future relation collapsing into it. */
    const req = likeBut.plan.instructions.filter((i) => i.evidence.includes('request'));
    expect(req.length).toBeGreaterThan(0);
    expect(like.plan.instructions.some((i) => i.evidence.includes('request'))).toBe(false);

    // `blend` genuinely reasons over BOTH anchors.
    expect(blend.objective.anchors).toHaveLength(2);
  });
});

// ═══ GC9-D · EXPLICIT MODIFIERS ════════════════════════════════════════════

describe('GC9-D · explicit modifiers are causal', () => {
  /* Symmetric around the one axis under test; every other axis is identical, so
     only `pacing` can separate them. */
  const FAST = cand(1, dims({ pacing: 92, darkness: 60, suspense: 60 }));
  const SLOW = cand(2, dims({ pacing: 8, darkness: 60, suspense: 60 }));
  const POOL = [SLOW, FAST];
  const F = 'movie-1';
  const S = 'movie-2';

  /* A neutral anchor on pacing, so the modifier is the only pacing evidence. */
  const NEUTRAL_ANCHOR = dims({ pacing: 50, darkness: 60, suspense: 60 });

  it('D1 · "but faster" and "but slower" prefer opposite candidates', async () => {
    const faster = rank(POOL, await state('Furious but faster', { anchorDims: NEUTRAL_ANCHOR }));
    const slower = rank(POOL, await state('Furious but slower', { anchorDims: NEUTRAL_ANCHOR }));
    expect([...order(faster)].sort()).toEqual([...order(slower)].sort());
    expect(order(faster)[0]).toBe(F);
    expect(order(slower)[0]).toBe(S);
  });

  it('D2 · the pacing instruction carries REQUEST provenance', async () => {
    for (const text of ['Furious but faster', 'Furious but slower']) {
      const s = await state(text, { anchorDims: NEUTRAL_ANCHOR });
      const pacing = s.plan.instructions.find((i) => i.axis === 'pacing');
      expect(pacing, text).toBeDefined();
      expect(pacing!.evidence, text).toContain('request');
    }
  });

  it('D3 · the requested shift LEADS the explanation even when out-magnitudinated', async () => {
    /* GC7's rule, re-proved under a counterfactual: another axis contributes
       more, and the thing the user said outright still comes first. */
    const s = await state('Furious but faster', { anchorDims: dims({ pacing: 50, darkness: 85, suspense: 88 }), dna: DNA_DARK });
    const r = rank([cand(1, dims({ pacing: 92, darkness: 88, suspense: 90 }))], s);
    const e = explainTop(s, r);
    expect(e!.helped[0]).toMatch(/the change you asked for/i);
  });

  it('D4 · a modifier is never restated as a Taste-DNA fact', async () => {
    const s = await state('Furious but faster', { anchorDims: NEUTRAL_ANCHOR, dna: DNA_DARK });
    const e = explainTop(s, rank([FAST], s));
    const line = e!.helped.find((l) => /pacing/i.test(l));
    expect(line).toBeDefined();
    expect(line).not.toMatch(/your profile favou?rs|your taste/i);
  });

  it('D5 · an UNGROUNDED comparative never becomes a ranking instruction', async () => {
    /* "better acted" is directional and real, and there is no `acting` axis.
       It must survive as interpretation evidence and change nothing numerically. */
    const req = parseCriticRequest('something like Furious but better acted')!;
    expect(req.modifiers).toEqual({});
    expect(req.unresolvedModifiers.length).toBeGreaterThan(0);

    const plain = await state('something like Furious', { dna: DNA_DARK });
    const withUngrounded = await state('something like Furious but better acted', { dna: DNA_DARK });
    const shape = (s: CriticState) =>
      s.plan.instructions.map((i) => `${i.axis}:${i.kind}:${Math.round(i.target)}:${i.evidence.join('+')}`).sort();
    expect(shape(withUngrounded)).toEqual(shape(plain));
    expect(nudgeOf(rank(POOL, withUngrounded), F)).toBeCloseTo(nudgeOf(rank(POOL, plain), F), 10);
  });
});

// ═══ GC9-E · REQUEST CONTEXT / HARD CONSTRAINTS ════════════════════════════

describe('GC9-E · user-stated hard context is causal — and only at retrieval', () => {
  const HARD_A: HardConstraints = { mediaType: 'movie' };
  const HARD_B: HardConstraints = { mediaType: 'movie', minYear: 2022, excludeGenreIds: [35] };

  it('E1 · hard context reaches every retrieval strand', async () => {
    const b = await state('Better than Furious', { hard: HARD_B });
    expect(b.hints.hard).toEqual(HARD_B);
    expect(b.hints.strands.length).toBeGreaterThan(1);
    /* GC5's contract: `hard` is applied to EVERY strand by `runStrands`, and no
       strand may carry a relaxed copy of it. The hints object is the single
       carrier — there is no per-strand override field to diverge. */
    for (const s of b.hints.strands) {
      expect(s).not.toHaveProperty('minYear');
      expect(s).not.toHaveProperty('mediaType');
      expect(s).not.toHaveProperty('excludeGenreIds');
    }
  });

  it('E2 · changing hard context changes eligibility', async () => {
    const a = await state('Better than Furious', { hard: HARD_A });
    const b = await state('Better than Furious', { hard: HARD_B });
    expect(a.hints.hard).not.toEqual(b.hints.hard);
    expect(b.hints.hard.minYear).toBe(2022);
    expect(b.hints.hard.excludeGenreIds).toEqual([35]);
  });

  it('E3 · NO critic inference leaks into the hard set', async () => {
    const b = await state('Better than Furious', { hard: HARD_B });
    const blob = JSON.stringify(b.hints.hard);
    expect(blob).not.toContain('9001'); // anchor keyword
    expect(blob).not.toContain('9002');
    expect(blob).not.toContain('53'); // anchor genre
  });

  it('E4 · hard context does NOT mutate the critic plan', async () => {
    /* THE DISTINCTION THAT MATTERS. A factual constraint changes WHAT MAY BE
       RETURNED. It must not change what the critic THINKS about the anchor and
       the user — otherwise "on Netflix" would silently alter our reading of
       their taste. */
    const a = await state('Better than Furious', { hard: HARD_A });
    const b = await state('Better than Furious', { hard: HARD_B });
    const shape = (s: CriticState) =>
      s.plan.instructions.map((i) => `${i.axis}:${i.kind}:${Math.round(i.target)}:${i.evidence.join('+')}`).sort();
    expect(shape(a)).toEqual(shape(b));
    expect(a.objective.relation).toBe(b.objective.relation);
    expect(a.objective.authority).toBe(b.objective.authority);
    expect(a.objective.anchors.map((x) => x.titleId)).toEqual(b.objective.anchors.map((x) => x.titleId));
  });

  it('E5 · and the resulting ranking is identical, because ranking is not retrieval', async () => {
    const POOL = [cand(1, dims({ darkness: 88, suspense: 90 })), cand(2, dims({ darkness: 12, suspense: 10 }))];
    const a = rank(POOL, await state('Better than Furious', { hard: HARD_A }));
    const b = rank(POOL, await state('Better than Furious', { hard: HARD_B }));
    expect(order(a)).toEqual(order(b));
    expect(nudgeOf(a, 'movie-1')).toBeCloseTo(nudgeOf(b, 'movie-1'), 10);
  });
});

// ═══ GC9-F · DETERMINISM + NEGATIVE CONTROLS ═══════════════════════════════

describe('GC9-F · determinism and negative controls', () => {
  const POOL = [cand(1, dims({ darkness: 88, suspense: 90, humor: 10 })), cand(2, dims({ darkness: 12, suspense: 10, humor: 88 }))];

  it('F1 · identical inputs twice → byte-identical plan and ordering', async () => {
    const one = await state('Better than Furious', { dna: DNA_DARK });
    const two = await state('Better than Furious', { dna: DNA_DARK });
    expect(JSON.stringify(two.plan)).toEqual(JSON.stringify(one.plan));
    const r1 = rank(POOL, one);
    const r2 = rank(POOL, two);
    expect(order(r2)).toEqual(order(r1));
    expect(JSON.stringify(r2.decisions)).toEqual(JSON.stringify(r1.decisions));
  });

  it('F2 · an unhydrated anchor drops authority and invents no effect', async () => {
    const s = await state('Better than Furious', { load: loadNothing });
    expect(s.objective.anchors).toHaveLength(1); // identity survived
    expect(s.objective.authority).toBe(0);
    expect(s.plan.instructions).toEqual([]);
    const r = rank(POOL, s);
    expect(r.decisions.every((d) => d.criticNudge === 0)).toBe(true);
    expect(r.applied).toBe(false);
    expect(order(r)).toEqual(['movie-1', 'movie-2']); // input order preserved
  });

  it('F3 · partial resolution lowers authority honestly', async () => {
    const both = await state('Better than Furious or Widows Bay');
    const oneOfTwo = await buildCriticState({
      request: parseCriticRequest('Better than Furious or Widows Bay')!,
      dna: DNA_DARK,
      hard: { mediaType: 'movie' },
      // Only "Furious" resolves; "Widows Bay" finds nothing.
      searchCandidates: async (n) => (n === 'Furious' ? CANDIDATES.Furious! : []),
      loadDimensions: loaderFor(ANCHOR_TENSE),
    });
    expect(both.objective.anchors).toHaveLength(2);
    expect(oneOfTwo.objective.anchors).toHaveLength(1);
    expect(oneOfTwo.objective.authority).toBeLessThan(both.objective.authority);
    expect(oneOfTwo.objective.authority).toBeGreaterThan(0);
  });

  it('F4 · a non-comparative request stays critic-silent', () => {
    for (const t of ['three wrestling movies', 'a boxing movie', 'crime dramas on BritBox', 'Widows Bay']) {
      expect(routeAsk(t, 'legacy').request, t).toBeNull();
      expect(routeAsk(t, 'legacy').comparative, t).toBe(false);
    }
  });

  it('F5 · zero contribution → eligible true, applied false', async () => {
    const s = await state('Better than Furious', { dna: DNA_DARK });
    expect(s.plan.instructions.length).toBeGreaterThan(0);
    expect(s.objective.authority).toBeGreaterThan(0);
    const blind = [{ id: 9, mediaType: 'movie' as const, matchScore: 70, generalScore: 70 }];
    const r = rankCriticCandidates(blind, s.plan);
    expect(r.eligible).toBe(true);
    expect(r.applied).toBe(false);
    expect(r.decisions[0]!.criticNudge).toBe(0);
  });

  it('F6 · the critic contribution stays bounded under every counterfactual', async () => {
    for (const dna of [DNA_DARK, DNA_LIGHT, deriveDna([], NOW)]) {
      for (const text of ['Better than Furious', 'something like Furious', 'Furious but faster']) {
        for (const anchorDims of [ANCHOR_TENSE, ANCHOR_COZY]) {
          const r = rank(POOL, await state(text, { dna, anchorDims }));
          for (const d of r.decisions) expect(Math.abs(d.criticNudge)).toBeLessThanOrEqual(10);
        }
      }
    }
  });
});
