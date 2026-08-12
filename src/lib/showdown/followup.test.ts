import { describe, it, expect } from 'vitest';
import type { DiagnosticTitle, TraitEffect } from '@/lib/voice/quickdna/definition';
import { traitBelief, type TraitKey } from '@/lib/voice/quickdna/traits';
import {
  FOLLOWUP_BUDGET,
  INTENSITY_BASE,
  REASON_CEILING,
  agreedAxes,
  chooseFollowUp,
  intensityEvidence,
  reasonEvidence,
  writtenOn,
} from './followup';
import { CHIP_MIN_SEPARATION, GUT_CALL, reasonsFor, shouldAskWhy } from './reasons';
import { separation } from './matchup';
import {
  TARGET_DECISIONS,
  addIntensity,
  addReason,
  answer,
  createSession,
  followUpFor,
  permanentEvidenceFor,
  skipFollowUp,
  startSession,
  type ShowdownState,
} from './session';

/**
 * THE EVIDENCE GRAMMAR — is a second question actually worth a second?
 *
 * Showdown collected one kind of evidence: which of two. These pin the two that
 * were added, and specifically the properties that make them worth having
 * rather than merely present:
 *
 *   a reason must TOP UP a confounded pick to clean, never add on top of it;
 *   an appetite must land only where the comparison was silent, so one tap can
 *   never be counted twice;
 *   both must respect the interruption budget, because evidence from a session
 *   nobody finishes is worth nothing.
 */

const eff = (key: TraitKey, strength: number, invert = false): TraitEffect =>
  invert ? { key, strength, invert } : { key, strength };

const title = (id: string, traits: TraitEffect[]): DiagnosticTitle => ({
  id,
  title: id,
  year: 2000,
  tmdbId: 1,
  recognition: 0.9,
  traits,
});

describe('reason chips describe THIS pair, never a fixed list', () => {
  it('only offers axes the two titles genuinely diverge on', () => {
    const winner = title('w', [eff('darkness', 1), eff('comedy', 0.2), eff('crime', 0.8)]);
    const loser = title('l', [eff('darkness', 0.1), eff('comedy', 0.15), eff('warmth', 0.9)]);

    for (const chip of reasonsFor(winner, loser)) {
      expect(
        separation(winner, loser, chip.key),
        `offered "${chip.label}" for an axis the pair barely splits on`,
      ).toBeGreaterThanOrEqual(CHIP_MIN_SEPARATION);
    }
  });

  it('phrases every chip in the direction of the film that won', () => {
    const winner = title('w', [eff('darkness', 1), eff('patience', 0.9)]);
    const loser = title('l', [eff('comedy', 1), eff('warmth', 0.9)]);

    for (const chip of reasonsFor(winner, loser)) {
      const towardWinner =
        winner.traits.filter((e) => e.key === chip.key).reduce((s, e) => s + (e.invert ? -e.strength : e.strength), 0) -
        loser.traits.filter((e) => e.key === chip.key).reduce((s, e) => s + (e.invert ? -e.strength : e.strength), 0);
      expect(chip.high, `"${chip.label}" points away from the winner`).toBe(towardWinner > 0);
    }
  });

  it('offers different reasons for different pairs', () => {
    const a = reasonsFor(
      title('a1', [eff('darkness', 1), eff('violence', 0.9)]),
      title('a2', [eff('comedy', 1)]),
    ).map((c) => c.id);
    const b = reasonsFor(
      title('b1', [eff('animation', 1), eff('family', 0.9)]),
      title('b2', [eff('documentary', 1)]),
    ).map((c) => c.id);

    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    expect(a, 'the same chips came back for two unrelated pairs').not.toEqual(b);
  });

  it('asks only when the pick was genuinely confounded', () => {
    const chips = reasonsFor(
      title('w', [eff('darkness', 1), eff('crime', 0.9)]),
      title('l', [eff('comedy', 1), eff('warmth', 0.9)]),
    );
    // A near-single-axis pick has nothing to disambiguate — asking anyway is
    // what makes a game feel like a form.
    expect(shouldAskWhy(0.95, chips)).toBe(false);
    expect(shouldAskWhy(0.35, chips)).toBe(true);
  });
});

describe('a stated reason upgrades the observation, it does not inflate it', () => {
  const winner = title('w', [eff('darkness', 1), eff('crime', 0.8), eff('patience', 0.7)]);
  const loser = title('l', [eff('comedy', 1), eff('warmth', 0.9), eff('family', 0.6)]);
  const pair = { left: winner, right: loser, gain: 0.5 };

  it('tops the named axis up to exactly what a clean matchup pays, and no further', () => {
    const comparative = permanentEvidenceFor(pair, 'left');
    const chip = reasonsFor(winner, loser).find((c) => c.key === 'darkness');
    expect(chip, 'the pair does not split on darkness — fixture is wrong').toBeTruthy();

    const already = writtenOn(comparative, 'darkness');
    expect(already, 'a confounded pick should not already be paying full price').toBeLessThan(
      REASON_CEILING,
    );

    const topUp = reasonEvidence(chip!, already);
    const total = already + topUp.reduce((s, e) => s + e.weight, 0);
    expect(total).toBeCloseTo(REASON_CEILING, 10);
  });

  it('so a confounded pick plus a reason never outweighs a genuinely clean one', () => {
    const clean = permanentEvidenceFor(
      { left: title('c1', [eff('darkness', 1)]), right: title('c2', [eff('darkness', 0, true)]), gain: 1 },
      'left',
    );
    const cleanWeight = writtenOn(clean, 'darkness');

    const chip = reasonsFor(winner, loser).find((c) => c.key === 'darkness')!;
    const already = writtenOn(permanentEvidenceFor(pair, 'left'), 'darkness');
    const explained = already + reasonEvidence(chip, already).reduce((s, e) => s + e.weight, 0);

    expect(explained).toBeLessThanOrEqual(cleanWeight + 1e-9);
  });

  it('records nothing at all for a gut call', () => {
    expect(reasonEvidence(GUT_CALL, 0)).toEqual([]);
  });
});

describe('a stated appetite lands only where the comparison was silent', () => {
  const winner = title('w', [eff('darkness', 1), eff('crime', 0.8), eff('episodic', 0.6)]);
  const loser = title('l', [eff('comedy', 1), eff('crime', 0.8), eff('episodic', 0.6)]);
  const pair = { left: winner, right: loser, gain: 0.5 };

  it('never touches an axis the pick already spoke for', () => {
    const comparative = new Set(permanentEvidenceFor(pair, 'left').map((e) => e.key));
    const appetite = intensityEvidence(pair, winner, 'must');

    expect(appetite.length, 'the appetite recorded nothing at all').toBeGreaterThan(0);
    for (const e of appetite) {
      expect(
        comparative.has(e.key),
        `"${e.key}" was written by both the pick and the appetite — one tap counted twice`,
      ).toBe(false);
    }
  });

  it('speaks for the shared ground, which is the only thing a comparison cannot', () => {
    expect(agreedAxes(pair, winner).sort()).toEqual(['crime', 'episodic']);
  });

  it('"just better than the other one" asserts nothing beyond the pick', () => {
    expect(INTENSITY_BASE.relative).toBe(0);
    expect(intensityEvidence(pair, winner, 'relative')).toEqual([]);
  });

  it('and "watching that tonight" outweighs "would happily watch"', () => {
    const must = intensityEvidence(pair, winner, 'must').reduce((s, e) => s + e.weight, 0);
    const keen = intensityEvidence(pair, winner, 'keen').reduce((s, e) => s + e.weight, 0);
    expect(must).toBeGreaterThan(keen);
    expect(keen).toBeGreaterThan(0);
  });
});

/** Play a whole run, answering every follow-up that is offered. */
function playWithFollowUps(mode: 'dna' | 'tonight' = 'dna') {
  let s: ShowdownState = startSession(createSession({}, 0, mode), 0);
  const offers: Array<{ round: number; kind: string }> = [];
  for (let i = 0; i < TARGET_DECISIONS + 6 && s.current; i++) {
    s = answer(s, i % 3 === 0 ? 'right' : 'left', 1000 + i, 800);
    const asked = followUpFor(s);
    if (!asked) continue;
    offers.push({ round: s.decisions.length, kind: asked.kind });
    s = asked.kind === 'why' ? addReason(s, asked.chips[0]!) : addIntensity(s, 'must');
  }
  return { state: s, offers };
}

describe('the interruption budget is the difference between a game and a form', () => {
  it('interrupts a small minority of rounds', () => {
    const { state, offers } = playWithFollowUps();
    expect(offers.length).toBeGreaterThan(0);
    expect(offers.length).toBeLessThanOrEqual(FOLLOWUP_BUDGET);
    expect(state.followups).toBe(offers.length);
    expect(
      offers.length / state.decisions.length,
      'more than half the rounds were interrupted — that is a questionnaire',
    ).toBeLessThan(0.5);
  });

  it('never interrupts two rounds running', () => {
    const { offers } = playWithFollowUps();
    for (let i = 1; i < offers.length; i++) {
      expect(offers[i]!.round - offers[i - 1]!.round, 'back-to-back follow-ups').toBeGreaterThan(1);
    }
  });

  it('spends the budget on a dismissal too, so declining is not a way to be asked forever', () => {
    let s = startSession(createSession({}, 0, 'dna'), 0);
    s = answer(s, 'left', 1000, 800);
    const before = s.followups;
    s = skipFollowUp(s);
    expect(s.followups).toBe(before + 1);
    expect(s.decisions[0]!.reason, 'a dismissal was recorded as an answer').toBeUndefined();
  });

  it('asks nothing after a refusal of both, which has no winner to ask about', () => {
    let s = startSession(createSession({}, 0, 'dna'), 0);
    s = answer(s, 'neither', 1000, 800);
    expect(followUpFor(s)).toBeNull();
  });

  it('a follow-up never re-deals a title the player has already met', () => {
    const { state } = playWithFollowUps();
    const shown = state.decisions.flatMap((d) => [d.leftId, d.rightId]);
    expect(new Set(shown).size, 'the no-repeat invariant broke under re-dealing').toBe(shown.length);
  });
});

describe('the ledger split survives the new evidence types', () => {
  it('a tonight follow-up writes nothing permanent', () => {
    let s = startSession(createSession({}, 0, 'tonight'), 0);
    const before = s.profile;
    for (let i = 0; i < 8 && s.current; i++) {
      s = answer(s, 'left', 1000 + i, 800);
      const asked = followUpFor(s);
      if (asked) s = asked.kind === 'why' ? addReason(s, asked.chips[0]!) : addIntensity(s, 'must');
    }
    // Not "deep-equal to empty" — the SAME OBJECT. A copy that happens to be
    // equal would still mean a write path exists.
    expect(s.profile, 'a tonight follow-up reached permanent identity').toBe(before);
    expect(Object.keys(s.lean).length, 'the tonight lean never moved').toBeGreaterThan(0);
  });

  it('a dna follow-up moves the named axis in the stated direction', () => {
    let s = startSession(createSession({}, 0, 'dna'), 0);
    s = answer(s, 'left', 1000, 800);

    /* A SYNTHETIC CHIP, so the assertion does not depend on which pair the
       planner happened to deal first — and DELIBERATELY IN BOTH DIRECTIONS,
       because "the number went up" is also what a bug that ignores `high`
       produces. */
    const up = addReason(s, { id: 'darkness:hi', label: 'Darker', key: 'darkness', high: true });
    const down = addReason(s, { id: 'darkness:lo', label: 'Less bleak', key: 'darkness', high: false });

    expect(
      traitBelief(up.profile, 'darkness').pref,
      'a stated reason did not raise the axis it named',
    ).toBeGreaterThan(traitBelief(down.profile, 'darkness').pref);
    expect(up.decisions[0]!.reason).toBe('darkness:hi');
  });
});

describe('chooseFollowUp', () => {
  const winner = title('w', [eff('darkness', 1), eff('crime', 0.8), eff('patience', 0.7)]);
  const loser = title('l', [eff('comedy', 1), eff('warmth', 0.9), eff('family', 0.6)]);
  const base = {
    pair: { left: winner, right: loser },
    winner,
    attribution: 0.3,
    decisionIndex: 3,
    spent: 0,
    backToBack: false,
  };

  it('stays silent once the budget is spent', () => {
    expect(chooseFollowUp({ ...base, spent: FOLLOWUP_BUDGET })).toBeNull();
  });

  it('stays silent immediately after another follow-up', () => {
    expect(chooseFollowUp({ ...base, backToBack: true })).toBeNull();
  });

  it('prefers disambiguation over appetite when both are eligible', () => {
    const asked = chooseFollowUp({ ...base, decisionIndex: 5 });
    expect(asked?.kind).toBe('why');
  });
});
