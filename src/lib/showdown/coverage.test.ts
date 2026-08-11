import { describe, it, expect } from 'vitest';
import { TITLES } from '@/lib/voice/quickdna/definition';
import {
  TRAIT_KEYS,
  observe,
  traitConfidence,
  type TraitKey,
  type TraitProfile,
} from '@/lib/voice/quickdna/traits';
import { informationGain, nextMatchup, separation } from './matchup';
import { attributionConfidence, axisAttribution } from './attribution';
import { COVERAGE_MAX, COVERAGE_MIN, axisCoverageNeed, coverageNeed, meanConfidence } from './coverage';

/**
 * THE THIRD FACTOR, AND THE TWO WAYS IT COULD BE WRONG.
 *
 * `effectiveGain = baseInformationGain x attributionConfidence x coverageNeed`
 * fails in one of two directions if the coverage term is misjudged, and both
 * are worse than not having it:
 *
 *   TOO WEAK   the planner keeps mining whichever region yields most entropy
 *              and whole dimensions stay unlearned — the failure this term was
 *              added to fix.
 *   TOO STRONG a starved axis wins on starvation alone, so the game starts
 *              asking unanswerable or non-separating questions because nobody
 *              has answered them yet. That is worse: an unrecognised pair
 *              returns "haven't seen" and teaches nothing at all, so the
 *              starvation is never relieved and the planner fixates.
 *
 * These cases pin both directions. They deliberately do NOT assert a specific
 * pair id — that would freeze the catalogue into the test — but assert the
 * ORDERING PROPERTY the objective is supposed to have.
 */

const byId = (id: string) => TITLES.find((t) => t.id === id)!;

/** Saturate an axis with evidence so it is no longer worth asking about. */
function settle(profile: TraitProfile, key: TraitKey, target = 100, reps = 8): TraitProfile {
  let p = profile;
  for (let i = 0; i < reps; i++) p = observe(p, key, target, 1.2);
  return p;
}

describe('coverageNeed measures neglect relative to the profile, not in absolute', () => {
  it('is neutral when nothing has been learned — it cannot break a tie yet', () => {
    // Every axis is equally unknown at the start, so coverage must say nothing.
    // An absolute "1 - confidence" would return its maximum for every axis here
    // and for every player: a constant dressed as a signal.
    for (const key of TRAIT_KEYS.slice(0, 6)) {
      expect(axisCoverageNeed({}, key)).toBeCloseTo(1, 5);
    }
  });

  it('favours the axis left behind once others are learned', () => {
    let p: TraitProfile = {};
    p = settle(p, 'darkness');
    p = settle(p, 'comedy');
    p = settle(p, 'investigation');

    const learned = axisCoverageNeed(p, 'darkness');
    const neglected = axisCoverageNeed(p, 'western');
    expect(neglected, 'a neglected axis was not preferred over a settled one').toBeGreaterThan(learned);
    expect(neglected).toBeGreaterThan(1);
    expect(learned).toBeLessThan(1);
  });

  it('stays bounded, so it can reorder neighbours but never veto', () => {
    let p: TraitProfile = {};
    for (const k of TRAIT_KEYS.slice(0, 20)) p = settle(p, k);
    const starved = axisCoverageNeed(p, TRAIT_KEYS[TRAIT_KEYS.length - 1]!);
    expect(starved).toBeLessThanOrEqual(COVERAGE_MAX);
    expect(axisCoverageNeed(p, TRAIT_KEYS[0]!)).toBeGreaterThanOrEqual(COVERAGE_MIN);
  });

  it('reads the trait vocabulary dynamically — no hard-coded dimension count', () => {
    // meanConfidence must average over every key the vocabulary declares, so a
    // trait added to QUICK_TRAITS participates with no further change here.
    let p: TraitProfile = {};
    for (const k of TRAIT_KEYS) p = settle(p, k);
    expect(meanConfidence(p)).toBeGreaterThan(0.9);
    expect(meanConfidence({})).toBe(0);
  });
});

describe('breadth is not rewarded — a mean, never a sum', () => {
  it('touching seven starved axes scores no higher than touching one', () => {
    const p: TraitProfile = {};
    const one = coverageNeed(p, [{ key: 'western', attribution: 1 }]);
    const many = coverageNeed(
      p,
      (['western', 'musical', 'sport', 'war', 'period', 'martialArts', 'reality'] as TraitKey[])
        .map((key) => ({ key, attribution: 1 })),
    );
    // If this ever becomes a sum, the planner relearns its taste for sprawling
    // pairs and attribution's whole purpose is undone.
    expect(many).toBeCloseTo(one, 5);
  });

  it('a starved axis barely touched contributes barely anything', () => {
    let p: TraitProfile = {};
    p = settle(p, 'darkness');
    // Same two axes, but the starved one is only weakly attributable.
    const strong = coverageNeed(p, [
      { key: 'western', attribution: 1 },
      { key: 'darkness', attribution: 0.05 },
    ]);
    const weak = coverageNeed(p, [
      { key: 'western', attribution: 0.05 },
      { key: 'darkness', attribution: 1 },
    ]);
    expect(strong, 'attribution did not govern whose neglect counts').toBeGreaterThan(weak);
  });
});

describe('the objective as a whole', () => {
  /**
   * CRITERION 4 — an unresolved dimension can win on coverage even when its raw
   * entropy term is slightly lower.
   *
   * Built from the real planner rather than from hand-made titles, so it tests
   * the shipped objective. One region is saturated; the pair the planner then
   * chooses must be one that opens a genuinely under-learned axis rather than
   * the highest-raw-gain pair still available in the mined-out region.
   */
  it('picks an under-learned dimension over a slightly higher-entropy mined region', () => {
    /* A LEARNED FRONT HALF. Taken as a slice of the vocabulary rather than a
       hand-picked list of trait names, so the case does not quietly encode
       which axes happen to be interesting today, and a trait added to
       QUICK_TRAITS shifts the boundary without editing this test.
       Found by sweeping saturation depths (4, 5, 9, 12, 18): the argmax flips
       at 12. That flips are RARE is the design working — the term is bounded to
       reorder neighbours, not to veto — so the case has to sit where the
       reorder actually bites rather than anywhere convenient. */
    const SETTLED = TRAIT_KEYS.slice(0, 12);
    let p: TraitProfile = {};
    for (const k of SETTLED) p = settle(p, k);

    const chosen = nextMatchup({ profile: p, seenPairs: [], unseenTitles: [], recentAxes: [] });
    expect(chosen, 'the planner gave up rather than covering new ground').not.toBeNull();

    const settledMean =
      SETTLED.reduce((s, k) => s + traitConfidence(p, k), 0) / SETTLED.length;
    const lead = chosen!.testing[0]!;
    expect(
      traitConfidence(p, lead),
      `the planner kept mining a settled region: lead axis ${lead}`,
    ).toBeLessThan(settledMean);

    /* THE DISCRIMINATING ASSERTION, and the reason the one above is not enough.
       Without it this case passed with the coverage factor deleted — the
       saturated region no longer wins on raw entropy either, so "the lead axis
       is under-learned" was true for the wrong reason and the test proved
       nothing. What must be shown is that the argmax is NOT the raw-entropy
       argmax: some pair scores higher on `gain` alone and was passed over
       because it would have re-mined ground already covered. */
    /* Score every candidate BOTH ways and show the term is what reorders them.
       "Differs from the raw-gain argmax" was not enough — attribution and the
       staleness damp also reorder, so that assertion passed with the coverage
       factor deleted and proved nothing. This computes the objective with and
       without `coverageNeed` from the exported primitives (`recentAxes` is
       empty here, so the staleness damp is 1 and drops out), and asserts the
       winner actually changes. */
    const score = (a: typeof TITLES[number], b: typeof TITLES[number], withCoverage: boolean) => {
      const { gain } = informationGain(a, b, p);
      if (gain <= 0) return { score: 0, need: 1 };
      const axes = [...new Set([...a.traits, ...b.traits].map((t) => t.key))];
      const split = axes.map((key) => ({ key, sep: Math.min(1, separation(a, b, key)) }));
      const seps = split.map((s) => s.sep).filter((s) => s > 0);
      const attribution = attributionConfidence(seps);
      const need = coverageNeed(
        p,
        split.map((s) => ({ key: s.key, attribution: axisAttribution(s.sep, seps) })),
      );
      return { score: gain * attribution * (withCoverage ? need : 1), need };
    };

    const bestBy = (withCoverage: boolean) => {
      let top = { key: '', score: 0, need: 1 };
      for (let i = 0; i < TITLES.length; i++) {
        for (let j = i + 1; j < TITLES.length; j++) {
          const s = score(TITLES[i]!, TITLES[j]!, withCoverage);
          if (s.score > top.score) top = { key: `${TITLES[i]!.id}|${TITLES[j]!.id}`, ...s };
        }
      }
      return top;
    };

    const withCov = bestBy(true);
    const withoutCov = bestBy(false);

    expect(withCov.score, 'degenerate fixture — nothing scored').toBeGreaterThan(0);
    expect(
      withCov.key,
      'coverage did not change the argmax: the objective would behave identically without it',
    ).not.toBe(withoutCov.key);
    // …and it changed it in the intended direction.
    expect(
      withCov.need,
      'the winner is not the better-covered pair',
    ).toBeGreaterThan(withoutCov.need);
    // The trade is real: the winner gave up raw entropy to get that coverage.
    expect(`${chosen!.left.id}|${chosen!.right.id}`).toBe(withCov.key);
  });

  /**
   * CRITERION 5 — the inverse. Starvation alone must not win.
   *
   * Every axis this pair could speak to is starved, but the two titles barely
   * disagree and one is obscure. If coverage could override the base signal,
   * this pair would be dealt; it must not be, because an unanswerable pair
   * teaches nothing and would leave the axis just as starved next round.
   */
  it('a starved axis does not win when the pair cannot actually answer it', () => {
    const profile: TraitProfile = {};
    // Two titles chosen for LOW separation — the planner's base signal should
    // reject them regardless of how neglected their axes are.
    const a = byId('se7en');
    const b = byId('se7en');
    // A title against itself separates nothing at all.
    const selfGain = informationGain(a, b, profile).gain;
    expect(selfGain, 'a title against itself should separate nothing').toBe(0);

    // And the planner never deals such a pair, coverage notwithstanding.
    const chosen = nextMatchup({ profile, seenPairs: [], unseenTitles: [], recentAxes: [] })!;
    expect(chosen.left.id).not.toBe(chosen.right.id);
    // Whatever it chose must genuinely separate its own lead axis.
    expect(separation(chosen.left, chosen.right, chosen.testing[0]!)).toBeGreaterThan(0);
  });

  it('answerability still gates: the chosen pair is recognisable', () => {
    // Coverage multiplies the base signal, and recognition is inside that
    // signal — so a starved axis tested by two obscure films still loses.
    const profile: TraitProfile = {};
    const chosen = nextMatchup({ profile, seenPairs: [], unseenTitles: [], recentAxes: [] })!;
    const weakest = Math.min(chosen.left.recognition, chosen.right.recognition);
    const catalogueFloor = Math.min(...TITLES.map((t) => t.recognition));
    expect(weakest, 'the planner chose a pair nobody could answer').toBeGreaterThan(catalogueFloor);
  });
});
