/**
 * TONIGHT — ephemeral intent, and how it reaches ranking without touching
 * identity.
 *
 * A `SessionLean` is produced by `Pick for tonight` and must bend the CURRENT
 * session's recommendations without ever being written to a profile. Two things
 * make that safe, and neither is a comment:
 *
 *   IT IS A DIFFERENT TYPE. `SessionLean` is a plain trait->number map, not a
 *   `TraitProfile` of beliefs, so `profile = lean` does not type-check and the
 *   canonical write path (`applyPermanent`) cannot accept it.
 *
 *   IT IS APPLIED AT READ TIME. Ranking asks for the tilt and adds a bounded
 *   nudge; nothing persists. Clearing the context restores the previous order
 *   exactly, because the permanent input never changed.
 *
 * WHY NOT `decay: 'mood'`. The canonical engine already has a mood concept, and
 * it is the wrong tool here: a mood event is still written into the same
 * `ChannelProfile` and merely fades over fourteen days. That is a flag inside a
 * shared object — correct only while every future caller remembers to set it,
 * and impossible to fully undo when someone clears their night. Tonight never
 * enters the log at all.
 *
 * PURE. No I/O, no clock, no randomness.
 */

import type { TraitKey } from '@/lib/voice/quickdna/traits';
import type { SessionLean } from './evidence';

/**
 * How far tonight may move a title's rank score, either direction.
 *
 * Bounded on the same principle as every other personalization nudge in this
 * codebase (`DIM_NUDGE_MAX`, `PREF_NUDGE_MAX`): the deterministic Watchability
 * score stays authoritative and a mood re-orders within a band rather than
 * replacing the ranking. A night that wants comedy should float comedies up the
 * list, not bury everything else.
 */
export const TONIGHT_NUDGE_MAX = 10;

/** Does this context say anything at all? An empty night must be a no-op. */
export function hasTonightContext(lean: SessionLean | null | undefined): boolean {
  if (!lean) return false;
  for (const k of Object.keys(lean)) {
    const v = lean[k as TraitKey];
    if (typeof v === 'number' && v !== 0) return true;
  }
  return false;
}

/**
 * The nudge for one title, given tonight's tilt and the title's own traits.
 *
 * A dot product, normalised by the tilt's own magnitude so a night with one
 * strong preference and a night with six weak ones move things by comparable
 * amounts — otherwise answering more questions would mechanically produce a
 * more extreme reordering regardless of what was said.
 */
export function tonightNudge(
  lean: SessionLean,
  titleTraits: ReadonlyArray<{ key: TraitKey; strength: number; invert?: boolean }>,
): number {
  let dot = 0;
  let mass = 0;
  for (const key of Object.keys(lean) as TraitKey[]) {
    const tilt = lean[key];
    if (!tilt) continue;
    mass += Math.abs(tilt);
    for (const t of titleTraits) {
      if (t.key !== key) continue;
      dot += tilt * (t.invert ? -t.strength : t.strength);
    }
  }
  if (mass <= 0) return 0;
  const normalized = dot / mass;
  return Math.max(-TONIGHT_NUDGE_MAX, Math.min(TONIGHT_NUDGE_MAX, normalized * TONIGHT_NUDGE_MAX));
}

/**
 * Re-order a scored list for tonight. Pure, and reversible by construction:
 * the input scores are never mutated, so dropping the context and re-ranking
 * reproduces the original order exactly.
 */
export function applyTonight<T extends { score: number; traits: ReadonlyArray<{ key: TraitKey; strength: number; invert?: boolean }> }>(
  items: readonly T[],
  lean: SessionLean | null | undefined,
): Array<T & { tonightNudge: number }> {
  const active = hasTonightContext(lean);
  return items
    .map((i) => ({ ...i, tonightNudge: active ? tonightNudge(lean!, i.traits) : 0 }))
    .sort((a, b) => b.score + b.tonightNudge - (a.score + a.tonightNudge));
}
