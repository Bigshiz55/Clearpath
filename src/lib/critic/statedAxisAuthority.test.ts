/**
 * WHAT THE USER SAID IS NOT EVIDENCE ABOUT THE ANCHOR.
 *
 * THE DEFECT, MEASURED AGAINST A REAL DEPLOYMENT. "I want something darker than
 * Taken." resolved its anchor correctly, ran the whole critic pipeline, and
 * came back with The Godfather, The Dark Knight and Shawshank — byte-identical
 * to what that same deployment returns for a request that constrains nothing.
 * The comparison completed and did not matter.
 *
 * The mechanism: `plan.authority` measures how much is known about the ANCHOR
 * (`objectiveAuthority` is zero when no anchor carries a cached fingerprint),
 * and it multiplied EVERY instruction — including the one whose evidence is
 * `['request']`, which is the axis the user stated in their own words. "Darker
 * than X" is two claims, and only one of them needs to know anything about X.
 * Zeroing both because the classifier has not reached X yet discards what the
 * person actually typed.
 *
 * The repair is arithmetic, not a new signal: authority scales the terms the
 * anchor supports and leaves the stated ones alone. The pure-anchor case is
 * unchanged to the last decimal — the test below pins that, because a fix that
 * quietly re-weights every existing comparison would be a different change
 * wearing this one's clothes.
 */
import { describe, it, expect } from 'vitest';
import { buildPlan, type CriticPlan } from './plan';
import { deriveDna } from '@/lib/preference/engine';
import { CRITIC_NUDGE_MAX, planNudge } from './nudge';
import { rankCriticCandidates } from './decide';
import type { TitleDimensions } from '@/lib/scoring/dimensions';

const dims = (over: Partial<Record<string, number>> = {}): TitleDimensions =>
  ({ darkness: 50, pacing: 50, humor: 50, warmth: 50, suspense: 50, ...over }) as unknown as TitleDimensions;

/** "darker than X", with X resolved but never fingerprinted. */
const statedOnly: CriticPlan = buildPlan({
  relation: 'like_but',
  anchors: [{ titleId: 'movie:8681', tmdbId: 8681, mediaType: 'movie', spokenAs: 'Taken', confidence: 1 }],
  // A genuinely empty profile: the stated axis must not need one.
  dna: deriveDna([], 0),
  modifiers: { darkness: 'higher' },
  authority: 0,
});

describe('a stated axis survives an unfingerprinted anchor', () => {
  it('the plan carries the request instruction even with zero anchor authority', () => {
    const req = statedOnly.instructions.find((i) => i.axis === 'darkness');
    expect(req, 'the plan lost the axis the user stated').toBeDefined();
    expect(req!.evidence).toContain('request');
    expect(req!.target).toBeGreaterThan(50);
  });

  it('a dark candidate is nudged up and a light one down', () => {
    const dark = planNudge({ dims: dims({ darkness: 85 }) }, statedOnly);
    const light = planNudge({ dims: dims({ darkness: 10 }) }, statedOnly);
    expect(dark.nudge, 'the stated axis produced nothing at all').toBeGreaterThan(0);
    expect(light.nudge).toBeLessThan(0);
    expect(dark.nudge).toBeGreaterThan(light.nudge);
  });

  it('and that is enough to change the order — which is the whole point', () => {
    /* A generically stronger but tonally wrong title against a darker, slightly
       weaker one: the Godfather-vs-the-answer shape the deployment produced.
       The gap is six points, because the nudge is bounded at
       CRITIC_NUDGE_MAX and a comparison is not licensed to overturn any
       quality gap it likes — a fourteen-point gap correctly survives, and the
       test below pins that too. */
    const ranked = rankCriticCandidates(
      [
        { id: 1, mediaType: 'movie', generalScore: 94, matchScore: 94, dims: dims({ darkness: 20 }) },
        { id: 2, mediaType: 'movie', generalScore: 88, matchScore: 88, dims: dims({ darkness: 95 }) },
      ],
      statedOnly,
    );
    expect(ranked.eligible, 'a stated axis must make the request eligible to rank').toBe(true);
    expect(ranked.applied).toBe(true);
    expect(ranked.decisions[0]!.id, 'the darker title did not overtake').toBe(2);
  });

  it('but it is still bounded — a stated axis does not overturn any gap it likes', () => {
    const ranked = rankCriticCandidates(
      [
        { id: 1, mediaType: 'movie', generalScore: 94, matchScore: 94, dims: dims({ darkness: 20 }) },
        { id: 2, mediaType: 'movie', generalScore: 70, matchScore: 70, dims: dims({ darkness: 95 }) },
      ],
      statedOnly,
    );
    expect(ranked.decisions[0]!.id).toBe(1);
    for (const d of ranked.decisions) {
      expect(Math.abs(d.criticNudge)).toBeLessThanOrEqual(CRITIC_NUDGE_MAX + 1e-9);
    }
  });

  it('the contributions still sum to the nudge, so the explanation is arithmetic', () => {
    const c = planNudge({ dims: dims({ darkness: 85 }) }, statedOnly);
    const summed = c.contributions.reduce((s, p) => s + p.points, 0);
    expect(Math.abs(summed - c.nudge)).toBeLessThan(1e-9);
  });
});

describe('nothing else moves', () => {
  /* An anchor-only plan is what every existing comparison produces. Its
     arithmetic must be untouched: authority scaling a term and authority
     scaling the whole sum are the same number when every term is scaled. */
  const anchorOnly = (authority: number): CriticPlan => ({
    relation: 'like',
    authority,
    instructions: [
      { axis: 'darkness', kind: 'preserve', target: 70, strength: 0.6, evidence: ['anchor'], anchorValue: 70 },
      { axis: 'pacing', kind: 'preserve', target: 30, strength: 0.4, evidence: ['anchor', 'user_dna'], anchorValue: 30 },
    ],
  });

  it('an anchor-only plan is scaled exactly as it always was', () => {
    for (const authority of [0.25, 0.5, 0.75, 1]) {
      const plan = anchorOnly(authority);
      const cand = { dims: dims({ darkness: 80, pacing: 25 }) };
      const got = planNudge(cand, plan);
      // The pre-change formula, written out: score = Σ(agreement·strength)/Σstrength,
      // nudge = score · MAX · authority.
      const mass = 0.6 + 0.4;
      const agrees = (1 - (2 * Math.abs(80 - 70)) / 100) * 0.6 + (1 - (2 * Math.abs(25 - 30)) / 100) * 0.4;
      const expected = (agrees / mass) * CRITIC_NUDGE_MAX * authority;
      expect(got.nudge, `authority ${authority}`).toBeCloseTo(expected, 9);
    }
  });

  it('an anchor-only plan with zero authority stays completely inert', () => {
    const got = planNudge({ dims: dims({ darkness: 80 }) }, anchorOnly(0));
    expect(got.nudge).toBe(0);
    const ranked = rankCriticCandidates(
      [
        { id: 1, mediaType: 'movie', generalScore: 94, matchScore: 94, dims: dims({ darkness: 20 }) },
        { id: 2, mediaType: 'movie', generalScore: 80, matchScore: 80, dims: dims({ darkness: 95 }) },
      ],
      anchorOnly(0),
    );
    expect(ranked.eligible).toBe(false);
    expect(ranked.decisions[0]!.id, 'the incoming order must be returned untouched').toBe(1);
  });

  it('a candidate with no fingerprint is still silent, not neutral', () => {
    const ranked = rankCriticCandidates(
      [{ id: 1, mediaType: 'movie', generalScore: 90, matchScore: 90 }],
      statedOnly,
    );
    expect(ranked.decisions[0]!.criticNudge).toBe(0);
    expect(ranked.decisions[0]!.fingerprinted).toBe(false);
  });

  it('no plan at all is still exactly the incoming order', () => {
    const ranked = rankCriticCandidates(
      [
        { id: 1, mediaType: 'movie', generalScore: 60, matchScore: 60, dims: dims() },
        { id: 2, mediaType: 'movie', generalScore: 90, matchScore: 90, dims: dims() },
      ],
      undefined,
    );
    expect(ranked.eligible).toBe(false);
    expect(ranked.decisions.map((d) => d.id)).toEqual([1, 2]);
  });
});
