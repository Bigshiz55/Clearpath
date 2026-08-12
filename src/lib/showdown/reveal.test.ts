import { describe, it, expect } from 'vitest';
import { buildReveal } from './reveal';
import type { AxisObservation } from './calibration';
import type { TraitProfile } from '@/lib/voice/quickdna/traits';

/**
 * A REVEAL MUST BE ABLE TO SAY NOTHING.
 *
 * The failure mode of an identity screen is not being wrong — it is being
 * confidently generic. Every slot filled, every session, regardless of what the
 * player actually did. These tests exist to make the empty case reachable and
 * the confident case earned.
 */

const belief = (pref: number, evidence: number) => ({ pref, evidence });

/** A profile with real weight behind two opposite axes. */
const strong: TraitProfile = {
  horrorTolerance: belief(92, 3),
  darkness: belief(88, 3),
  romance: belief(8, 3),
  sentimentality: belief(12, 3),
};

const obs = (key: string, target: number, weight = 1): AxisObservation =>
  ({ key, target, weight }) as AxisObservation;

const enough = Array.from({ length: 8 }, (_, i) => obs('horrorTolerance', i % 2 ? 90 : 85, 1));

describe('it separates what pulls you in from what kills it', () => {
  const r = buildReveal({}, strong, enough);

  it('names hooks and turnoffs as different lists', () => {
    expect(r.hooks.map((h) => h.key)).toContain('horrorTolerance');
    expect(r.turnoffs.map((t) => t.key)).toContain('romance');
    // A turnoff must never appear as a hook.
    const hookKeys = new Set(r.hooks.map((h) => h.key));
    expect(r.turnoffs.every((t) => !hookKeys.has(t.key))).toBe(true);
  });

  it('speaks in the player’s register, not in our axis names', () => {
    /* "Appetite for fear" is our instrumentation. A reveal written in it is
       describing its own machinery back at somebody. */
    const hook = r.hooks.find((h) => h.key === 'horrorTolerance')!;
    expect(hook.line).not.toBe(hook.label);
    expect(hook.line.toLowerCase()).toContain('scared');
  });

  it('ranks by DISTINCTIVENESS, so two players do not get the same screen', () => {
    /* Ranking by confidence surfaces the axes everybody shares. */
    const mild: TraitProfile = { horrorTolerance: belief(58, 9), darkness: belief(95, 3) };
    const out = buildReveal({}, mild, enough);
    expect(out.hooks[0]!.key).toBe('darkness'); // stronger, despite less evidence
  });

  it('stays short — a reveal is not a list of every axis', () => {
    expect(r.hooks.length).toBeLessThanOrEqual(3);
    expect(r.turnoffs.length).toBeLessThanOrEqual(3);
  });
});

describe('nothing is claimed below its evidence floor', () => {
  it('a rumour is not a belief', () => {
    const rumour: TraitProfile = { horrorTolerance: belief(99, 0.01) };
    const out = buildReveal({}, rumour, enough);
    expect(out.hooks).toHaveLength(0);
  });

  it('a confident but NEUTRAL axis says nothing about anybody', () => {
    const flat: TraitProfile = { horrorTolerance: belief(51, 9), romance: belief(49, 9) };
    const out = buildReveal({}, flat, enough);
    expect(out.hooks).toHaveLength(0);
    expect(out.turnoffs).toHaveLength(0);
  });

  it('A SESSION THAT TAUGHT NOTHING IS REPORTED AS THIN', () => {
    /* The player who answered "haven't seen either" throughout. Inventing a
       hook to fill the slot is the exact failure this screen replaces. */
    expect(buildReveal({}, {}, []).thin).toBe(true);
    expect(buildReveal({}, strong, [obs('horrorTolerance', 90)]).thin).toBe(true);
  });

  it('a real session is not thin', () => {
    expect(buildReveal({}, strong, enough).thin).toBe(false);
  });
});

describe('the interesting part is the contradiction', () => {
  it('reports axes the player argued with themselves about', () => {
    const split = [
      ...enough,
      obs('darkness', 95, 3),
      obs('darkness', 5, 3),
    ];
    const out = buildReveal({}, strong, split);
    expect(out.contradictions.map((c) => c.key)).toContain('darkness');
  });

  it('uses the SAME definition the 1-10 question uses', () => {
    /* Otherwise the game can interrupt you about horror and then tell you it
       was sure about horror all along. */
    const consistent = Array.from({ length: 10 }, () => obs('horrorTolerance', 92, 3));
    expect(buildReveal({}, strong, consistent).contradictions).toHaveLength(0);
  });
});

describe('it distinguishes what it learned from what it already knew', () => {
  it('reports movement, not standing belief', () => {
    const before: TraitProfile = { horrorTolerance: belief(90, 3), romance: belief(8, 3) };
    const after: TraitProfile = { horrorTolerance: belief(92, 3), romance: belief(70, 3) };
    const out = buildReveal(before, after, enough);
    // romance swung 62 points; horror barely moved.
    expect(out.learned[0]!.key).toBe('romance');
    expect(out.learned.map((l) => l.key)).not.toContain('horrorTolerance');
  });

  it('names its own edges rather than claiming everything', () => {
    const edgy: TraitProfile = { horrorTolerance: belief(92, 3), scifi: belief(80, 0.05) };
    const out = buildReveal({}, edgy, enough);
    expect(out.unsure.map((u) => u.key)).toContain('scifi');
    expect(out.hooks.map((h) => h.key)).not.toContain('scifi');
  });
});
