/**
 * TONIGHT IS NOT TASTE.
 *
 * "I want something light tonight" and "I dislike heavy films" are different
 * claims, and a recommender that stores the first as the second gets worse every
 * time it is used — a single tired Tuesday becomes a permanent belief about who
 * someone is.
 *
 * So the session channel is EPHEMERAL BY CONSTRUCTION, not by discipline:
 *
 *   - A `SessionIntent` produces a `SessionLean`, and a `SessionLean` is a
 *     `Record<axis, number>` of ranking nudges. There is no function in this
 *     module that returns a `PreferenceEvent`, and nothing here imports the
 *     event types, so there is no path — even a buggy one — from a mood answer
 *     into the permanent log.
 *   - The lean is applied at RANK TIME to a copy of the profile's preferences.
 *     It is never accumulated, never persisted, and dies with the request.
 *
 * The canonical engine does have a `mood` decay channel, which is the right home
 * for "I bounced off this because I wasn't in the mood" — a reaction to a real
 * title. That is not what this is. This is a stated intent for the next hour,
 * attached to no title, and the correct amount of it to write down is none.
 *
 * PURE. No I/O, no clock, no randomness.
 */

import { DIMENSION_KEYS } from '@/lib/scoring/dimensions';

/** Ranking nudges for this session only. Axis key → signed pull, -1..1. */
export type SessionLean = Readonly<Record<string, number>>;

export interface SessionIntent {
  id: string;
  label: string;
  /** Axis pulls. Negative pulls toward the axis "low" pole, positive to "high". */
  lean: SessionLean;
}

/**
 * The openers. Each names axes the canonical model actually has, so a mood can
 * bend the ranking without inventing a vocabulary of its own.
 */
export const INTENTS: readonly SessionIntent[] = [
  { id: 'easy', label: 'Something easy', lean: { complexity: -0.8, attention: -0.7, darkness: -0.4 } },
  { id: 'gripped', label: 'Grip me', lean: { suspense: 0.9, pacing: 0.5, stakes: 0.4 } },
  { id: 'laugh', label: 'Make me laugh', lean: { humor: 0.9, darkness: -0.5, warmth: 0.4 } },
  { id: 'moved', label: 'Move me', lean: { emotion: 0.9, character: 0.6, warmth: 0.3 } },
  { id: 'think', label: 'Make me think', lean: { complexity: 0.9, attention: 0.6, morality: 0.4 } },
  { id: 'comfort', label: 'Something comforting', lean: { warmth: 0.9, darkness: -0.7, violence: -0.6 } },
] as const;

/** How far a full-strength lean may move an axis preference, in 0..100 points. */
export const LEAN_RANGE = 30;

export function intentById(id: string): SessionIntent | undefined {
  return INTENTS.find((i) => i.id === id);
}

/**
 * Merge intents into one lean. Later intents do not overwrite earlier ones on a
 * shared axis; the pulls sum and clamp, so "easy" plus "comforting" is more
 * strongly light than either alone rather than whichever was chosen last.
 */
export function mergeLeans(leans: readonly SessionLean[]): SessionLean {
  const out: Record<string, number> = {};
  for (const lean of leans) {
    for (const k of DIMENSION_KEYS) {
      const v = lean[k];
      if (typeof v !== 'number' || v === 0) continue;
      out[k] = Math.max(-1, Math.min(1, (out[k] ?? 0) + v));
    }
  }
  return out;
}

/**
 * Tonight's preference on one axis: the permanent belief, bent.
 *
 * The permanent value is an argument and the result is a return value — this
 * function cannot mutate a profile even by accident, which is the property that
 * makes the separation real rather than a convention.
 */
export function tonightPreference(basePref: number, lean: SessionLean, key: string): number {
  const pull = lean[key];
  if (typeof pull !== 'number' || pull === 0) return basePref;
  return Math.max(0, Math.min(100, basePref + pull * LEAN_RANGE));
}

/**
 * A copy of `pref` with tonight applied. The input is never touched.
 */
export function applyLean(
  pref: Readonly<Record<string, number>>,
  lean: SessionLean,
): Record<string, number> {
  const out: Record<string, number> = { ...pref };
  for (const k of DIMENSION_KEYS) {
    const base = typeof out[k] === 'number' ? out[k]! : 50;
    out[k] = tonightPreference(base, lean, k);
  }
  return out;
}

/** True when this lean would change nothing, so callers can skip the work. */
export function isNeutral(lean: SessionLean): boolean {
  return DIMENSION_KEYS.every((k) => !lean[k]);
}
