import { parseClauses } from '@/lib/interpret/clauses';

/**
 * THE ONE CLAUSE-LAYER ANSWER TO "IS THIS UTTERANCE A REQUEST?"
 *
 * Two front doors sit on the same home screen: the State Your Case box and
 * the search bar. Each carried its own request-vs-lookup vocabulary, and on
 * 2026-08-20 they measurably disagreed about the most ordinary phrasing in
 * the product — "a boxing movie" reached the canonical Ask door from the
 * hero box and an arbitrary top-result TITLE PAGE from the search bar,
 * same words, same screen. Two vocabularies for one question is how that
 * ships; this module is the question's one owner, reading the SAME clause
 * layer /api/ask executes on arrival.
 *
 * Callers layer their own EVIDENCE rules around it — the search destination
 * checks exact catalog titles FIRST ("Show Me a Hero" and "12 Angry Men" are
 * request-shaped strings that are real works; evidence beats phrasing), and
 * the hero box keeps its pinned count/person/find-verb gates. What no caller
 * may do is re-decide the clause question with a private vocabulary.
 *
 * Pure; imports only the dependency-free clause layer, so it is safe in
 * client bundles (both consumers run in the browser too).
 */

/**
 * ASKING WHAT TO WATCH IS A REQUEST, even when the clause layer reads the
 * question form as background ("what boxing movie should I watch?"). Anchored
 * on a first-person watch ask so ordinary uses ("I watched Rocky") never
 * qualify on their own.
 */
export const WATCH_REQUEST =
  /\b(?:what|anything|something|some\s+things?)\b[^.?!]{0,40}?\b(?:should|can|could|do|to)\s+(?:i|we)?\s*watch\b|\bwhat\s+to\s+watch\b/i;

/**
 * A BARE MEDIA NOUN IS A CATEGORY, NOT A REQUEST. "Movies" alone states no
 * constraint — routing it to Ask would run an unconstrained ask, which is
 * the generic feed wearing a different URL.
 */
const BARE_MEDIA_ONLY =
  /^\s*(?:the\s+)?(?:movies?|films?|shows?|series|tv|television|documentar(?:y|ies))\s*[.!?]*\s*$/i;

/** True when the clause layer reads a request in the utterance. */
export function clauseLayerSaysRequest(raw: string): boolean {
  const text = (raw ?? '').trim();
  if (!text || BARE_MEDIA_ONLY.test(text)) return false;
  if (WATCH_REQUEST.test(text)) return true;
  return parseClauses(text).some((c) => c.role === 'request');
}
