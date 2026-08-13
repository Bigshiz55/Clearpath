/**
 * WHAT IS THIS CLAUSE FOR?
 *
 * The architectural defect this file fixes is a DEFAULT, not a missing rule.
 *
 * The existing parser starts from "every word is a search term" and subtracts a
 * hand-maintained list of ~60 filler words (`NON_NAME` in `askParse.ts`).
 * Anything not on the list survives into the query. "burrito" is not on the
 * list, so it survives. Adding "burrito" to the list fixes one sentence and
 * nothing else, and the list can never be finished — which is precisely why a
 * word list is the wrong instrument.
 *
 * So the default is inverted. A clause contributes NOTHING unless it exhibits
 * the structure of a role. Relevance is earned by grammatical function, never by
 * vocabulary:
 *
 *   REQUEST   an imperative or desire aimed at being shown something
 *             ("give me", "I'm looking for", "what should I watch", a bare
 *             count + media noun, a leading "something")
 *   TASTE     a reaction verb pointed at a named work ("I liked X", "I hated X")
 *   COMPANION someone else's constraint ("my wife hates horror")
 *   CONSTRAINT a standalone filter ("under two hours", "on Netflix", "no gore")
 *   BACKGROUND everything else — DISCARDED
 *
 * "Had a beef burrito for dinner" has no request signal, no reaction aimed at a
 * work, no filter. It is background — and would be background if it were about
 * sushi, traffic, or a dog, because nothing about the food is what excluded it.
 * That is the generalisation the word list could never reach.
 *
 * THE COST OF THIS DESIGN, STATED HONESTLY: a clause whose role is expressed in
 * a way these patterns do not recognise is dropped rather than misread. For a
 * recommendation engine that is the right failure — a dropped modifier returns
 * a broader answer, while an invented one returns a wrong answer with
 * confidence. It also degrades toward "ask for clarification", which the
 * product already supports.
 *
 * PURE. No I/O, no clock, no randomness.
 */

export type ClauseRole = 'request' | 'taste' | 'companion' | 'constraint' | 'background';

export interface Clause {
  text: string;
  role: ClauseRole;
  /** Position in the original utterance, so later clauses can win ties. */
  index: number;
}

/**
 * Split on sentence and clause boundaries.
 *
 * Semicolons and commas count because people write one long run-on far more
 * often than they write tidy sentences — "Had a burrito, I liked Rocky, find me
 * a boxing movie" is three clauses and one sentence. Splitting too eagerly is
 * safe here: a request clause is identified by its own signals, so a request
 * cut in half still shows them in one of the halves.
 */
export function splitClauses(raw: string): string[] {
  return (raw ?? '')
    .split(/(?<=[.!?])\s+|[;\n]+|,\s+(?=(?:and\s+)?[a-z0-9"'“]|[A-Z])/u)
    .map((s) => s.trim().replace(/^(?:and|but|so|anyway|also|then|well|ok(?:ay)?)\b[\s,]*/i, '').trim())
    .filter((s) => s.length > 0);
}

/**
 * AN IMPERATIVE, OR A STATED DESIRE TO BE SHOWN SOMETHING.
 *
 * An imperative verb must either LEAD its clause or take an explicit pronoun
 * object. Allowing a bare verb anywhere in the sentence is not a small
 * looseness: "show", "get" and "put on" are extremely common nouns and
 * particles, so `a horror SHOW`, `I GET it` and `PUT ON a jumper` all read as
 * orders. That misread is worse than missing a request, because it promotes a
 * background clause to the thing being executed and hands its genre words to
 * the engine — which is the precise leak this whole layer exists to stop.
 */
const REQUEST_VERB =
  /^\s*(?:please\s+|just\s+|maybe\s+|ok(?:ay)?,?\s+)*(?:find|show|give|get|recommend|suggest|pull up|put on|queue up|play|hit me with)\b|\b(?:find|show|give|recommend|suggest|get)\s+(?:me|us)\b|\bi(?:'|’)?m looking for\b|\blooking for\b|\bi want\b|\bi'?d like\b|\bi would like\b|\bi wanna\b|\bwhat should (?:i|we) watch\b|\bwhat to watch\b|\bin the mood for\b|\bfeel like watching\b|\bsurprise me\b|\bhelp me (?:find|pick|choose)\b|\bany (?:good|recommendations?)\b/i;

/** The kind of thing one asks to be shown several of. */
const MEDIA_NOUN =
  /\b(?:movies?|films?|shows?|series|documentar(?:y|ies)|comed(?:y|ies)|thrillers?|dramas?|myster(?:y|ies)|flicks?|picks?|titles?|episodes?|something to watch)\b/i;

/** A bare count leading a media noun: "3 Stallone movies". */
const COUNT_LED = /^\s*(?:\d+|a couple of|a few|one|two|three|four|five|six|seven|eight|nine|ten)\b/i;

/** "Something funny", "anything but horror" — a description standing in for a request. */
const LEADING_SOMETHING = /^\s*(?:something|anything)\b/i;

/** A reaction aimed at a work. The OBJECT matters, not the verb alone. */
const REACTION =
  /\b(?:i|we)\s+(?:really\s+|kind of\s+|sort of\s+)?(?:loved|liked|enjoyed|hated|disliked|couldn'?t stand|didn'?t (?:like|enjoy)|am obsessed with|was obsessed with)\b/i;

/** Familiarity without a verdict: "I've seen Creed", "I already watched Rocky". */
const FAMILIARITY =
  /\b(?:i|we)(?:'|’)?(?:ve|\s+have)?\s+(?:already\s+)?(?:seen|watched)\b/i;

/** Someone else in the room, and what they will not sit through. */
const COMPANION =
  /\b(?:my|our)\s+(?:wife|husband|partner|girlfriend|boyfriend|kid|kids|son|daughter|mum|mom|dad|roommate|friend|family)\b/i;

/** A standalone filter that is a request even with no verb. */
const CONSTRAINT =
  /\b(?:under|over|less than|more than|no longer than|shorter than|at least|between)\s+(?:\d+|an?|one|two|three)\b|\b\d+\s*(?:minutes?|mins?|hours?|hrs?)\b|\bon (?:netflix|hulu|max|hbo|disney|prime|paramount|peacock|apple)\b|\b(?:no|not|without|except|avoid)\s+\w+/i;

/**
 * A clause's role, decided by what it exhibits.
 *
 * ORDER MATTERS, and it encodes a priority the product cares about. A companion
 * clause is checked before a taste clause because "my wife hates horror" also
 * matches a reaction pattern, and reading it as the USER's dislike attributes
 * someone else's veto to them permanently. A request is checked first because
 * "I want something like Heat" is a request that happens to name a work, and it
 * should be executed rather than filed as taste history.
 */
export function classifyClause(text: string): ClauseRole {
  const t = text.trim();
  if (!t) return 'background';

  if (COMPANION.test(t)) return 'companion';

  const media = MEDIA_NOUN.test(t);
  if (REQUEST_VERB.test(t)) return 'request';
  if (LEADING_SOMETHING.test(t)) return 'request';
  // A count only makes a request when it is counting the thing being asked for.
  // "I watched 3 movies yesterday" is past tense about the user, not an order.
  if (COUNT_LED.test(t) && media && !REACTION.test(t) && !FAMILIARITY.test(t) && !PAST_TENSE.test(t)) {
    return 'request';
  }

  if (REACTION.test(t)) return 'taste';
  if (FAMILIARITY.test(t)) return 'taste';

  if (CONSTRAINT.test(t)) return 'constraint';

  return 'background';
}

/**
 * Autobiography, not instruction.
 *
 * "I watched three movies yesterday" and "give me three movies" both contain a
 * number and a media noun; only one is an order. The distinguishing signal is
 * that the sentence reports something the speaker DID, so the number counts
 * history rather than results.
 */
const PAST_TENSE =
  /\b(?:i|we)\s+(?:just\s+|already\s+)?(?:watched|saw|finished|binged|rewatched|caught)\b|\b(?:yesterday|last (?:night|week|weekend|month|year)|a few (?:days|weeks|months) ago|earlier)\b/i;

export function parseClauses(raw: string): Clause[] {
  return splitClauses(raw).map((text, index) => ({ text, role: classifyClause(text), index }));
}

/**
 * The clause that carries the actual order.
 *
 * The LAST request clause wins: someone who says "I wanted a comedy, actually
 * give me a thriller" means the thriller, and in a rambling sentence the ask
 * almost always lands at the end. When nothing qualifies there is no request —
 * which is a real answer, not a reason to guess at one.
 */
export function requestClause(clauses: readonly Clause[]): Clause | null {
  for (let i = clauses.length - 1; i >= 0; i--) {
    if (clauses[i]!.role === 'request') return clauses[i]!;
  }
  return null;
}
