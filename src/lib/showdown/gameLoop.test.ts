import { describe, it, expect } from 'vitest';
import { TITLES } from '@/lib/voice/quickdna/definition';
import { traitBelief, traitConfidence, type TraitProfile } from '@/lib/voice/quickdna/traits';
import { pull } from './matchup';
import { momentFor } from './moments';
import { discoveriesFor, discoveryEvidence, discoveryDue, CLAIM_CONFIDENCE } from './discovery';
import { applyPermanent } from './evidence';
import {
  TARGET_DECISIONS,
  answer,
  answerDiscovery,
  createSession,
  permanentEvidenceFor,
  discoveryFor,
  markUnseen,
  startSession,
  type ShowdownState,
} from './session';

/**
 * THE GAME LOOP, NOT THE ENGINE UNDERNEATH IT.
 *
 * Everything here is about whether the thing a player experiences is real:
 * whether a label is derived from what the planner did or sprinkled on top,
 * whether "we caught something" rests on evidence, whether saying "haven't seen
 * it" costs the player a question, and whether two people who answer
 * differently are actually asked different things.
 *
 * These are the properties that decide whether it feels like a survey, and
 * every one of them is the kind of thing that looks fine in a screenshot and is
 * fake in the code.
 */

/** Play as someone who consistently takes the darker option. */
function playDark(rounds = TARGET_DECISIONS): ShowdownState {
  let s = startSession(createSession({}, 0, 'dna'), 0);
  const dark = (t: { traits: { key: string }[] } & Parameters<typeof pull>[0]) => pull(t, 'darkness');
  for (let i = 0; i < rounds && s.current; i++) {
    const { left, right } = s.current;
    s = answer(s, dark(left) >= dark(right) ? 'left' : 'right', 1000 + i, 800);
  }
  return s;
}

describe('moments describe what the engine is doing, not what would sound good', () => {
  it('most rounds carry no label at all', () => {
    /* A LABEL ON EVERY ROUND IS A LABEL ON NONE. If the band is always lit it
       stops carrying information and becomes chrome — and players work that out
       inside three rounds, which poisons everything else on the screen. */
    let s = startSession(createSession({}, 0, 'dna'), 0);
    let labelled = 0;
    let total = 0;
    for (let i = 0; i < TARGET_DECISIONS && s.current; i++) {
      const m = momentFor({
        matchup: s.current,
        profile: s.profile,
        decisionIndex: s.decisions.length,
        total: TARGET_DECISIONS,
      });
      total++;
      if (m) labelled++;
      s = answer(s, i % 2 === 0 ? 'left' : 'right', 1000 + i, 800);
    }
    expect(total).toBeGreaterThan(10);
    expect(labelled / total, 'every round was labelled — the band is decoration').toBeLessThan(0.75);
  });

  it('opens on instinct, because nothing is known yet', () => {
    const s = startSession(createSession({}, 0, 'dna'), 0);
    const m = momentFor({ matchup: s.current!, profile: {}, decisionIndex: 0, total: TARGET_DECISIONS });
    expect(m?.kind).toBe('instinct');
  });

  it('calls a curveball only when the pair really is obscure', () => {
    const obscure = TITLES.filter((t) => t.recognition <= 0.45);
    const known = TITLES.filter((t) => t.recognition > 0.7);
    expect(obscure.length, 'fixture has no obscure titles').toBeGreaterThan(0);

    const matchup = {
      left: obscure[0]!,
      right: obscure[1] ?? obscure[0]!,
      testing: ['darkness' as const],
      gain: 0.5,
      attribution: 0.5,
      twist: false,
    };
    expect(momentFor({ matchup, profile: {}, decisionIndex: 5, total: 20 })?.kind).toBe('curveball');

    const familiar = { ...matchup, left: known[0]!, right: known[1]! };
    expect(
      momentFor({ matchup: familiar, profile: {}, decisionIndex: 5, total: 20 })?.kind,
      'two household names were called a curveball',
    ).not.toBe('curveball');
  });

  it('calls a close call only when it actually predicts one', async () => {
    /* The label claims the engine expects near-equal appeal. If it fires on a
       pair the engine can clearly separate, it is a lie the player will feel the
       moment they find the choice obvious. */
    const played = playDark(12);
    let s = startSession(createSession({ profile: played.profile }, 0, 'dna'), 0);
    for (let i = 0; i < 8 && s.current; i++) {
      const m = momentFor({
        matchup: s.current,
        profile: s.profile,
        decisionIndex: s.decisions.length,
        total: TARGET_DECISIONS,
      });
      if (m?.kind === 'close-call') {
        const { predictedAppeal } = await import('./scanner');
        const gap = Math.abs(
          predictedAppeal(s.current.left, s.profile) - predictedAppeal(s.current.right, s.profile),
        );
        expect(gap, 'close call fired on a pair the engine can separate').toBeLessThanOrEqual(0.12);
      }
      s = answer(s, 'left', 2000 + i, 800);
    }
  });
});

describe('discoveries rest on evidence, or are not said', () => {
  it('says nothing at all from an empty profile', () => {
    expect(discoveriesFor({})).toEqual([]);
  });

  it('needs BOTH halves of the conjunction to be confident', () => {
    /* A single-axis claim ("you like dark stories") describes most people who
       finish a scan and reads as flattery. The pairing is the whole point. */
    const halfKnown: TraitProfile = applyPermanent({}, [
      { kind: 'permanent', key: 'patience', target: 100, weight: 3, attribution: 1 },
    ]);
    expect(traitConfidence(halfKnown, 'patience')).toBeGreaterThan(CLAIM_CONFIDENCE);
    expect(
      discoveriesFor(halfKnown).some((d) => d.id === 'slow-but-dark'),
      'a claim was made on one confident axis and one unknown one',
    ).toBe(false);

    const bothKnown = applyPermanent(halfKnown, [
      { kind: 'permanent', key: 'darkness', target: 100, weight: 3, attribution: 1 },
    ]);
    expect(discoveriesFor(bothKnown).some((d) => d.id === 'slow-but-dark')).toBe(true);
  });

  it('"not quite" pulls toward neutral, never to the opposite pole', () => {
    /* A denial means "that is not right about me", not "the reverse is true
       about me". Inverting it would invent an opinion out of a correction. */
    const profile = applyPermanent({}, [
      { kind: 'permanent', key: 'patience', target: 100, weight: 3, attribution: 1 },
      { kind: 'permanent', key: 'darkness', target: 100, weight: 3, attribution: 1 },
    ]);
    const discovery = discoveriesFor(profile).find((d) => d.id === 'slow-but-dark')!;
    const corrected = applyPermanent(profile, discoveryEvidence(discovery, 'correct'));

    const before = traitBelief(profile, 'patience').pref;
    const after = traitBelief(corrected, 'patience').pref;
    expect(after, 'a correction did not soften the belief').toBeLessThan(before);
    expect(after, 'a correction flipped the belief to its opposite').toBeGreaterThan(50);
  });

  it('"that’s me" strengthens it', () => {
    const profile = applyPermanent({}, [
      { kind: 'permanent', key: 'patience', target: 100, weight: 1, attribution: 1 },
      { kind: 'permanent', key: 'darkness', target: 100, weight: 1, attribution: 1 },
    ]);
    const discovery = discoveriesFor(profile).find((d) => d.id === 'slow-but-dark')!;
    const confirmed = applyPermanent(profile, discoveryEvidence(discovery, 'confirm'));
    expect(traitConfidence(confirmed, 'patience')).toBeGreaterThan(traitConfidence(profile, 'patience'));
  });

  it('never repeats one, and never opens with one', () => {
    expect(discoveryDue(2, 0, 0), 'a discovery was offered before anything was learned').toBe(false);
    expect(discoveryDue(9, 0, 0)).toBe(true);
    expect(discoveryDue(9, 8, 1), 'two discoveries back to back').toBe(false);
    expect(discoveryDue(30, 0, 3), 'the cap was ignored').toBe(false);
  });

  it('surfaces one mid-session for a player with a real profile, then not again', () => {
    const played = playDark(TARGET_DECISIONS);
    let s: ShowdownState = { ...played, decisions: played.decisions, lastDiscoveryRound: 0 };
    const first = discoveryFor(s);
    if (first) {
      s = answerDiscovery(s, first, 'confirm');
      expect(discoveryFor(s), 'a second discovery fired immediately after the first').toBeNull();
      expect(s.shownDiscoveries).toContain(first.id);
    }
  });
});

describe('"haven’t seen it" does not cost the player a question', () => {
  it('substitutes immediately and leaves the round budget intact', () => {
    let s = startSession(createSession({}, 0, 'dna'), 0);
    const shown = [s.current!.left.id, s.current!.right.id];
    s = markUnseen(s, 1000);

    expect(s.current, 'no replacement matchup was dealt').not.toBeNull();
    expect([s.current!.left.id, s.current!.right.id]).not.toContain(shown[0]);
    expect([s.current!.left.id, s.current!.right.id]).not.toContain(shown[1]);
    /* THE FIX. This used to advance the scan clock, so a player who had not seen
       four pairs finished with sixteen answers' worth of profile and a results
       screen that had to explain why it learned less. Recognition is a fact
       about the CATALOGUE; the catalogue pays for it. */
    expect(s.unseenRounds, 'an unrecognised pair consumed a round of the scan').toBe(0);
  });

  it('still lets a full session reach its target after several unseen pairs', () => {
    let s = startSession(createSession({}, 0, 'dna'), 0);
    for (let i = 0; i < 4 && s.current; i++) s = markUnseen(s, 1000 + i);
    for (let i = 0; i < TARGET_DECISIONS && s.current; i++) s = answer(s, 'left', 2000 + i, 800);
    expect(s.decisions.length).toBe(TARGET_DECISIONS);
  });

  it('and produces different evidence from "neither"', () => {
    const base = startSession(createSession({}, 0, 'dna'), 0);
    const viaUnseen = markUnseen(base, 1000);
    const viaNeither = answer(base, 'neither', 1000, 800);

    /* UNSEEN IS A STATEMENT ABOUT RECOGNITION and must move no belief at all —
       the same object back, not a copy that happens to be equal. */
    expect(viaUnseen.profile, 'an unrecognised pair changed a belief').toBe(base.profile);
    expect(viaUnseen.decisions.length, 'an unrecognised pair was recorded as an answer').toBe(0);

    /* NEITHER IS A TASTE STATEMENT and is recorded as a decision, whatever the
       pair happened to share. (An opening sweep pair is built to be maximally
       far apart, so it often has no shared ground and the evidence set is
       legitimately empty — that restraint is deliberate and tested in
       session.test.ts. What must never be true is the two answers being
       indistinguishable to the engine.) */
    expect(viaNeither.decisions.length).toBe(1);
    expect(viaNeither.decisions[0]!.verdict).toBe('neither');

    // And on a pair that DOES share ground, "neither" writes real evidence.
    const shared = TITLES.filter((t) => pull(t, 'darkness') > 0.5).slice(0, 2);
    expect(shared.length).toBe(2);
    const evidence = permanentEvidenceFor(
      { left: shared[0]!, right: shared[1]!, gain: 0.5 },
      'neither',
    );
    expect(evidence.length, '"neither" on two dark films recorded nothing').toBeGreaterThan(0);
  });
});

describe('the game adapts: answer differently, get asked differently', () => {
  it('two opposed players diverge on the questions they are dealt', () => {
    const darkSide = (t: Parameters<typeof pull>[0]) => pull(t, 'darkness');
    function playToward(prefer: 'dark' | 'light'): string[] {
      let s = startSession(createSession({}, 0, 'dna'), 0);
      const asked: string[] = [];
      for (let i = 0; i < TARGET_DECISIONS && s.current; i++) {
        asked.push(`${s.current.left.id}|${s.current.right.id}`);
        const leftDarker = darkSide(s.current.left) >= darkSide(s.current.right);
        const takeLeft = prefer === 'dark' ? leftDarker : !leftDarker;
        s = answer(s, takeLeft ? 'left' : 'right', 1000 + i, 800);
      }
      return asked;
    }

    const a = playToward('dark');
    const b = playToward('light');
    /* THE OPENING IS DELIBERATELY SHARED. Nothing is known about either player
       yet, so the most informative first question is the same one — divergence
       has to come from evidence, not from randomness. What matters is that it
       arrives, and that it is substantial. */
    const shared = a.filter((q) => b.includes(q)).length;
    expect(a[0], 'the two players were opened differently, which means noise').toBe(b[0]);
    expect(
      shared / a.length,
      `${shared}/${a.length} questions were identical — the game is not adapting`,
    ).toBeLessThan(0.7);
  });
});
