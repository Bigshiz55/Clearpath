/**
 * WHY THE SAME FILMS KEEP COMING BACK.
 *
 * The no-repeat invariant was only ever session-scoped. `ShowdownState.seenTitleIds`
 * is initialised empty on every run, and `StoredDna.usedTitleIds` — the field
 * that was supposed to carry exposure between runs — was declared, initialised
 * to `[]`, and never written or read by anything. So a player's second session
 * was dealt from the full catalogue again, and because the planner is
 * deterministic and both runs open from a similar profile, it dealt them many of
 * the SAME pairs. Not a coincidence, and not a tuning problem: the memory did
 * not exist.
 *
 * THE FIX IS NOT "SUPPRESS EVERYTHING EVER SEEN". A 113-title catalogue and 40
 * exposures per session means that policy runs the pool dry during the third
 * session, and an exhausted pool is a worse failure than a repeat: the planner
 * returns null, the game ends early, and the player is told nothing about why.
 * Total suppression is the version of this that looks correct in a unit test and
 * breaks in the third week.
 *
 * So exposure is a QUEUE, not a set. The most recent exposures are suppressed;
 * the oldest are released once suppression would leave too little to play with.
 * A returning player never sees last week's titles, always has a full catalogue
 * of choices available to the planner, and eventually meets an old title again
 * — which is correct, because taste changes and re-asking after months is
 * information rather than repetition.
 *
 * PURE. No I/O, no clock, no randomness.
 */

/**
 * How much of the pool must stay dealable, whatever the history.
 *
 * A session needs `2 x TARGET_DECISIONS` distinct titles just to finish, so a
 * reserve at that number would leave the planner with exactly one legal
 * assignment and no room to choose an informative pair — the game would
 * complete and teach nothing. Half the catalogue leaves the argmax a real
 * search space while still retiring everything a recent session used.
 */
export const EXPOSURE_RESERVE_RATIO = 0.5;

/** Never suppress so hard that a session cannot be dealt at all. */
export const MIN_AVAILABLE = 2;

/**
 * The exposures still worth suppressing, given how big the pool is.
 *
 * `history` is oldest-first. Returns a subset of it — the newest exposures that
 * fit under the reserve — so the caller can hand it straight to the planner as
 * an exclusion list.
 */
export function suppressedTitles(
  history: readonly string[],
  poolSize: number,
): string[] {
  const unique: string[] = [];
  const seen = new Set<string>();
  // Oldest-first, deduplicated by FIRST appearance being dropped in favour of
  // the most recent one: a title seen twice is as fresh as its latest showing.
  for (let i = history.length - 1; i >= 0; i--) {
    const id = history[i]!;
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(id); // newest-first
  }
  const available = Math.max(MIN_AVAILABLE, Math.floor(poolSize * EXPOSURE_RESERVE_RATIO));
  const budget = Math.max(0, poolSize - available);
  return unique.slice(0, budget);
}

/**
 * Fold a finished session's exposures into the durable history.
 *
 * Oldest-first and append-only, so position in the list IS recency and nothing
 * needs a timestamp. A title seen again moves to the end rather than appearing
 * twice, because "when did they last meet this" is the only question the
 * history is ever asked.
 */
export function recordExposure(
  history: readonly string[],
  shown: readonly string[],
): string[] {
  const fresh = new Set(shown);
  return [...history.filter((id) => !fresh.has(id)), ...new Set(shown)];
}

/** History older than this is dropped — it can never be suppressed again anyway. */
export const HISTORY_CAP = 400;

export function trimHistory(history: readonly string[]): string[] {
  return history.length <= HISTORY_CAP ? [...history] : history.slice(history.length - HISTORY_CAP);
}
