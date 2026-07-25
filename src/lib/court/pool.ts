/**
 * COURT CANDIDATE POOL (pure, no I/O).
 *
 * Exactly SIX active candidates, with SIX held in reserve — twelve maximum for
 * a standard session. When a title is removed (veto or "seen it") the next best
 * reserve is promoted immediately, so replacement feels instant to the room.
 *
 * Variety is enforced structurally rather than hoped for: the selector will not
 * take a second candidate that duplicates an already-chosen genre/era/tone
 * signature while a more varied option remains. That is what stops six
 * near-identical thrillers from filling the tray.
 */

export const ACTIVE_SLOTS = 6;
export const MAX_CANDIDATES = 12;

export interface PoolCandidate {
  key: string; // "movie-123"
  title: string;
  /** Primary genre — the main variety axis. */
  genre: string;
  /** Release decade, e.g. 2020. Second variety axis. */
  decade: number;
  /** Tone descriptor (light / dark / tense …). Third variety axis. */
  tone: string;
  /** Popularity 0–100; used only to break ties, never to override fit. */
  popularity: number;
  /** Group fit 0–100 from the scoring model. */
  fit: number;
  /** Services the room can actually watch it on. Empty = not watchable. */
  availableOn: string[];
  /** Why this title is in THIS court — shown on the card, never generic. */
  reason: string;
}

export interface PoolState {
  active: PoolCandidate[];
  reserve: PoolCandidate[];
  /** Everything removed, with the reason, so nothing is silently re-offered. */
  removed: { key: string; reason: RemovalReason }[];
}

export type RemovalReason = 'veto' | 'seen_it';

/** A candidate's variety signature. Two candidates sharing one are "similar". */
const signature = (c: PoolCandidate) => `${c.genre}|${c.decade}|${c.tone}`;

/**
 * Choose up to `count` candidates that are varied. Greedy: always take the
 * best-fitting candidate whose signature is unused; only once every remaining
 * option duplicates an existing signature do we allow a repeat (better to fill
 * the tray than to show four cards).
 */
export function selectVaried(pool: PoolCandidate[], count: number): PoolCandidate[] {
  const sorted = [...pool].sort((a, b) => b.fit - a.fit || b.popularity - a.popularity);
  const chosen: PoolCandidate[] = [];
  const usedSig = new Set<string>();
  const usedGenre = new Set<string>();

  // Pass 1 — fully distinct signature AND genre.
  for (const c of sorted) {
    if (chosen.length >= count) break;
    if (usedSig.has(signature(c)) || usedGenre.has(c.genre)) continue;
    chosen.push(c);
    usedSig.add(signature(c));
    usedGenre.add(c.genre);
  }
  // Pass 2 — allow a repeated genre, still avoiding an identical signature.
  for (const c of sorted) {
    if (chosen.length >= count) break;
    if (chosen.some((x) => x.key === c.key) || usedSig.has(signature(c))) continue;
    chosen.push(c);
    usedSig.add(signature(c));
  }
  // Pass 3 — fill remaining slots with whatever is left.
  for (const c of sorted) {
    if (chosen.length >= count) break;
    if (chosen.some((x) => x.key === c.key)) continue;
    chosen.push(c);
  }
  return chosen;
}

/**
 * Build the opening pool. Only candidates that satisfy the hard gates reach
 * here — `eligible` must already be filtered by the caller, because a title
 * that breaks a constraint must never be a candidate at any rank.
 */
export function buildPool(eligible: PoolCandidate[]): PoolState {
  const picked = selectVaried(eligible, MAX_CANDIDATES);
  return {
    active: picked.slice(0, ACTIVE_SLOTS),
    reserve: picked.slice(ACTIVE_SLOTS, MAX_CANDIDATES),
    removed: [],
  };
}

export interface ReplacementResult {
  state: PoolState;
  /** The candidate promoted into the free slot, if any remained. */
  promoted: PoolCandidate | null;
  /** True when the reserve is spent and the tray is now short. */
  reserveExhausted: boolean;
}

/**
 * Remove a candidate and promote the best reserve into its exact position, so
 * the tray does not reshuffle under the user's finger. Idempotent: removing a
 * key twice is a no-op, which is what makes simultaneous vetoes safe.
 */
export function replaceCandidate(state: PoolState, key: string, reason: RemovalReason): ReplacementResult {
  const index = state.active.findIndex((c) => c.key === key);
  if (index === -1) {
    return { state, promoted: null, reserveExhausted: state.reserve.length === 0 };
  }
  const promoted = state.reserve[0] ?? null;
  const active = [...state.active];
  if (promoted) active.splice(index, 1, promoted);
  else active.splice(index, 1);

  return {
    state: {
      active,
      reserve: state.reserve.slice(promoted ? 1 : 0),
      removed: [...state.removed, { key, reason }],
    },
    promoted,
    reserveExhausted: state.reserve.length <= 1,
  };
}

/** Total candidates this session has ever shown — must never exceed 12. */
export function totalShown(state: PoolState): number {
  return state.active.length + state.reserve.length + state.removed.length;
}

/** A candidate is watchable when the room has at least one way to watch it. */
export function isWatchable(c: PoolCandidate): boolean {
  return c.availableOn.length > 0;
}
