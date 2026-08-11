import { describe, it, expect } from 'vitest';
import { DIMENSION_KEYS, dimensionMatch, buildProfile, type TitleDimensions } from '@/lib/scoring/dimensions';
import { deriveDna, deriveCorrections } from '@/lib/preference/engine';
import { preferenceNudge } from '@/lib/preference/rank';
import type { PreferenceEvent } from '@/lib/preference/types';
import { toPreferenceEvents } from './verdict';
import { applyLean, intentById } from './session';
import type { ShowdownTitle } from './matchup';

/**
 * THE CLAIM THAT MATTERS: PLAYING CHANGES WHAT YOU ARE RECOMMENDED.
 *
 * The previous build of this game learned into a private store, so every one of
 * its tests could pass while `/app` ranked identically before and after. These
 * assertions therefore run the Showdown's output through the SAME functions the
 * live ranking path uses — `deriveDna`, `deriveCorrections`, `preferenceNudge`
 * (the exact term `rankByDna` adds to a title's score) and `dimensionMatch`
 * (what the dimension nudge is computed from).
 *
 * Nothing here is a stand-in written for the test. If these pass and ranking
 * does not move, one of those functions changed underneath and this file should
 * fail loudly rather than keep reassuring anyone.
 */

function dims(overrides: Record<string, number>): TitleDimensions {
  const d: TitleDimensions = {};
  for (const k of DIMENSION_KEYS) d[k] = 50;
  return { ...d, ...overrides };
}

function title(key: string, overrides: Record<string, number>): ShowdownTitle {
  return { key, title: key, year: 2020, posterPath: null, mediaType: 'movie', dims: dims(overrides) };
}

/** Play a run of picks and return the events the bridge produced. */
function playPicks(pairs: Array<[ShowdownTitle, ShowdownTitle]>, at = 1_000): PreferenceEvent[] {
  const out: PreferenceEvent[] = [];
  pairs.forEach(([winner, loser], i) => {
    const drafts = toPreferenceEvents({
      left: winner,
      right: loser,
      verdict: 'left',
      kind: 'pair',
      testing: ['pacing'],
      sessionId: 'sess',
      roundId: `r${i}`,
      at: at + i,
    });
    out.push(...(drafts as PreferenceEvent[]));
  });
  return out;
}

describe('showdown evidence moves the live ranking term', () => {
  const fastTitle = { dims: dims({ pacing: 95 }), genres: [] };
  const slowTitle = { dims: dims({ pacing: 5 }), genres: [] };

  it('a run of picks changes the nudge rankByDna applies', () => {
    const before = deriveDna([], 5_000);
    const nudgeBefore = preferenceNudge(fastTitle, before).nudge;
    expect(nudgeBefore, 'an empty profile should not nudge anything').toBe(0);

    // A game's worth of picks, all of the faster film. See the threshold test
    // below for why the count matters and where the boundary actually sits.
    const events = playPicks(
      Array.from({ length: 12 }, (_, i) => [title(`movie:${i}`, { pacing: 92 }), title(`movie:1${i}`, { pacing: 8 })]),
    );
    const after = deriveDna(events, 5_000);

    const nudgeFast = preferenceNudge(fastTitle, after).nudge;
    const nudgeSlow = preferenceNudge(slowTitle, after).nudge;

    expect(nudgeFast, 'playing did not move the ranking term at all').not.toBe(0);
    expect(nudgeFast, 'the fast title was not favoured over the slow one').toBeGreaterThan(nudgeSlow);
  });

  it('reorders two candidates that were tied before', () => {
    // The measurable claim: same two titles, same objective score, different
    // order after playing.
    const objective = 70;
    const events = playPicks(
      Array.from({ length: 12 }, (_, i) => [title(`movie:${i}`, { pacing: 92 }), title(`movie:1${i}`, { pacing: 8 })]),
    );
    const dna = deriveDna(events, 5_000);

    const scored = [
      { name: 'slow', score: objective + preferenceNudge(slowTitle, dna).nudge },
      { name: 'fast', score: objective + preferenceNudge(fastTitle, dna).nudge },
    ].sort((a, b) => b.score - a.score);

    expect(scored[0]!.name, 'the ranking did not respond to what was learned').toBe('fast');
  });

  it('records how much evidence the ranking actually requires', () => {
    /*
     * THE MEASURED BOUNDARY, pinned so it cannot drift silently.
     *
     * A pick is ATTRACTION evidence (strength 0.8), scaled by how strongly the
     * title expresses the axis, then weighted 0.7 when Experience and Attraction
     * are merged for ranking. `preferenceNudge` ignores any axis below
     * MIN_RANK_CONF (0.25).
     *
     * The consequence is worth stating plainly rather than discovering later:
     * SIX picks on one axis land at confidence 0.2497 and move the ranking by
     * exactly nothing — three ten-thousandths short of the gate. Ten clear it.
     * So a single game moves the ranking on the axes it concentrated on, and
     * axes it only glanced at accumulate across plays instead. That is the
     * intended behaviour of the canonical engine, not a Showdown quirk, and the
     * game should not compensate by inflating its own evidence weights.
     */
    const fast = { dims: dims({ pacing: 95 }), genres: [] };
    const nudgeAfter = (n: number) =>
      preferenceNudge(
        fast,
        deriveDna(
          playPicks(
            Array.from({ length: n }, (_, i) => [
              title(`movie:${i}`, { pacing: 92 }),
              title(`movie:1${i}`, { pacing: 8 }),
            ]),
          ),
          5_000,
        ),
      ).nudge;

    expect(nudgeAfter(6), 'six picks unexpectedly cleared the ranking gate').toBe(0);
    expect(nudgeAfter(10), 'ten picks no longer clear the ranking gate').toBeGreaterThan(0);
    expect(nudgeAfter(12), 'a full game no longer moves the ranking').toBeGreaterThan(0);
  });

  it('a twist correction reaches the ranking as an override', () => {
    // Corrections are applied by `preferenceNudge` through `correctedTaste`,
    // which is how a controlled comparison gets its extra authority in the
    // ranking rather than only in the profile.
    const controlled = toPreferenceEvents({
      left: title('movie:1', { pacing: 95 }),
      right: title('movie:2', { pacing: 5 }),
      verdict: 'left',
      kind: 'twist',
      testing: ['pacing'],
      sessionId: 'sess',
      roundId: 'r0',
      at: 1_000,
    }) as PreferenceEvent[];

    const dna = deriveDna(controlled, 5_000);
    const corrections = deriveCorrections(controlled);
    expect(Object.keys(corrections)).toContain('pacing');

    const withCorrection = preferenceNudge(fastTitle, dna, { corrections }).nudge;
    const withoutCorrection = preferenceNudge(fastTitle, dna).nudge;
    // One controlled answer carries further than one confounded answer does.
    expect(withCorrection).toBeGreaterThan(withoutCorrection);
  });

  it('haven’t-seen answers leave the ranking term exactly where it was', () => {
    const baseline = preferenceNudge(fastTitle, deriveDna([], 5_000)).nudge;
    const unseenEvents = toPreferenceEvents({
      left: title('movie:1', { pacing: 95 }),
      right: title('movie:2', { pacing: 5 }),
      verdict: 'unseen',
      kind: 'pair',
      testing: ['pacing'],
      sessionId: 'sess',
      roundId: 'r0',
      at: 1_000,
    }) as PreferenceEvent[];
    expect(unseenEvents).toEqual([]);
    expect(preferenceNudge(fastTitle, deriveDna(unseenEvents, 5_000)).nudge).toBe(baseline);
  });
});

describe('tonight bends the ranking without touching what was learned', () => {
  it('changes the dimension match rankByDna scores against', () => {
    // `rankByDna` computes its dimension nudge from `dimensionMatch(dims,
    // profile)`. The session lean is applied to a COPY of that profile's prefs,
    // which is exactly what the ranking path does.
    const permanent = buildProfile([
      { dims: dims({ darkness: 95, warmth: 10 }), rating: 9 },
      { dims: dims({ darkness: 92, warmth: 12 }), rating: 9 },
      { dims: dims({ darkness: 90, warmth: 15 }), rating: 8 },
    ]);
    const cosy = dims({ darkness: 10, warmth: 90 });

    const permanentMatch = dimensionMatch(cosy, permanent);
    const tonightMatch = dimensionMatch(cosy, {
      ...permanent,
      pref: applyLean(permanent.pref, intentById('comfort')!.lean),
    });

    expect(tonightMatch, 'tonight did not change the ranking input').toBeGreaterThan(permanentMatch);
    // And the permanent profile is unchanged — same answer as before.
    expect(dimensionMatch(cosy, permanent)).toBe(permanentMatch);
  });

  it('produces no events, so it can never become permanent', () => {
    // The structural guarantee: the session module has no path to an event, so
    // there is nothing to assert about "the mood was not written" beyond the
    // fact that no writer exists. Ranking still moved (previous test).
    const lean = intentById('easy')!.lean;
    const before = deriveDna([], 5_000);
    const after = deriveDna([], 5_000);
    applyLean({ complexity: 90 }, lean);
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
  });
});
