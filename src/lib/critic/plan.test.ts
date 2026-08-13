import { describe, it, expect } from 'vitest';
import { rankWithPreference } from '@/lib/preference/rank';
import { deriveDna } from '@/lib/preference/engine';
import { effectiveTaste } from '@/lib/preference/explain';
import type { PreferenceEvent } from '@/lib/preference/types';
import { DIMENSION_KEYS, type TitleDimensions } from '@/lib/scoring/dimensions';
import { CRITIC_NUDGE_MAX } from './nudge';
import { buildPlan, type CriticPlan } from './plan';
import type { ResolvedAnchor } from './objective';

/**
 * GC4 — "BETTER THAN X" DOES NOT MEAN "DIFFERENT FROM X".
 *
 * ── THE DEFECT THIS GATE REPLACES ─────────────────────────────────────────
 * GC8's provisional model rewarded DEPARTURE from the anchor centroid for
 * `better_than`. It proved causality, which is all it was for, and it is wrong
 * as semantics: a person naming two films they love and asking for better is
 * not asking to flee them. A candidate can be dramatically different from an
 * anchor and dramatically worse — undirected distance cannot tell those apart,
 * because it has no idea WHICH of the anchor's qualities were the good ones.
 *
 * The RED case below is built so the two models disagree: one candidate keeps
 * what this user demonstrably likes and fixes what they demonstrably do not,
 * the other is simply farther away. Distance-only prefers the farther one.
 *
 * ── THREE PROVENANCE CLASSES, KEPT APART ──────────────────────────────────
 *   ANCHOR FACT   "these films are high on suspense"
 *   USER FACT     "this user's mature DNA prefers low sentiment"
 *   REQUEST FACT  "they asked for funnier"
 * Collapsing them into one number before reasoning is what makes an
 * explanation impossible to ground later.
 */

const NOW = Date.UTC(2026, 0, 20);

function fill(overrides: Record<string, number>): TitleDimensions {
  const out: Record<string, number> = {};
  for (const k of DIMENSION_KEYS) out[k] = overrides[k] ?? 50;
  return out as TitleDimensions;
}

/** Build a confident profile by repeatedly liking titles with a given shape. */
function dnaLiking(shape: Record<string, number>, n = 24) {
  const events: PreferenceEvent[] = Array.from({ length: n }, (_, i) => ({
    id: `e${i}`,
    at: NOW - (i + 1) * 86_400_000,
    titleId: `movie:${2000 + i}`,
    action: 'seen_liked' as const,
    dims: fill(shape),
    genres: ['drama'],
  }));
  return deriveDna(events, NOW);
}

const anchor = (id: number, dims: TitleDimensions): ResolvedAnchor => ({
  titleId: `movie:${id}`,
  tmdbId: id,
  mediaType: 'movie',
  spokenAs: `anchor-${id}`,
  dims,
  confidence: 1,
});

/* THE ANCHORS. Both carry qualities this user loves (high suspense, high
   darkness) AND one they reject (high sentiment, encoded on `warmth`). */
const ANCHORS = [
  anchor(101, fill({ suspense: 90, darkness: 85, warmth: 88, pacing: 50 })),
  anchor(102, fill({ suspense: 88, darkness: 82, warmth: 85, pacing: 52 })),
];

/** Likes suspense and darkness, rejects sentiment (low warmth). */
const USER = dnaLiking({ suspense: 92, darkness: 88, warmth: 8 });

/* CANDIDATE A — the answer a critic would give: keeps what the user liked
   about the anchors, fixes the part they did not.
   CANDIDATE B — simply farther from the centroid on everything, including the
   qualities that were working. */
const A = { id: 'keeps-what-worked', objective: 70, dims: fill({ suspense: 90, darkness: 86, warmth: 10, pacing: 55 }), genres: ['thriller'] };
const B = { id: 'merely-distant', objective: 70, dims: fill({ suspense: 12, darkness: 14, warmth: 12, pacing: 50 }), genres: ['comedy'] };
const CANDIDATES = [A, B];

const authority = 1;
const planFor = (relation: Parameters<typeof buildPlan>[0]['relation'], dna = USER, modifiers = {}) =>
  buildPlan({ relation, anchors: ANCHORS, dna, modifiers, authority });

const rankWith = (plan: CriticPlan) =>
  rankWithPreference(CANDIDATES, USER, { corrections: {}, criticPlan: plan });

// ── THE HEADLINE ──────────────────────────────────────────────────────────
describe('GC4 — better_than is not maximum distance', () => {
  it('THE GATE — the candidate that keeps what worked beats the merely-distant one', () => {
    /* Under the distance-only model B wins: it is farther from the centroid on
       every axis. Under a real critic plan A wins, because the plan knows the
       suspense and darkness were the good part and only the sentiment needed
       to move. */
    const ranked = rankWith(planFor('better_than'));
    expect(ranked[0]!.id).toBe('keeps-what-worked');
    expect(ranked[0]!.criticNudge!).toBeGreaterThan(ranked[1]!.criticNudge!);
  });

  it('and the plan says so explicitly, not just numerically', () => {
    const plan = planFor('better_than');
    const kinds = Object.fromEntries(plan.instructions.map((i) => [i.axis, i.kind]));
    expect(kinds.suspense).toBe('preserve');
    expect(kinds.darkness).toBe('preserve');
    expect(kinds.warmth).toBe('avoid');
  });
});

// ── PRESERVE / IMPROVE / AVOID ────────────────────────────────────────────
describe('preserve requires evidence, not mere anchor possession', () => {
  it('preserves an anchor trait the user confidently shares', () => {
    const i = planFor('better_than').instructions.find((x) => x.axis === 'suspense')!;
    expect(i.kind).toBe('preserve');
    expect(i.target).toBeGreaterThan(70); // the anchors' own level
    expect(i.evidence).toContain('anchor');
    expect(i.evidence).toContain('user_dna');
  });

  it('does NOT preserve a trait merely because the anchor has it', () => {
    /* A user with no opinion about an axis gives no grounds to keep it under
       `better_than`. The anchor having it is one fact, not two. */
    const blank = deriveDna([], NOW);
    const plan = buildPlan({ relation: 'better_than', anchors: ANCHORS, dna: blank, modifiers: {}, authority });
    const warm = plan.instructions.find((x) => x.axis === 'warmth');
    /* The strictest outcome is NO instruction at all — with no user evidence,
       `better_than` has only one fact about this axis and one fact is not
       grounds to keep it. Written to accept either that or an instruction
       carrying no `user_dna` provenance, so the assertion tests the rule
       rather than the current shape of the output. */
    if (warm) expect(warm.evidence).not.toContain('user_dna');
    else expect(warm).toBeUndefined();
  });
});

describe('improve moves toward the user, not toward an objective ideal', () => {
  it('an anchor/user conflict becomes a directional instruction', () => {
    const i = planFor('better_than').instructions.find((x) => x.axis === 'warmth')!;
    // Anchors sit ~86; this user rejects it, so the target must move DOWN.
    expect(i.target).toBeLessThan(50);
    expect(i.evidence).toContain('user_dna');
  });

  it('an explicit modifier outranks inferred anchor similarity', () => {
    /* REQUEST FACT is a stronger directional claim than "the anchors were like
       this", and must be able to move an axis the anchors agreed on. */
    const plan = planFor('like_but', USER, { humor: 'higher' });
    const i = plan.instructions.find((x) => x.axis === 'humor')!;
    expect(i.evidence).toContain('request');
    expect(i.target).toBeGreaterThan(50);
    const preserved = plan.instructions.find((x) => x.axis === 'suspense')!;
    expect(i.strength).toBeGreaterThan(preserved.strength);
  });
});

describe('avoid needs grounded negative evidence', () => {
  it('marks avoid only where the user confidently rejects what the anchor has', () => {
    const i = planFor('better_than').instructions.find((x) => x.axis === 'warmth')!;
    expect(i.kind).toBe('avoid');
  });

  it('never infers dislike from anchor possession alone', () => {
    const blank = deriveDna([], NOW);
    const plan = buildPlan({ relation: 'better_than', anchors: ANCHORS, dna: blank, modifiers: {}, authority });
    expect(plan.instructions.some((x) => x.kind === 'avoid')).toBe(false);
  });
});

// ── TASTE DNA IS CAUSAL ───────────────────────────────────────────────────
describe('opposite users produce opposite plans from identical anchors', () => {
  const darkLover = dnaLiking({ darkness: 92, suspense: 90 });
  const lightLover = dnaLiking({ darkness: 8, suspense: 20 });

  it('the two plans are not identical', () => {
    /* If they were, the critic would still be anchor analysis with generic
       personalisation bolted on afterwards. */
    const p1 = buildPlan({ relation: 'better_than', anchors: ANCHORS, dna: darkLover, modifiers: {}, authority });
    const p2 = buildPlan({ relation: 'better_than', anchors: ANCHORS, dna: lightLover, modifiers: {}, authority });
    expect(JSON.stringify(p1.instructions)).not.toBe(JSON.stringify(p2.instructions));
  });

  it('and they disagree about darkness specifically', () => {
    const d1 = buildPlan({ relation: 'better_than', anchors: ANCHORS, dna: darkLover, modifiers: {}, authority })
      .instructions.find((x) => x.axis === 'darkness')!;
    const d2 = buildPlan({ relation: 'better_than', anchors: ANCHORS, dna: lightLover, modifiers: {}, authority })
      .instructions.find((x) => x.axis === 'darkness')!;
    expect(d1.target).toBeGreaterThan(d2.target);
    expect(d1.kind).not.toBe(d2.kind);
  });
});

describe('confidence gates the strength of a claim', () => {
  it('low-confidence DNA produces no strong instruction', () => {
    const thin = dnaLiking({ darkness: 90 }, 1);
    const plan = buildPlan({ relation: 'better_than', anchors: ANCHORS, dna: thin, modifiers: {}, authority });
    for (const i of plan.instructions) {
      if (i.evidence.includes('user_dna')) expect(i.strength).toBeLessThan(0.6);
    }
  });

  it('MATURE EXPLICIT EVIDENCE CANNOT BE OVERPOWERED BY INFERENCE', () => {
    /* The plan may not decide "lighter is objectively better" for a user whose
       mature DNA prefers darkness. The instruction must follow the user. */
    const darkLover = dnaLiking({ darkness: 95 }, 40);
    const light = [anchor(1, fill({ darkness: 10 })), anchor(2, fill({ darkness: 12 }))];
    const plan = buildPlan({ relation: 'better_than', anchors: light, dna: darkLover, modifiers: {}, authority });
    const d = plan.instructions.find((x) => x.axis === 'darkness')!;
    expect(d.target).toBeGreaterThan(50);
    expect(effectiveTaste(darkLover).darkness!.polarity).toBe(1);
  });
});

// ── RELATION SEMANTICS ────────────────────────────────────────────────────
describe('every relation is served by the same mechanism', () => {
  it('like rewards legitimate resemblance', () => {
    const ranked = rankWithPreference(CANDIDATES, USER, {
      corrections: {},
      criticPlan: planFor('like'),
    });
    // A resembles the anchors on the axes that matter; B does not.
    expect(ranked[0]!.id).toBe('keeps-what-worked');
  });

  it('like_but preserves anchor identity except where the modifier asks', () => {
    const plan = planFor('like_but', USER, { humor: 'higher' });
    expect(plan.instructions.find((x) => x.axis === 'suspense')!.kind).toBe('preserve');
    expect(plan.instructions.find((x) => x.axis === 'humor')!.target).toBeGreaterThan(50);
  });

  it('blend does NOT average contradictory anchors into neutral', () => {
    /* Two anchors at 10 and 90 do not mean "50". Without a confident user
       preference to break the tie the axis is UNCERTAIN, and the plan says so
       by staying silent rather than asserting the midpoint. */
    const split = [anchor(1, fill({ darkness: 10 })), anchor(2, fill({ darkness: 90 }))];
    const blank = deriveDna([], NOW);
    const plan = buildPlan({ relation: 'blend', anchors: split, dna: blank, modifiers: {}, authority });
    const d = plan.instructions.find((x) => x.axis === 'darkness');
    expect(d).toBeUndefined();
  });

  it('blend uses confident DNA to pick a side when the anchors disagree', () => {
    const split = [anchor(1, fill({ darkness: 10 })), anchor(2, fill({ darkness: 90 }))];
    const darkLover = dnaLiking({ darkness: 95 }, 40);
    const plan = buildPlan({ relation: 'blend', anchors: split, dna: darkLover, modifiers: {}, authority });
    const d = plan.instructions.find((x) => x.axis === 'darkness')!;
    expect(d.target).toBeGreaterThan(50);
  });
});

// ── SAFETY ────────────────────────────────────────────────────────────────
describe('silence beats fake certainty', () => {
  it('an axis the anchors do not express is not reasoned about', () => {
    const flat = [anchor(1, fill({})), anchor(2, fill({}))];
    const plan = buildPlan({ relation: 'better_than', anchors: flat, dna: USER, modifiers: {}, authority });
    expect(plan.instructions).toHaveLength(0);
  });

  it('no anchors means no plan and no contribution', () => {
    const plan = buildPlan({ relation: 'better_than', anchors: [], dna: USER, modifiers: {}, authority: 0 });
    expect(plan.instructions).toHaveLength(0);
    const withPlan = rankWith(plan).map((r) => r.finalScore);
    const without = rankWithPreference(CANDIDATES, USER, { corrections: {} }).map((r) => r.finalScore);
    expect(withPlan).toEqual(without);
  });

  it('the contribution stays inside the declared bound', () => {
    for (const r of rankWith(planFor('better_than'))) {
      expect(Math.abs(r.criticNudge ?? 0)).toBeLessThanOrEqual(CRITIC_NUDGE_MAX + 1e-9);
    }
  });

  it('exposes WHICH planned traits moved each candidate', () => {
    const ranked = rankWith(planFor('better_than'));
    expect(ranked[0]!.criticAxes).toContain('suspense');
    expect(ranked[0]!.criticAxes).toContain('warmth');
  });
});
