import { describe, it, expect } from 'vitest';
import { deriveDna } from '@/lib/preference/engine';
import type { PreferenceEvent } from '@/lib/preference/types';
import { TITLES } from '@/lib/voice/quickdna/definition';
import { pull } from './matchup';
import { canonicalTitleId, mediaTypeFor } from './mediaType';
import { gradeForDecision } from './canonical';
import { reasonsFor } from './reasons';
import {
  TARGET_DECISIONS,
  addReason,
  answer,
  attributionOf,
  createSession,
  followUpFor,
  pairForDecision,
  startSession,
  type ShowdownState,
} from './session';
import { projectTraits } from '@/lib/taste/fingerprint';
import { pairwiseEvents } from '@/lib/taste/crossing';
import { computePayoff, type PayoffCandidate } from './payoff';

/**
 * DID THE GAME CHANGE WHAT WATCHVERDICT RECOMMENDS?
 *
 * The old results screen ranked the diagnostic pool with Showdown's private
 * model and called it a recommendation. That could not fail: the game scored the
 * films the game knew, using the game's own arithmetic, and the player was shown
 * whatever came out. It proved nothing about the product.
 *
 * This is the opposite arrangement, and every part of it is deliberately outside
 * Showdown's control:
 *
 *   THE CANDIDATES ARE NOT DIAGNOSTIC TITLES. None of these appear in the pool
 *   the session was played on, so nothing can be recommended merely because it
 *   was on screen a minute ago.
 *
 *   THE RANKER IS THE PRODUCTION ONE. `computePayoff` calls `preferenceNudge` —
 *   the same function `rankByDna` uses — over the same `deriveDna` fold that
 *   reads `preference_events`.
 *
 *   THE STARTING DNA IS FIXED and the answers are fixed, so a change in the
 *   ordering can only have come from the evidence the session recorded.
 */

/**
 * A candidate set the diagnostic pool never touches.
 *
 * FIXTURE DIMENSIONS, AND SAID SO. These are not classifier output; they are a
 * controlled set chosen so the pairs differ on the axes under test and agree
 * elsewhere. That is what makes a reordering attributable — with real
 * fingerprints every candidate would differ on twenty axes at once and any
 * movement could be explained a dozen ways.
 */
const CANDIDATES: PayoffCandidate[] = [
  {
    id: 'c-bleak-thriller',
    title: 'A Bleak Thriller',
    year: 2021,
    objective: 72,
    genres: ['thriller'],
    dims: { darkness: 92, suspense: 85, humor: 10, warmth: 20, pacing: 55, complexity: 65 },
  },
  {
    id: 'c-warm-comedy',
    title: 'A Warm Comedy',
    year: 2022,
    objective: 72,
    genres: ['comedy'],
    dims: { darkness: 12, suspense: 20, humor: 90, warmth: 88, pacing: 60, complexity: 30 },
  },
  {
    id: 'c-quiet-drama',
    title: 'A Quiet Drama',
    year: 2019,
    objective: 71,
    genres: ['drama'],
    dims: { darkness: 55, suspense: 35, humor: 25, warmth: 55, pacing: 25, complexity: 70 },
  },
  {
    id: 'c-loud-blockbuster',
    title: 'A Loud Blockbuster',
    year: 2023,
    objective: 73,
    genres: ['action'],
    dims: { darkness: 35, suspense: 60, humor: 45, warmth: 50, pacing: 92, complexity: 20 },
  },
  {
    id: 'c-bleak-slowburn',
    title: 'A Bleak Slow Burn',
    year: 2020,
    objective: 70,
    genres: ['drama'],
    dims: { darkness: 88, suspense: 55, humor: 8, warmth: 22, pacing: 18, complexity: 78 },
  },
  {
    id: 'c-family-adventure',
    title: 'A Family Adventure',
    year: 2018,
    objective: 71,
    genres: ['family'],
    dims: { darkness: 10, suspense: 25, humor: 70, warmth: 92, pacing: 70, complexity: 15 },
  },
];

/**
 * HOW MUCH PLAY IT TAKES TO MOVE PRODUCTION RANKING — measured, not chosen.
 *
 * One twenty-round session reaches confidence 0.103 on the axis it hammered.
 * The production ranker's floor is `MIN_RANK_CONF = 0.25` and it correctly
 * declines to act below that. Two sessions reach 0.189 and still move nothing.
 * Three reach 0.258 and produce a real nudge of about +2.2.
 *
 * That is a product fact and it is pinned rather than tuned around. Lowering
 * the floor, or inflating the crossing's weights, would make this test pass and
 * would make every OTHER surface of the product act on evidence it should not
 * trust. The honest consequence — a first session teaches the profile without
 * yet reordering recommendations — is what the results screen already says.
 */
const SESSIONS_TO_MOVE_RANKING = 3;

/** Play `n` fixed sessions, answering "why" whenever asked. */
function play(prefer: 'dark' | 'light', n = SESSIONS_TO_MOVE_RANKING): ShowdownState['decisions'] {
  const all: ShowdownState['decisions'] = [];
  let profile = {};
  let seenPairs: string[] = [];
  const darkness = (t: Parameters<typeof pull>[0]) => pull(t, 'darkness');
  for (let r = 0; r < n; r++) {
    let s = startSession(createSession({ profile, seenPairs }, 0, 'dna'), 0);
    for (let i = 0; i < TARGET_DECISIONS && s.current; i++) {
      const leftDarker = darkness(s.current.left) >= darkness(s.current.right);
      const takeLeft = prefer === 'dark' ? leftDarker : !leftDarker;
      s = answer(s, takeLeft ? 'left' : 'right', 1000 + r * 100 + i, 900);
      const asked = followUpFor(s);
      if (asked?.kind !== 'why') continue;
      const chip = asked.chips.find((c) => c.key === 'darkness' && c.high === (prefer === 'dark'));
      if (chip) s = addReason(s, chip);
    }
    all.push(...s.decisions);
    profile = s.profile;
    seenPairs = s.seenPairs;
  }
  return all;
}

/** The real crossing: comparative axis vectors plus any stated reasons. */
function eventsFor(decisions: ShowdownState['decisions']): PreferenceEvent[] {
  const fp = (t: (typeof TITLES)[number], at: number) =>
    projectTraits(
      { tmdbId: t.tmdbId, mediaType: mediaTypeFor(t.id), title: t.title, year: t.year },
      t.traits,
      at,
    );
  const out: PreferenceEvent[] = [];
  for (const d of decisions) {
    const pair = pairForDecision(d);
    const l = canonicalTitleId(d.leftId);
    const r = canonicalTitleId(d.rightId);
    if (!pair || !l || !r) continue;
    const win = d.verdict === 'left' ? pair.left : pair.right;
    const lose = d.verdict === 'left' ? pair.right : pair.left;
    const chip = d.reason ? reasonsFor(win, lose).find((c) => c.id === d.reason) : undefined;
    out.push(
      ...pairwiseEvents({
        left: { titleId: l, fingerprint: fp(pair.left, d.at) },
        right: { titleId: r, fingerprint: fp(pair.right, d.at) },
        verdict: d.verdict,
        at: d.at,
        responseMs: d.responseMs,
        ...(chip ? { statedAxis: { key: chip.key, high: chip.high } } : {}),
        attractionGrade: gradeForDecision(d, attributionOf(d)),
        source: 'showdown',
      }),
    );
  }
  return out;
}

describe('the payoff comes from the real ranker, over a real candidate set', () => {
  const diagnosticIds = new Set(TITLES.map((t) => t.id));
  const emptyDna = deriveDna([], Date.now());

  it('recommends nothing merely because it was a diagnostic title', () => {
    /* §10: "the diagnostic pool is an instrument. It is NOT the recommendation
       catalogue." Asserted structurally so the fixture cannot drift back. */
    for (const c of CANDIDATES) {
      expect(diagnosticIds.has(c.id), `${c.id} is a diagnostic title`).toBe(false);
    }
  });

  it('a session with no evidence leaves the ranking exactly as it was', () => {
    const payoff = computePayoff(CANDIDATES, emptyDna, emptyDna);
    expect(payoff.movement, 'an empty session reordered the catalogue').toBe(0);
    expect(payoff.climbed).toEqual([]);
  });

  it('ONE session moves the belief but not yet the order — and that is reported, not hidden', () => {
    /* THE FIRST-RUN TRUTH. A results screen that celebrated a reordering here
       would be describing something that did not happen: the ranker is refusing
       to act on 0.103 confidence, which is exactly what it should do. Pinned so
       nobody "fixes" it by lowering the floor. */
    const oneSession = deriveDna(eventsFor(play('dark', 1)), Date.now());
    const payoff = computePayoff(CANDIDATES, emptyDna, oneSession);
    expect(payoff.movement).toBe(0);
  });

  it('three fixed sessions, and the production ranker reorders the catalogue', () => {
    const dark = deriveDna(eventsFor(play('dark')), Date.now());
    const payoff = computePayoff(CANDIDATES, emptyDna, dark);

    // eslint-disable-next-line no-console
    console.log(
      '\n=== BEFORE SHOWDOWN ===\n' +
        payoff.before
          .slice(0, 5)
          .map((c, i) => `${i + 1}. ${c.title.padEnd(22)} ${c.score.toFixed(2)}`)
          .join('\n') +
        '\n\n=== AFTER LEARNING YOU ===\n' +
        payoff.after
          .slice(0, 5)
          .map(
            (c, i) =>
              `${i + 1}. ${c.title.padEnd(22)} ${c.score.toFixed(2)}  ${
                c.moved > 0 ? `↑${c.moved}` : c.moved < 0 ? `↓${-c.moved}` : '–'
              }`,
          )
          .join('\n'),
    );

    expect(
      payoff.movement,
      'a full session did not move a single candidate — the payoff is inert',
    ).toBeGreaterThan(0);

    // The direction has to be right, not merely different.
    const bleakAfter = payoff.after.findIndex((c) => c.id === 'c-bleak-thriller');
    const warmAfter = payoff.after.findIndex((c) => c.id === 'c-warm-comedy');
    expect(
      bleakAfter,
      'calibrating toward bleak films did not rank the bleak thriller above the warm comedy',
    ).toBeLessThan(warmAfter);
  });

  it('and the mirror session reorders it the other way', () => {
    /* THE CONTROL. "The order changed" is also what a model that got noisier
       produces. Two opposed sessions must move the SAME catalogue in opposite
       directions for the change to mean anything. */
    const dark = deriveDna(eventsFor(play('dark')), Date.now());
    const light = deriveDna(eventsFor(play('light')), Date.now());

    const darkOrder = computePayoff(CANDIDATES, emptyDna, dark).after.map((c) => c.id);
    const lightOrder = computePayoff(CANDIDATES, emptyDna, light).after.map((c) => c.id);

    expect(darkOrder, 'two opposite sessions produced the same recommendations').not.toEqual(
      lightOrder,
    );
    expect(darkOrder.indexOf('c-bleak-thriller')).toBeLessThan(darkOrder.indexOf('c-warm-comedy'));
    expect(lightOrder.indexOf('c-warm-comedy')).toBeLessThan(lightOrder.indexOf('c-bleak-thriller'));
  });

  it('starting DNA is respected: the same session applied to a different person differs', () => {
    // Fixed starting DNA, per §10. Someone who already leans light gets a
    // different result from the identical session than someone starting blank.
    const priorLight = deriveDna(eventsFor(play('light')), Date.now());
    const sessionDark = eventsFor(play('dark'));
    const combined = deriveDna([...eventsFor(play('light')), ...sessionDark], Date.now());

    const fromBlank = computePayoff(CANDIDATES, emptyDna, deriveDna(sessionDark, Date.now()));
    const fromLight = computePayoff(CANDIDATES, priorLight, combined);

    expect(
      fromLight.after.map((c) => c.id),
      'the starting profile was ignored — every user would get the same answer',
    ).not.toEqual(fromBlank.after.map((c) => c.id));
  });
});
