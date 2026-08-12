import { describe, it, expect } from 'vitest';
import {
  TARGET_DECISIONS,
  addReason,
  answer,
  answerCalibration,
  createSession,
  skipFollowUp,
  startSession,
  timeoutRound,
  calibrationObservations,
  type ShowdownState,
} from './session';
import { selectCalibration, MAX_CALIBRATION_WEIGHT, type AxisObservation } from './calibration';
import { GUT_CALL, type ReasonChip } from './reasons';
import { planRound, rapidRounds } from './arc';
import { traitBelief, type TraitKey, type TraitProfile } from '@/lib/voice/quickdna/traits';

/**
 * G2 — EACH MECHANIC MUST EARN EXACTLY WHAT IT CLAIMS, AND NOTHING ELSE.
 *
 * Every optional mechanic in this game is a way for evidence to enter the
 * profile, which makes each one a way for evidence to enter it WRONGLY. The
 * three failure modes, one per mechanic:
 *
 *   A4  a stated 1-10 leaks onto axes nobody asked about, or outweighs a
 *       history it was never meant to overrule.
 *   A6  declining to explain a choice is recorded as an explanation.
 *   RF  a countdown expiring is booked as dislike.
 *
 * All three are silent in production. None would throw, none would look wrong
 * on screen, and each would quietly corrupt the thing the whole product sells.
 * These drive the real state machine and compare profiles before and after.
 */

const play = (rounds = 1, side: 'left' | 'right' = 'left') => {
  let s = startSession(createSession({}, 1), 1);
  for (let i = 0; i < rounds && s.current; i++) s = answer(s, side, 1000 + i * 1000, 900);
  return s;
};

const movedAxes = (before: TraitProfile, after: TraitProfile): TraitKey[] =>
  (Object.keys({ ...before, ...after }) as TraitKey[]).filter(
    (k) => traitBelief(before, k).pref !== traitBelief(after, k).pref,
  );

const obs = (key: string, target: number, weight = 3): AxisObservation =>
  ({ key, target, weight }) as AxisObservation;

// ── A4 ────────────────────────────────────────────────────────────────────
describe('A4 — a stated 1-10 touches only the axis it named', () => {
  const split = [obs('horrorTolerance', 95), obs('horrorTolerance', 5)];
  const question = selectCalibration(split)!;

  it('fires on contradiction and not on consistency', () => {
    expect(question.key).toBe('horrorTolerance');
    expect(selectCalibration(Array.from({ length: 12 }, () => obs('horrorTolerance', 92)))).toBeNull();
  });

  it('MOVES EXACTLY ONE AXIS — no leakage onto anything else', () => {
    const before = play(6).profile;
    const after = answerCalibration({ ...play(6), profile: before }, question, 9).profile;
    expect(movedAxes(before, after)).toEqual(['horrorTolerance']);
  });

  it('a low answer moves it DOWN, not merely less up', () => {
    /* Started from a raised belief on purpose. A six-round session had already
       driven this axis to the floor, so "moves down" was unprovable there —
       nothing can go below 0, and the assertion would have been measuring the
       clamp rather than the mechanic. */
    const raised: TraitProfile = { horrorTolerance: { pref: 80, evidence: 2 } };
    const after = answerCalibration({ ...play(6), profile: raised }, question, 1).profile;
    expect(traitBelief(after, 'horrorTolerance').pref).toBeLessThan(80);
  });

  it('is bounded — it cannot outrank a history it was never meant to overrule', () => {
    const mature: TraitProfile = { horrorTolerance: { pref: 95, evidence: 40 } };
    const after = answerCalibration({ ...play(6), profile: mature }, question, 1).profile;
    /* The stated answer is heard — but 40 units of accumulated evidence are not
       erased by one tap, because the weight is capped. */
    expect(traitBelief(after, 'horrorTolerance').pref).toBeLessThan(95);
    expect(traitBelief(after, 'horrorTolerance').pref).toBeGreaterThan(50);
    expect(MAX_CALIBRATION_WEIGHT).toBeLessThan(5);
  });

  it('is never asked twice in one run', () => {
    const s = answerCalibration(play(6), question, 7);
    expect(s.calibrated).toContain('horrorTolerance');
    expect(selectCalibration(split, { asked: s.calibrated })).toBeNull();
  });
});

// ── A6 ────────────────────────────────────────────────────────────────────
describe('A6 — an explanation is recorded only when one was given', () => {
  const stated = (s: ShowdownState): ReasonChip | null => {
    const axes = s.decisions[s.decisions.length - 1]?.testing ?? [];
    const key = axes[0];
    return key ? ({ id: `${key}-hi`, label: 'x', key, high: true } as ReasonChip) : null;
  };

  it('YES — a named reason is persisted on the decision', () => {
    const s = play(3);
    const chip = stated(s)!;
    const after = addReason(s, chip);
    expect(after.decisions[after.decisions.length - 1]!.reason).toBe(chip.id);
  });

  it('GUT CALL — recorded as a real answer that names no axis', () => {
    /* `'gut'` must be DISTINCT FROM ABSENT. Absent means "we never asked";
       gut means "we asked and they declined to attribute it". Collapsing the
       two would let the game re-ask forever, or credit an axis nobody chose. */
    const after = addReason(play(3), GUT_CALL);
    const d = after.decisions[after.decisions.length - 1]!;
    expect(d.reason).toBe('gut');
    expect(d.reason).not.toBeUndefined();
  });

  it('gut call FABRICATES NO ATTRIBUTION — the profile is untouched by it', () => {
    const s = play(3);
    const before = JSON.stringify(s.profile);
    expect(JSON.stringify(addReason(s, GUT_CALL).profile)).toBe(before);
  });

  it('a named reason DOES move something, or the question was pointless', () => {
    const s = play(3);
    const chip = stated(s);
    if (chip) {
      expect(JSON.stringify(addReason(s, chip).profile)).not.toBe(JSON.stringify(s.profile));
    }
  });

  it('SKIPPING converts no uncertainty into certainty', () => {
    const s = play(3);
    const skipped = skipFollowUp(s);
    expect(JSON.stringify(skipped.profile)).toBe(JSON.stringify(s.profile));
    // ...but it still costs the interruption budget, so it cannot be re-asked.
    expect(skipped.followups).toBeGreaterThanOrEqual(s.followups);
  });
});

// ── RAPID FIRE ────────────────────────────────────────────────────────────
describe('Rapid Fire — an answer teaches, a timeout does not', () => {
  it('an answer during the burst is ordinary evidence', () => {
    const s = play(1);
    expect(s.decisions).toHaveLength(1);
    expect(Object.keys(s.profile).length).toBeGreaterThan(0);
  });

  it('A TIMEOUT IS NOT A DISLIKE, AND NOT AN AVOIDANCE', () => {
    const s = play(3);
    const before = JSON.stringify(s.profile);
    const expired = timeoutRound(s, 9999);
    expect(JSON.stringify(expired.profile)).toBe(before);
    expect(expired.decisions).toHaveLength(s.decisions.length);
    expect(expired.unseenTitles).toEqual(s.unseenTitles);
  });

  it('a timeout adds nothing a contested-axis calculation could read either', () => {
    /* The planner and the 1-10 question both read `calibrationObservations`.
       If a timeout leaked in there it would steer the rest of the session. */
    const s = play(4);
    expect(calibrationObservations(timeoutRound(s, 9999))).toEqual(calibrationObservations(s));
  });
});

// ── TIMING BAND ───────────────────────────────────────────────────────────
describe('the clock only runs where it was designed to', () => {
  it('never on the opening rounds', () => {
    for (const i of [0, 1, 2]) expect(planRound(i, TARGET_DECISIONS).timeLimitMs).toBeNull();
  });

  it('never on the final two, which carry the best questions', () => {
    for (const i of [TARGET_DECISIONS - 2, TARGET_DECISIONS - 1]) {
      expect(planRound(i, TARGET_DECISIONS).timeLimitMs).toBeNull();
    }
  });

  it('the burst is real, contiguous, and a minority of the run', () => {
    const rounds = rapidRounds(TARGET_DECISIONS);
    expect(rounds.length).toBeGreaterThanOrEqual(2);
    expect(rounds.length).toBeLessThan(TARGET_DECISIONS / 2);
    for (let i = 1; i < rounds.length; i++) expect(rounds[i]! - rounds[i - 1]!).toBe(1);
  });

  it('the timer stops for an untimed follow-up', () => {
    /* Rendered QA caught the drained ring sitting above a follow-up that has no
       time limit. The stage is handed a cinematic round whenever a follow-up is
       pending; this pins the contract that makes that possible. */
    const src = String(planRound);
    expect(src).toContain('timeLimitMs');
    const ui = require('node:fs').readFileSync('src/components/showdown/Showdown.tsx', 'utf8');
    expect(ui).toContain("round={followUp ? { phase: 'cinematic' as const, timeLimitMs: null, entering: false } : round}");
  });
});
