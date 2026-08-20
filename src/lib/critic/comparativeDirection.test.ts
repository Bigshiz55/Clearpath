/**
 * THE STATED DIRECTION MUST DECIDE A COMPARATIVE — measured red on production.
 *
 * ── THE DEPLOYED REPRODUCTION (2026-08-20, taste-dna-proof, job 96556850244) ─
 * With candidate fingerprints finally readable, "I want something darker than
 * Whiplash." and "lighter than Whiplash" both ran the whole critic pipeline —
 * 43 candidates, 42 fingerprinted, authority 1, `applied: true` — and came
 * back with heads sharing three of five titles. Worse, "lighter than Whiplash"
 * returned WHIPLASH ITSELF at #5: the anchor recommended as its own answer.
 *
 * ── THE MECHANISM ─────────────────────────────────────────────────────────
 * `planNudge` pooled every instruction into one mass. A mixed plan for
 * "darker than X" carries ONE stated instruction (strength 0.95) and a
 * preserve instruction for every axis the anchor expresses (strength 0.5
 * each, five or more for any strongly-shaped title) — so the axis the user
 * TYPED owned under a fifth of the budget, at most ±2 points of ±10. Against
 * a production head quality-locked at 87/85/83, resembling the anchor's
 * overall shape outweighed pointing the requested direction, in BOTH
 * directions. The comparison completed and did not matter — the same failure
 * `statedAxisAuthority` closed for the zero-authority case, resurfacing at
 * full authority through sheer mass.
 *
 * ── THE CONTRACT ──────────────────────────────────────────────────────────
 * In a MIXED plan the stated direction owns the dominant share of the budget
 * (`STATED_SHARE`); the anchor's inferred terms share the remainder, scaled
 * by what the anchor is worth. Pure plans — all-stated or all-anchor — keep
 * their shipped arithmetic to the last decimal (`statedAxisAuthority.test.ts`
 * pins that separately). And a resolved anchor is never a member of its own
 * comparison's answer.
 */
import { describe, it, expect } from 'vitest';
import { buildPlan, type CriticPlan } from './plan';
import { deriveDna } from '@/lib/preference/engine';
import { CRITIC_NUDGE_MAX, STATED_SHARE, planNudge } from './nudge';
import { rankCriticCandidates, type CriticCandidate } from './decide';
import { excludeAnchorCandidates, type ResolvedAnchor } from './objective';
import type { TitleDimensions } from '@/lib/scoring/dimensions';

/** A strongly-shaped anchor — expresses six axes, the Whiplash shape. */
const ANCHOR_DIMS = {
  darkness: 65,
  pacing: 80,
  suspense: 85,
  emotion: 75,
  humor: 30,
  warmth: 35,
} as unknown as TitleDimensions;

const anchor = (dims: TitleDimensions | undefined = ANCHOR_DIMS): ResolvedAnchor => ({
  titleId: 'movie:1585',
  tmdbId: 1585,
  mediaType: 'movie',
  spokenAs: 'Whiplash',
  confidence: 1,
  dims,
});

/** "darker than X" / "lighter than X" with the anchor fully fingerprinted. */
const directed = (direction: 'higher' | 'lower'): CriticPlan =>
  buildPlan({
    relation: 'like_but',
    anchors: [anchor()],
    dna: deriveDna([], 0),
    modifiers: { darkness: direction },
    authority: 1,
  });

/** Candidate dims: the anchor's own preserve-axis values unless overridden. */
const dims = (over: Partial<Record<string, number>>): TitleDimensions =>
  ({ ...(ANCHOR_DIMS as Record<string, number>), ...over }) as unknown as TitleDimensions;

const cand = (id: number, matchScore: number, d: TitleDimensions): CriticCandidate => ({
  id,
  mediaType: 'movie',
  matchScore,
  generalScore: matchScore,
  dims: d,
});

describe('the stated direction dominates a mixed plan', () => {
  it('the plan under test is genuinely mixed — stated and anchor terms together', () => {
    const plan = directed('higher');
    const stated = plan.instructions.filter((i) => i.evidence.includes('request'));
    const inferred = plan.instructions.filter((i) => !i.evidence.includes('request'));
    expect(stated).toHaveLength(1);
    expect(stated[0]!.axis).toBe('darkness');
    /* The mass that drowned the request: five preserve terms at 0.5 apiece. */
    expect(inferred.length).toBeGreaterThanOrEqual(5);
  });

  it('"darker" out-ranks a five-point quality lock — the production head shape', () => {
    /* Both candidates keep the anchor's preserved qualities PERFECTLY, so the
       only live difference is the axis the user stated. The lighter title is
       five points ahead on durable merit — the 87-vs-83 lock the deployed
       proof measured. If resemblance to the anchor can hold that lock against
       the stated direction, the comparison is decorative. */
    const light = cand(1, 90, dims({ darkness: 30 }));
    const dark = cand(2, 85, dims({ darkness: 95 }));
    const ranked = rankCriticCandidates([light, dark], directed('higher'));
    expect(ranked.applied).toBe(true);
    expect(ranked.decisions[0]!.id, 'the darker title did not overtake the lock').toBe(2);
  });

  it('"lighter" is the mirror image — same lock, opposite winner', () => {
    const light = cand(1, 85, dims({ darkness: 30 }));
    const dark = cand(2, 90, dims({ darkness: 95 }));
    const ranked = rankCriticCandidates([light, dark], directed('lower'));
    expect(ranked.decisions[0]!.id, 'the lighter title did not overtake the lock').toBe(1);
  });

  it('the stated axis separates equal-resemblance candidates by more than half the budget', () => {
    /* Identical preserve agreement, opposite stated agreement. The gap between
       them IS the stated axis's real share of ±CRITIC_NUDGE_MAX; under the
       pooled mass it was ~4.4 of 10, which a three-point quality gap erases. */
    const onTarget = planNudge({ dims: dims({ darkness: 95 }) }, directed('higher'));
    const opposite = planNudge({ dims: dims({ darkness: 30 }) }, directed('higher'));
    expect(onTarget.nudge - opposite.nudge).toBeGreaterThan(CRITIC_NUDGE_MAX / 2);
  });

  it('opposite directions produce materially different heads over one pool', () => {
    /* Ten candidates on one quality plane: darkness spans 5..95; the middle
       band additionally resembles the anchor perfectly on every preserved
       axis, the way a quality-locked head does. Under the pooled mass both
       directions returned that same middle band — five shared of five. The
       deployed contract (taste-dna-proof) allows at most two shared. */
    const pool = Array.from({ length: 10 }, (_, i) => {
      const n = i + 1;
      const resemblesAnchor = n >= 4 && n <= 8;
      return cand(
        n,
        85,
        resemblesAnchor
          ? dims({ darkness: n * 10 - 5 })
          : ({ ...Object.fromEntries(Object.keys(ANCHOR_DIMS).map((k) => [k, 50])), darkness: n * 10 - 5 } as unknown as TitleDimensions),
      );
    });
    const head = (direction: 'higher' | 'lower') =>
      rankCriticCandidates(pool, directed(direction))
        .decisions.slice(0, 5)
        .map((d) => d.id);
    const darker = head('higher');
    const lighter = head('lower');
    const shared = darker.filter((id) => lighter.includes(id));
    expect(shared.length, `heads shared ${shared.length}/5: ${darker} vs ${lighter}`).toBeLessThanOrEqual(2);
    expect(darker[0], 'the two directions crowned the same winner').not.toBe(lighter[0]);
  });

  it('a dead anchor no longer dilutes the stated axis', () => {
    /* Mixed plan whose anchor terms carry zero authority: their mass used to
       stay in the denominator, shrinking the one instruction that still had
       standing. Dead weight must not vote. */
    const plan: CriticPlan = {
      relation: 'like_but',
      authority: 0,
      instructions: [
        { axis: 'darkness', kind: 'improve', target: 95, strength: 0.95, evidence: ['request'] },
        { axis: 'pacing', kind: 'preserve', target: 80, strength: 0.5, evidence: ['anchor'], anchorValue: 80 },
        { axis: 'suspense', kind: 'preserve', target: 85, strength: 0.5, evidence: ['anchor'], anchorValue: 85 },
      ],
    };
    const got = planNudge({ dims: dims({ darkness: 95 }) }, plan);
    /* Full agreement on the only living instruction → the full budget. */
    expect(got.nudge).toBeCloseTo(CRITIC_NUDGE_MAX, 9);
  });

  it('contributions still sum to the nudge in the mixed regime', () => {
    for (const direction of ['higher', 'lower'] as const) {
      for (const darkness of [10, 30, 65, 95]) {
        const c = planNudge({ dims: dims({ darkness }) }, directed(direction));
        const summed = c.contributions.reduce((s, p) => s + p.points, 0);
        expect(Math.abs(summed - c.nudge), `direction ${direction}, darkness ${darkness}`).toBeLessThan(1e-9);
      }
    }
  });

  it('the nudge stays bounded whatever the mix', () => {
    for (const direction of ['higher', 'lower'] as const) {
      for (const darkness of [0, 25, 50, 75, 100]) {
        const c = planNudge({ dims: dims({ darkness }) }, directed(direction));
        expect(Math.abs(c.nudge)).toBeLessThanOrEqual(CRITIC_NUDGE_MAX + 1e-9);
      }
    }
  });

  it('STATED_SHARE is dominant by construction', () => {
    expect(STATED_SHARE).toBeGreaterThan(0.5);
    expect(STATED_SHARE).toBeLessThan(1);
  });
});

describe('an anchor is never its own answer', () => {
  it('the resolved anchor is excluded from the comparison membership', () => {
    /* "lighter than Whiplash" returned Whiplash at #5 on production. The
       anchor is the reference point of the comparison; a title cannot be
       lighter, darker, or better than itself. */
    const pool = [
      { id: 1585, mediaType: 'movie' as const },
      { id: 1585, mediaType: 'tv' as const }, // same id, different medium — a different title
      { id: 500, mediaType: 'movie' as const },
    ];
    const kept = excludeAnchorCandidates(pool, [anchor()]);
    expect(kept.map((i) => `${i.mediaType}-${i.id}`)).toEqual(['tv-1585', 'movie-500']);
  });

  it('no anchors excludes nothing', () => {
    const pool = [{ id: 500, mediaType: 'movie' as const }];
    expect(excludeAnchorCandidates(pool, [])).toEqual(pool);
  });
});
