/**
 * VERD1CT RUSH — what survives between plays.
 *
 * The game is meant to be picked up again, repeatedly, and every time it must
 * ADD to what we know rather than start over. Two things therefore outlive a
 * session:
 *
 *   THE PROFILE — so a second play begins from what the first one learned and
 *   spends its rounds on what is still open, instead of re-asking settled
 *   questions.
 *
 *   WHAT HAS BEEN SEEN — so nothing is ever put to someone twice. Being shown
 *   the same six options on a second run is the single clearest signal that a
 *   quiz is not really listening.
 *
 * Deliberately localStorage and not the database: it is a local convenience,
 * it must work for a guest who never signs in, and losing it costs one replay
 * rather than any real data. It degrades to "fresh game" on any failure —
 * private mode, quota, a shape from an older build.
 *
 * The reading and writing are the only I/O here; the merge is pure and tested.
 */

import type { TraitProfile } from '@/lib/voice/quickdna/traits';

const KEY = 'watchverdict:verdictdna:v1';

export interface StoredDna {
  profile: TraitProfile;
  /** Options already put to this person, across every play. */
  usedChoiceIds: string[];
  /** Titles already reacted to, across every play. */
  usedTitleIds: string[];
  /** How many games have been completed. Drives the returning-player copy. */
  plays: number;
  /** Decisions accumulated across every play. */
  decisions: number;
}

export const EMPTY_DNA: StoredDna = {
  profile: {},
  usedChoiceIds: [],
  usedTitleIds: [],
  plays: 0,
  decisions: 0,
};

/** Defensive: anything unrecognised reads as "no DNA yet", never as a crash. */
export function parseDna(raw: string | null): StoredDna {
  if (!raw) return EMPTY_DNA;
  try {
    const v = JSON.parse(raw) as Partial<StoredDna>;
    if (!v || typeof v !== 'object' || typeof v.profile !== 'object' || v.profile === null) {
      return EMPTY_DNA;
    }
    return {
      profile: v.profile as TraitProfile,
      usedChoiceIds: Array.isArray(v.usedChoiceIds) ? v.usedChoiceIds.filter((x) => typeof x === 'string') : [],
      usedTitleIds: Array.isArray(v.usedTitleIds) ? v.usedTitleIds.filter((x) => typeof x === 'string') : [],
      plays: Number.isFinite(v.plays) ? Number(v.plays) : 0,
      decisions: Number.isFinite(v.decisions) ? Number(v.decisions) : 0,
    };
  } catch {
    return EMPTY_DNA;
  }
}

/**
 * Fold a finished (or abandoned) game into the stored DNA.
 *
 * PURE, and additive on every axis: the profile is replaced by the newer one
 * (it already contains everything the old one knew — the trait engine
 * accumulates rather than overwrites), while the seen-sets and the counters
 * only ever grow. A game that ended early still contributes what it learned.
 */
export function mergeDna(
  prior: StoredDna,
  game: { profile: TraitProfile; usedChoiceIds: string[]; usedTitleIds: string[]; decisions: number },
  completed: boolean,
): StoredDna {
  const union = (a: readonly string[], b: readonly string[]) => [...new Set([...a, ...b])];
  return {
    profile: game.profile,
    usedChoiceIds: union(prior.usedChoiceIds, game.usedChoiceIds),
    usedTitleIds: union(prior.usedTitleIds, game.usedTitleIds),
    plays: prior.plays + (completed ? 1 : 0),
    decisions: prior.decisions + game.decisions,
  };
}

export function loadDna(): StoredDna {
  if (typeof window === 'undefined') return EMPTY_DNA;
  try {
    return parseDna(window.localStorage.getItem(KEY));
  } catch {
    return EMPTY_DNA;
  }
}

export function saveDna(dna: StoredDna): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(dna));
  } catch {
    /* private mode or quota — the next play simply starts fresh */
  }
}
