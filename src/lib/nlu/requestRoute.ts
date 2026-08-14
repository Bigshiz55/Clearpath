import { stripRequestFrame } from './requestFrame';
import { wantsTitleResults } from './requestIntent';
import { askHref } from '@/lib/search/searchIntent';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE ONE FRONT DOOR FOR A NATURAL-LANGUAGE RECOMMENDATION REQUEST.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * THE LIVE DEFECT THIS EXISTS TO CLOSE. A user typed "3 Sylvester Stallone
 * movies" into the hero box and got the generic Watch Now feed, starting with
 * Cold Case — a TV series with no Stallone in it. Telemetry showed
 * `POST /api/browse` and `POST /app/watch`, and NO `/api/ask` or `/api/finder`.
 *
 * The interpretation layer was not failing; it was never invoked. `BuildCaseBox`
 * POSTs to `/api/build-case`, whose only routing gate was `wantsTitleResults()`
 * — which requires BOTH a genre/media word AND a find verb, and knows nothing
 * about people or counts:
 *
 *     wantsTitleResults('3 Sylvester Stallone movies')     === false
 *     wantsTitleResults('how about a Bruce Willis movie')  === false
 *
 * With no redirect, the box fell back to `router.push('/app/watch')`. That page
 * cannot carry a request — its only search param is `type` — so the person, the
 * count and the constraint were dropped on the floor.
 *
 * ── THE CONTRACT ─────────────────────────────────────────────────────────
 *
 *     raw utterance
 *       → this routing decision
 *       → /app/ask  (seeds AskTheJudge)
 *       → POST /api/ask   ← the ONE canonical interpretation/orchestration owner
 *       → entity resolution → retrieval → eligibility → ranking
 *       → constrained results
 *
 * Browse stays structured catalog browsing. Watch Now stays a feed. Neither is
 * taught to be a second natural-language engine, and arbitrary recommendation
 * language is never sent to either.
 *
 * ── WHY THE DECISION IS PURE AND SHARED ──────────────────────────────────
 * Both the server route and the client box call THIS function, so they cannot
 * disagree about what a request is. That disagreement is precisely how the
 * defect shipped: the server declined to route, the client silently invented a
 * destination, and no test looked at the two together.
 *
 * The count and person survive because the RAW UTTERANCE is what travels.
 * `/api/ask` re-interprets it in full. Nothing is lossily pre-digested here,
 * and no second interpreter is introduced: this module decides only WHETHER an
 * utterance is a recommendation request, never WHAT it means.
 */

/** Where a submitted utterance belongs. */
export type RequestRoute =
  | { kind: 'request'; href: string; count: number | null; personalized: boolean }
  | { kind: 'taste' };

/**
 * A CAPITALISED MULTI-WORD NAME beside a media noun is a person request.
 *
 * Deliberately shape-based rather than a name list: a roster of actors is a
 * maintenance trap that is always one release behind, and the thing that makes
 * "Sylvester Stallone movies" a request is not that we recognise the man — it
 * is that a proper noun is being used to qualify a plural media noun. Entity
 * resolution is the Finder's job and happens downstream against real cast data,
 * so a false positive here costs a search that finds nothing, never a wrong
 * claim about who is in what.
 *
 * Requires TWO capitalised words so ordinary sentence-initial capitals and
 * single words ("Movies about boxing") do not trip it.
 */
const PERSON_SHAPED = /\b([A-Z][a-z’'-]{1,})\s+([A-Z][a-z’'-]{1,})\b/;
const MEDIA_NOUN = /\b(movies?|films?|shows?|series|documentar(?:y|ies)|episodes?)\b/i;

/**
 * ASKING WHAT TO WATCH IS A MEDIA CONTEXT, EVEN WITH NO MEDIA NOUN.
 *
 * "what should I watch tonight with Tom Hanks" names no movie, film or show —
 * the medium is carried by the verb. Without this it failed the media gate,
 * fell through to `taste`, and landed on the generic feed: the SAME defect as
 * the incident, one phrasing away.
 *
 * This asks only "is the user asking to be shown something to watch". It does
 * not extract the person, the time, or the count — those stay downstream. The
 * pattern is anchored on a first-person watch request so ordinary uses of the
 * word ("I watched Rocky three weeks ago") do not qualify on their own.
 */
const WATCH_REQUEST = /\b(?:what|anything|something|some\s+things?)\b[^.?!]{0,40}?\b(?:should|can|could|do|to)\s+(?:i|we)?\s*watch\b|\bwhat\s+to\s+watch\b/i;

/** A media context exists when a media noun is present OR the ask is "what to watch". */
function hasMediaContext(text: string): boolean {
  return MEDIA_NOUN.test(text) || WATCH_REQUEST.test(text);
}

/**
 * Decide where an utterance goes.
 *
 * `wantsTitleResults` stays the primary gate — it already encodes the
 * genre/mood cases and their regressions, and this must not weaken it. What is
 * added is the case it cannot see: a request that qualifies a media noun with a
 * COUNT or a PERSON rather than a genre word.
 */
export function canonicalRequestRoute(raw: string): RequestRoute {
  const text = (raw ?? '').trim();
  if (!text) return { kind: 'taste' };

  const frame = stripRequestFrame(text);

  // The existing gate first, unchanged in meaning.
  let isRequest = wantsTitleResults(text);

  if (!isRequest && hasMediaContext(text)) {
    // "3 … movies" — a stated count of a media noun is a request for a list,
    // whatever qualifies it. Nobody states a quantity to describe their taste.
    if (frame.count != null) isRequest = true;
    // "Sylvester Stallone movies", "a Bruce Willis movie", "…watch tonight with
    // Tom Hanks" — a proper noun qualifying the media context. Checked on the
    // FRAMED text too, so scaffolding ("find me", "how about") cannot supply
    // the capitals by itself.
    else if (PERSON_SHAPED.test(frame.text) || PERSON_SHAPED.test(text)) isRequest = true;
    // "…you think I'll like" — an explicit ask for something suited to them.
    else if (frame.personalized) isRequest = true;
  }

  if (!isRequest) return { kind: 'taste' };

  // ── THE ONE FRONT DOOR IS /api/ask, VIA /app/ask ────────────────────────
  // Not /app/finder. Sending conversational text there would have created a
  // THIRD recommendation path beside /api/ask and /api/finder, which is the
  // architecture this exists to prevent — one recommendation truth, not a new
  // one per entry point. `/app/ask?q=` seeds `AskTheJudge`, which POSTs
  // `/api/ask`: the canonical interpretation/orchestration owner.
  //
  // The URL is built by `askHref` — the SAME builder SearchBar, QuickSearch and
  // HomeGreeter already use — rather than a second string template here. Two
  // builders that can drift about the cap or the encoding is the small version
  // of the same defect.
  //
  // THE RAW UTTERANCE TRAVELS, not a pre-digested filter. `/api/ask` owns
  // interpretation and entity resolution; pre-parsing here would create a
  // second, quietly divergent interpreter. `count` and `personalized` are
  // returned for callers that want to LOG or explain the routing decision —
  // never to replace what the canonical interpreter derives.
  const href = askHref(text);
  if (!href) return { kind: 'taste' };
  return { kind: 'request', href, count: frame.count, personalized: frame.personalized };
}

/** Convenience for callers that only need the yes/no. */
export function isTitleRequest(raw: string): boolean {
  return canonicalRequestRoute(raw).kind === 'request';
}
