/**
 * WHAT THE SESSION ACTUALLY CHANGED — before and after, in the real ranker.
 *
 * THE FAKE PAYOFF THIS REPLACES. `ShowdownResults` scored the 113 diagnostic
 * titles with Showdown's own private model and called them recommendations. It
 * could only ever return films the player had just been quizzed on, ranked by a
 * scoring rule nothing else in the product uses — a closed loop wearing a
 * results screen. The diagnostic pool is an INSTRUMENT. It is not the catalogue.
 *
 * So this runs the same `preferenceNudge` the production ranker calls, over a
 * candidate set that has nothing to do with the diagnostic pool, twice: once
 * against the DNA the player walked in with and once against the DNA they
 * walked out with. The difference between those two orderings IS the payoff,
 * and it is a measurement rather than a claim.
 *
 * IT IS ALLOWED TO SAY NOTHING HAPPENED. A short session that did not cross the
 * ranker's confidence floor produces an identical order, and the honest screen
 * for that says so — see `movement`. A payoff that always finds something to
 * celebrate is the same lie as a percentage that never moves.
 *
 * PURE. No I/O — candidates and both DNA states are supplied.
 */

import { preferenceNudge, type RankTitle } from '@/lib/preference/rank';
import type { DnaState } from '@/lib/preference/types';

export interface PayoffCandidate extends RankTitle {
  id: string;
  title: string;
  year: number | null;
  /** The deterministic Watchability score. Never modified here. */
  objective: number;
}

export interface RankedCandidate extends PayoffCandidate {
  nudge: number;
  score: number;
  /** Position before the session, 1-based. */
  was: number;
  /** Position after, 1-based. */
  now: number;
  /** Positive = climbed. */
  moved: number;
}

export interface Payoff {
  before: RankedCandidate[];
  after: RankedCandidate[];
  /** How many places the whole list shifted. 0 means the session changed nothing. */
  movement: number;
  /** Candidates that entered the visible top N because of this session. */
  climbed: RankedCandidate[];
}

function order(candidates: readonly PayoffCandidate[], dna: DnaState) {
  return candidates
    .map((c) => {
      const { nudge } = preferenceNudge({ dims: c.dims, genres: c.genres }, dna, { corrections: {} });
      return { ...c, nudge, score: c.objective + nudge };
    })
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
}

/**
 * Rank one candidate set against both DNA states and describe the difference.
 *
 * `top` is how much of the list the screen will show — movement is counted over
 * the WHOLE set, but `climbed` is deliberately restricted to titles that entered
 * what the player can actually see. A film rising from 90th to 60th is real and
 * is not a payoff anybody can feel.
 */
export function computePayoff(
  candidates: readonly PayoffCandidate[],
  beforeDna: DnaState,
  afterDna: DnaState,
  top = 5,
): Payoff {
  const beforeOrder = order(candidates, beforeDna);
  const afterOrder = order(candidates, afterDna);
  const wasAt = new Map(beforeOrder.map((c, i) => [c.id, i + 1]));

  const decorate = (list: ReturnType<typeof order>): RankedCandidate[] =>
    list.map((c, i) => {
      const was = wasAt.get(c.id) ?? i + 1;
      return { ...c, was, now: i + 1, moved: was - (i + 1) };
    });

  const after = decorate(afterOrder);
  const before = decorate(beforeOrder);
  const movement = after.reduce((sum, c) => sum + Math.abs(c.moved), 0);
  const climbed = after
    .slice(0, top)
    .filter((c) => c.moved > 0 && c.was > top)
    .sort((a, b) => b.moved - a.moved);

  return { before, after, movement, climbed };
}
