import { describe, it, expect } from 'vitest';
import { rankWithPreference, PREF_NUDGE_MAX, MIN_RANK_CONF } from '@/lib/preference/rank';
import { deriveDna } from '@/lib/preference/engine';
import type { PreferenceEvent } from '@/lib/preference/types';
import { objectiveAuthority, type CriticObjective, type ResolvedAnchor } from './objective';

/**
 * GC8 — MATERIAL DEPENDENCE. THE CAUSALITY GATE.
 *
 * Written to FAIL FIRST, deliberately. The whole risk in this workstream is
 * building an impressive interpretation layer on top of a ranker that never
 * reads it — an LLM that names anchors while only keywords reach retrieval, an
 * interpretation string telling the user we "kept the feel of" two films the
 * ranker never received. A test written AFTER the wiring would pass for the
 * wrong reason and prove nothing.
 *
 * So this asserts the one thing that cannot be faked: with EVERYTHING else held
 * constant, changing only the Recommendation Objective must change the ORDER
 * the production ranker returns.
 *
 * ── WHAT IS HELD CONSTANT ─────────────────────────────────────────────────
 *   the candidate set              same array, same ids
 *   each candidate's base score    same `objective` values
 *   the user's Taste DNA           same derived `DnaState`, same events
 *   the ranking function           the production `rankWithPreference`
 *   thresholds                     `MIN_RANK_CONF` imported, never redefined
 *
 * The ONLY difference between case A and case B is the anchors.
 *
 * ── WHAT THIS TEST REFUSES TO DO ──────────────────────────────────────────
 * No mock of the ranker. No hand-authored rank scores. No per-case candidate
 * set. No per-case DNA. No assertion on explanation copy — copy changing is
 * exactly the failure mode this exists to catch. It does not check that critic
 * data merely EXISTS; it checks that the returned order differs.
 */

/** Base scores are identical across cases and deliberately CLOSE, so a bounded
 *  signal can legitimately reorder them without needing to overpower anything. */
const CANDIDATES = [
  { id: 'tense-thriller', objective: 70, dims: { darkness: 85, pace: 80, humor: 10 }, genres: ['thriller'] },
  { id: 'warm-comedy', objective: 70, dims: { darkness: 15, pace: 45, humor: 90 }, genres: ['comedy'] },
];

/** One user, one profile, used by BOTH cases. */
const NOW = Date.UTC(2026, 0, 20);
const events: PreferenceEvent[] = Array.from({ length: 12 }, (_, i) => ({
  id: `e${i}`,
  at: NOW - (i + 1) * 86_400_000,
  titleId: `movie:${1000 + i}`,
  action: 'seen_liked' as const,
  dims: { darkness: 60, pace: 60, humor: 50 },
  genres: ['drama'],
}));
const DNA = deriveDna(events, NOW);

const anchor = (
  id: string,
  dims: Record<string, number>,
  confidence = 1,
): ResolvedAnchor => ({
  titleId: `movie:${id}`,
  tmdbId: Number(id),
  mediaType: 'movie',
  spokenAs: id,
  dims,
  confidence,
});

/** Case A: the user names two BLEAK, fast films and asks for better. */
const ANCHORS_BLEAK = [
  anchor('101', { darkness: 90, pace: 85, humor: 5 }),
  anchor('102', { darkness: 88, pace: 80, humor: 8 }),
];

/** Case B: same relation, same everything — two WARM, funny films instead. */
const ANCHORS_WARM = [
  anchor('201', { darkness: 12, pace: 40, humor: 92 }),
  anchor('202', { darkness: 18, pace: 42, humor: 88 }),
];

const objectiveFor = (anchors: ResolvedAnchor[]): CriticObjective => ({
  relation: 'better_than',
  anchors,
  authority: objectiveAuthority(anchors),
});

const orderOf = (critic: CriticObjective) =>
  rankWithPreference(CANDIDATES, DNA, { corrections: {}, critic }).map((r) => r.id);

describe('GC8 — the Recommendation Objective must change the ranking', () => {
  it('the two cases are identical apart from the anchors', () => {
    /* Guards the guard. If a later edit accidentally varies the candidates,
       the DNA or the base scores, the headline assertion below would still pass
       and would be proving nothing. */
    const a = objectiveFor(ANCHORS_BLEAK);
    const b = objectiveFor(ANCHORS_WARM);
    expect(a.relation).toBe(b.relation);
    expect(a.anchors.length).toBe(b.anchors.length);
    expect(a.authority).toBe(b.authority);
    expect(CANDIDATES.map((c) => c.objective)).toEqual([70, 70]);
    expect(MIN_RANK_CONF).toBe(0.25);
  });

  it('THE GATE — swapping the anchors materially changes the order', () => {
    /* RED against the pre-critic architecture: `rankWithPreference` accepts the
       objective and ignores it, so both calls return the identical order and
       this fails. That failure IS the proof that the ranker had no causal
       dependency on the critic output. */
    const bleakOrder = orderOf(objectiveFor(ANCHORS_BLEAK));
    const warmOrder = orderOf(objectiveFor(ANCHORS_WARM));
    expect(bleakOrder).not.toEqual(warmOrder);
  });

  it('and it moves in the direction a critic would actually argue', () => {
    /* Not merely "different". `better_than` over two bleak films should not
       hand back the bleakest thing on the shelf — the anchors are a BAR, not a
       template, and the user asking for better implies the anchors did not
       fully land. */
    const bleakOrder = orderOf(objectiveFor(ANCHORS_BLEAK));
    const warmOrder = orderOf(objectiveFor(ANCHORS_WARM));
    expect(bleakOrder[0]).toBe('warm-comedy');
    expect(warmOrder[0]).toBe('tense-thriller');
  });

  it('the critic signal is BOUNDED and cannot dominate the base score', () => {
    /* The deterministic Watchability score stays authoritative. A candidate 40
       points ahead on merit must not be overtaken by an anchor comparison. */
    const lopsided = [
      { ...CANDIDATES[0]!, objective: 95 },
      { ...CANDIDATES[1]!, objective: 55 },
    ];
    const order = rankWithPreference(lopsided, DNA, {
      corrections: {},
      critic: objectiveFor(ANCHORS_BLEAK),
    }).map((r) => r.id);
    expect(order[0]).toBe('tense-thriller');
  });

  it('no objective means no change at all', () => {
    /* Every existing caller passes no critic. Their behaviour must be
       byte-identical, or this became a silent global ranking change. */
    const withoutCritic = rankWithPreference(CANDIDATES, DNA, { corrections: {} });
    const withEmpty = rankWithPreference(CANDIDATES, DNA, {
      corrections: {},
      critic: { relation: 'better_than', anchors: [], authority: 0 },
    });
    expect(withEmpty.map((r) => r.finalScore)).toEqual(withoutCritic.map((r) => r.finalScore));
  });

  it('an unresolved anchor carries no authority, so it cannot move anything', () => {
    /* Uncertainty reduces authority. An anchor with no fingerprint is a name we
       failed to understand, and guessing from it would be worse than the
       keyword bag this replaces. */
    const unresolved: ResolvedAnchor[] = [
      { titleId: 'movie:999', tmdbId: 999, mediaType: 'movie', spokenAs: 'Furious', confidence: 0.2 },
    ];
    expect(objectiveAuthority(unresolved)).toBe(0);
    const order = orderOf({ relation: 'better_than', anchors: unresolved, authority: 0 });
    expect(order).toEqual(rankWithPreference(CANDIDATES, DNA, { corrections: {} }).map((r) => r.id));
  });

  it('partial resolution earns partial authority', () => {
    const half = objectiveAuthority([ANCHORS_BLEAK[0]!, { ...ANCHORS_BLEAK[1]!, dims: undefined }]);
    const full = objectiveAuthority(ANCHORS_BLEAK);
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(full);
  });

  it('the contribution stays inside the declared bound', () => {
    const ranked = rankWithPreference(CANDIDATES, DNA, {
      corrections: {},
      critic: objectiveFor(ANCHORS_BLEAK),
    });
    for (const r of ranked) {
      const delta = Math.abs(r.finalScore - r.objective);
      expect(delta).toBeLessThanOrEqual(PREF_NUDGE_MAX * 2 + 1e-9);
    }
  });
});
