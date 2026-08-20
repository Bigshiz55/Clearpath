import { parseClauses, statesPreference } from '@/lib/interpret/clauses';

/**
 * WHAT, IN THIS UTTERANCE, IS EVIDENCE ABOUT THE USER'S DURABLE TASTE?
 *
 * `/api/build-case` feeds free text to an LLM that extracts axis targets and
 * loved/avoided titles, then WRITES them to the user's permanent profile. The
 * production defect this module exists to end: that extraction ran on the
 * WHOLE utterance before anyone asked what the utterance was, so the request
 * "a boxing movie" was read as taste, the LLM returned
 * likedTitles:["a boxing movie"], and a real title got rated 9/10 on the
 * user's behalf. A one-turn request is not a preference; nouns inside it are
 * not loves.
 *
 * The clause layer is the one owner of that distinction — the same reading
 * `/api/ask` executes — so this module only SELECTS from it:
 *
 * - **Routed request** (`routedRequest: true` — the utterance is being
 *   answered): only clauses that state a durable preference may write.
 *   `statesPreference` is the standing-preference vocabulary ("I love…",
 *   "I can't stand…"); the evaluative past forms (loved/liked/enjoyed/
 *   hated/disliked) carry a reaction to something named, which is the one
 *   other legitimate seed. Everything else — the request itself, background,
 *   familiarity ("I watched X yesterday") — is NOT taste and writes nothing.
 * - **Statement** (`routedRequest: false` — nothing routed, the box is being
 *   used to describe taste): the whole text remains evidence, as the box
 *   promises — EXCEPT companion clauses. "My wife likes comedies" is her
 *   file, not the user's; attributing it is exactly the cross-write the
 *   taste architecture forbids.
 *
 * Pure; returns the text the extractor may read, '' when nothing qualifies.
 */
const EVALUATIVE_REACTION = /\b(?:loved|liked|enjoyed|hated|disliked|adored)\b/i;

/**
 * A DURABLE PREFERENCE WITH THE PRONOUN ELIDED. "gritty dramas, hate cheesy
 * rom-coms" states a standing hate as plainly as "I hate cheesy rom-coms" —
 * people drop the "I" in list-style self-description constantly, and
 * `statesPreference` (correctly, for its own callers) requires the subject.
 * Reviewer-caught on #94: without this, a descriptor-list utterance that
 * routes as a request silently lost its durable half. Anchored to the CLAUSE
 * START so a preference verb buried mid-request ("movies I would love") can
 * never qualify a request clause's text through this door.
 */
const SUBJECTLESS_PREFERENCE = /^\s*(?:and\s+|but\s+)?(?:really\s+|absolutely\s+|just\s+)?(?:loves?|hates?|adores?|enjoys?|prefers?|dislikes?|avoid|can'?t\s+stand)\b/i;

/**
 * A reaction to a NAMED work, wherever it sits. "Give me feel-good comedies —
 * loved Ted Lasso" keeps the reaction inside the request clause (the splitter
 * does not cut at a dash), so a clause-role filter alone would drop the one
 * genuinely taste-bearing thing in the sentence. The span shape — evaluative
 * past verb + a Capitalised name — cannot capture a request's own nouns
 * ("a boxing movie" has no capital to offer), so this recovers the seed
 * without ever letting the request back in.
 */
const REACTION_SPAN = /\b(loved|liked|enjoyed|hated|disliked|adored)\s+((?:[A-Z][\w'’-]*)(?:\s+(?:of|the|and|a)?\s*[A-Z0-9][\w'’-]*){0,4})/g;

export function tasteEvidenceText(raw: string, opts: { routedRequest: boolean }): string {
  const text = raw ?? '';
  const clauses = parseClauses(text);
  if (!opts.routedRequest) {
    return clauses
      .filter((c) => c.role !== 'companion')
      .map((c) => c.text.trim())
      .filter(Boolean)
      .join('. ');
  }
  const kept = clauses
    .filter(
      (c) =>
        (c.role === 'taste' || c.role === 'background') &&
        (statesPreference(c.text) || SUBJECTLESS_PREFERENCE.test(c.text) || EVALUATIVE_REACTION.test(c.text)),
    )
    .map((c) => c.text.trim());
  for (const m of text.matchAll(REACTION_SPAN)) {
    const span = m[0].trim();
    if (!kept.some((k) => k.includes(span))) kept.push(span);
  }
  return kept.filter(Boolean).join('. ');
}
