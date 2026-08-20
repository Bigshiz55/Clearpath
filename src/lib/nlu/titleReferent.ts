/**
 * WHICH WORK DOES A FRAMED TITLE NAME?
 *
 * "the Taken movie" has two readings, and the resolver used to see only one.
 * Read literally, the name is "the Taken" — an EXACT match for THE TAKEN
 * (2024), a film with an audience in the dozens. Read as a frame, the article
 * and the medium noun are scaffolding around the name "Taken" — the 2008 film
 * with an audience in the tens of thousands. `titleMatchTier` ranks exact
 * above article-stripped-alt, so the scaffolding reading won on a technicality
 * and the deployment answered "the Taken movie" with THE TAKEN (2024).
 *
 * THE RULE IS CONFIDENCE IN THE REFERENT, NOT "LARGEST AUDIENCE WINS".
 *
 *   - No frame in the sentence → nothing here applies. A user who types
 *     "The Taken" bare typed the article as part of the NAME, and the exact
 *     match stands however obscure the work is. Intentionally obscure exact
 *     queries must keep winning.
 *   - A frame exists but the literal reading is itself a well-known work →
 *     the literal stands. "Scary Movie" parses as frame+["Scary"], and the
 *     literal is famous, so no dominance exists and nothing moves.
 *   - A frame exists, both readings resolve, and the frame reading's best
 *     candidate is overwhelmingly better known (DOMINANCE× the literal's
 *     cumulative audience) → the user almost certainly meant the frame
 *     reading, and it wins.
 *   - A frame exists and the literal reading resolves to NOTHING exact →
 *     the frame reading is the only reading, and it wins outright
 *     ("the Whiplash movie": no film is called "the Whiplash").
 *
 * Cumulative audience (vote count), not TMDB's decaying weekly popularity —
 * the same judgement `critic/clarify.ts` already encodes for clarification
 * order: "best-known means CUMULATIVE". Popularity measures this week;
 * a bare name refers to the work people have actually had opinions about.
 *
 * PURE. No I/O — the caller supplies both candidate pools.
 */

export interface ReferentCandidate {
  title: string;
  mediaType: 'movie' | 'tv';
  /** Cumulative audience — TMDB vote_count. Null when the payload lacks it. */
  voteCount?: number | null;
}

/**
 * How much better known the frame reading must be to overrule a literal exact
 * match. Deliberately large: this is "the audience is not comparable — one of
 * these is what people mean by the name", never a taste-based nudge. Below it,
 * the words the user actually typed stand.
 */
export const FRAME_DOMINANCE = 20;

/**
 * Decide between the literal reading's best exact candidate and the frame
 * reading's. Returns which reading names the user's referent.
 */
export function chooseFramedReading(
  literalBest: ReferentCandidate | null,
  framedBest: ReferentCandidate | null,
): 'literal' | 'framed' {
  if (!framedBest) return 'literal';
  if (!literalBest) return 'framed';
  const lit = Math.max(0, literalBest.voteCount ?? 0);
  const fra = Math.max(0, framedBest.voteCount ?? 0);
  /* Evidence must SEPARATE them. With no audience data on either side there is
     no dominance to claim, and the literal words stand. */
  if (fra > FRAME_DOMINANCE * Math.max(1, lit)) return 'framed';
  return 'literal';
}
