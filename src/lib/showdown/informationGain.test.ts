import { describe, it, expect } from 'vitest';
import { nextScanMatchup, contestedBoost, SCAN_DECISIONS } from './scanner';
import type { DiagnosticTitle } from '@/lib/voice/quickdna/definition';
import type { TraitKey, TraitProfile } from '@/lib/voice/quickdna/traits';

/**
 * WHY DID THESE TWO TITLES GET PUT TOGETHER?
 *
 * The selector was already information-theoretic — gain, attribution
 * confidence, coverage need, recognition, novelty and a "closest call" term,
 * all deterministic. What it could not see was CONTRADICTION, and that blind
 * spot is structural rather than an oversight: every uncertainty term reads
 * `traitUncertainty(profile, key)`, and a profile is a fold. An axis pushed to
 * 90 and then to 10 lands near 50 carrying the evidence of both, so it reads as
 * a confident "no strong opinion" and the planner stops asking — about the one
 * axis the player has actively argued with themselves over.
 *
 * These tests build pairs that are equivalent on every other term so the only
 * thing that can decide the winner is the new signal. No mocked score is
 * injected and no threshold is relaxed: they call the production selector.
 */

const title = (
  id: string,
  traits: Array<[TraitKey, number] | [TraitKey, number, boolean]>,
  recognition = 0.9,
): DiagnosticTitle => ({
  id,
  title: id,
  year: 2000,
  tmdbId: Number(id.replace(/\D/g, '')) || 1,
  recognition,
  traits: traits.map(([key, strength, invert]) => ({ key, strength, ...(invert ? { invert } : {}) })),
});

/* TWO PAIRS, DELIBERATELY SYMMETRIC.
   Same recognition, same trait strengths, same number of separating axes, and
   two axes the profile is equally unsure about — so gain, attribution and
   answerability cannot break the tie. Only contestedness can. */
const POOL: DiagnosticTitle[] = [
  title('cA1', [['comedy', 0.9]]),
  title('cA2', [['comedy', 0.9, true]]),
  title('hB1', [['horrorTolerance', 0.9]]),
  title('hB2', [['horrorTolerance', 0.9, true]]),
];

/** Equal, middling certainty on both axes: neither is "resolved". */
const EVEN: TraitProfile = {
  comedy: { pref: 50, evidence: 0.4 },
  horrorTolerance: { pref: 50, evidence: 0.4 },
};

const ctx = (contested?: ReadonlyMap<TraitKey, number>) => ({
  profile: EVEN,
  seenTitleIds: [] as string[],
  recentAxes: [] as TraitKey[],
  // Past the sweep phase, where the planner is testing hypotheses rather than
  // mapping unexplored territory.
  decisionIndex: 12,
  total: SCAN_DECISIONS,
  pool: POOL,
  ...(contested ? { contested } : {}),
});

const axisOf = (m: { left: DiagnosticTitle; right: DiagnosticTitle }) =>
  m.left.traits[0]!.key;

describe('the pair that settles an argument wins', () => {
  it('THE PROOF — a contested axis beats an equally uncertain quiet one', () => {
    /* Without the signal these two pairs are interchangeable. With it, the
       planner must reach for the axis the player contradicted themselves on. */
    const quiet = nextScanMatchup(ctx());
    expect(quiet).not.toBeNull();

    const contested = nextScanMatchup(ctx(new Map([['horrorTolerance' as TraitKey, 1]])));
    expect(contested).not.toBeNull();
    expect(axisOf(contested!)).toBe('horrorTolerance');
    expect(new Set([contested!.left.id, contested!.right.id])).toEqual(new Set(['hB1', 'hB2']));
  });

  it('and it follows the contradiction, not a hardcoded axis', () => {
    // Same machinery, other axis — proves it is reading the map, not a favourite.
    const m = nextScanMatchup(ctx(new Map([['comedy' as TraitKey, 1]])));
    expect(axisOf(m!)).toBe('comedy');
    expect(new Set([m!.left.id, m!.right.id])).toEqual(new Set(['cA1', 'cA2']));
  });

  it('changes NOTHING for a player who has been consistent', () => {
    /* The boost is exactly 1 when no axis is contested, so a consistent player
       gets the planner that already worked — and the persona simulations and
       every existing caller are unaffected. */
    const withEmpty = nextScanMatchup(ctx(new Map()));
    const without = nextScanMatchup(ctx());
    expect(withEmpty!.left.id).toBe(without!.left.id);
    expect(withEmpty!.right.id).toBe(without!.right.id);
  });
});

describe('the boost is bounded and earned', () => {
  it('a pair that separates nothing contested scores exactly 1', () => {
    const m = new Map([['horrorTolerance' as TraitKey, 1]]);
    expect(contestedBoost([{ key: 'comedy' as TraitKey, sep: 1 }], m)).toBe(1);
  });

  it('is weighted by SEPARATION — a passing mention earns little', () => {
    const m = new Map([['horrorTolerance' as TraitKey, 1]]);
    const barely = contestedBoost([{ key: 'horrorTolerance' as TraitKey, sep: 0.05 }], m);
    const fully = contestedBoost([{ key: 'horrorTolerance' as TraitKey, sep: 1 }], m);
    expect(barely).toBeLessThan(fully);
    expect(barely).toBeGreaterThan(1);
  });

  it('cannot run away — a huge contradiction is still capped', () => {
    /* It re-ranks among pairs the other terms already consider good. It must
       never be able to buy an unanswerable pair. */
    const m = new Map([['horrorTolerance' as TraitKey, 9999]]);
    expect(contestedBoost([{ key: 'horrorTolerance' as TraitKey, sep: 1 }], m)).toBeLessThanOrEqual(2);
  });

  it('is inert when the caller supplies nothing', () => {
    expect(contestedBoost([{ key: 'comedy' as TraitKey, sep: 1 }], undefined)).toBe(1);
  });
});

describe('the existing guarantees still hold', () => {
  it('an uncertain axis outranks one already settled', () => {
    /* The pre-existing mechanism, pinned so the new term cannot mask it: with
       comedy resolved and horror open, the planner asks about horror. */
    const settled: TraitProfile = {
      comedy: { pref: 95, evidence: 12 },
      horrorTolerance: { pref: 50, evidence: 0.2 },
    };
    const m = nextScanMatchup({ ...ctx(), profile: settled });
    expect(axisOf(m!)).toBe('horrorTolerance');
  });

  it('a title already shown is never dealt again', () => {
    const m = nextScanMatchup({ ...ctx(), seenTitleIds: ['hB1', 'hB2'] });
    expect(new Set([m!.left.id, m!.right.id])).toEqual(new Set(['cA1', 'cA2']));
  });

  it('returns null rather than repeating itself when the pool is spent', () => {
    expect(nextScanMatchup({ ...ctx(), seenTitleIds: ['cA1', 'cA2', 'hB1'] })).toBeNull();
  });

  it('is deterministic — same input, same pair, every time', () => {
    const a = nextScanMatchup(ctx(new Map([['horrorTolerance' as TraitKey, 1]])));
    const b = nextScanMatchup(ctx(new Map([['horrorTolerance' as TraitKey, 1]])));
    expect([a!.left.id, a!.right.id]).toEqual([b!.left.id, b!.right.id]);
  });
});
