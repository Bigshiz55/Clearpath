/**
 * THE ENTITY BOUNDARY — language spent once cannot be spent again.
 *
 * Two readers used to consume the same words with neither aware of the other.
 * Person resolution read "Stallone" and produced a cast id; subject detection
 * then read the SAME token and produced a strict content subject, so the query
 * demanded films that ARE ABOUT Stallone as well as films he is IN. Nothing is
 * about an actor's surname, so every legitimate candidate was rejected on
 * centrality and the ask returned nothing.
 *
 * The fix is not a longer stop-word list. `NON_SUBJECT` would need every
 * performer ever asked for by surname and would still miss the next one. What
 * was missing is a record of what has already been claimed:
 *
 *   Language already consumed as a RESOLVED ENTITY may not be reinterpreted
 *   as a generic content subject.
 *
 * WHY MASK RATHER THAN SUPPRESS. Disabling subject detection whenever a cast id
 * exists is the other easy wrong answer: "a Tom Hanks courtroom movie" means
 * person Hanks AND subject courtroom, and suppression throws the courtroom away.
 * Only the person's OWN span is spent. The rest of the sentence still speaks.
 *
 * EVIDENCE, NOT GUESSWORK. The spans come from whatever already resolved the
 * entity — TMDB confirmed the name — so this module never decides who is a
 * person. It has no vocabulary of its own and cannot acquire one; it is a set
 * operation over spans somebody else earned. That is also why the canonical
 * interpreter's `people[].span` can feed it later without a rewrite: it is the
 * same input from a better extractor, not a different mechanism.
 *
 * PURE. No I/O, no clock, no environment.
 */

/** Name particles are too short to remove safely — dropping "de" or "la" as a
 *  whole word would eat ordinary language for no benefit, since a two-letter
 *  token can never be the content subject the walk-back is looking for. */
const MIN_TOKEN = 3;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Remove the tokens of already-consumed spans from `text`, leaving the rest
 * intact and its word order undisturbed.
 *
 * Token-wise rather than whole-phrase, because the resolved name and the spoken
 * one rarely match: TMDB answers "Sylvester Stallone" to an utterance that only
 * ever said "Stallone". Matching the full string would consume nothing in
 * exactly the case this exists for.
 *
 * Whole words only — so a resolved "Hunt" cannot hollow out "manhunt".
 */
export function maskConsumedSpans(text: string, spans: readonly string[] | undefined | null): string {
  if (!text || !spans || spans.length === 0) return text;

  const tokens = new Set<string>();
  for (const span of spans) {
    for (const t of String(span ?? '')
      .toLowerCase()
      .split(/[^a-z0-9']+/)) {
      if (t.length >= MIN_TOKEN) tokens.add(t);
    }
  }
  if (tokens.size === 0) return text;

  const re = new RegExp(`\\b(?:${[...tokens].map(escapeRe).join('|')})\\b`, 'gi');
  // A space, never an empty string: removing the token must not fuse its
  // neighbours into a word that was never said.
  return text.replace(re, ' ');
}
