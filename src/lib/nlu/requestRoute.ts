import { stripRequestFrame } from './requestFrame';
import { wantsTitleResults } from './requestIntent';

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
 *       → canonical request route (here)
 *       → interpretation + entity resolution (Finder)
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
 * The count and person survive because the raw utterance is what travels — the
 * Finder re-interprets it with the full frame (`stripRequestFrame` gives the
 * count; entity resolution gives the person). Nothing is lossily pre-digested
 * into a filter here.
 */

/** Where a submitted utterance belongs. */
export type RequestRoute =
  | { kind: 'request'; href: string; count: number | null; personalized: boolean }
  | { kind: 'taste' };

/** Matches the finder route's own cap, so what is sent is what is read. */
const MAX_Q = 200;

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

  if (!isRequest && MEDIA_NOUN.test(text)) {
    // "3 … movies" — a stated count of a media noun is a request for a list,
    // whatever qualifies it. Nobody states a quantity to describe their taste.
    if (frame.count != null) isRequest = true;
    // "Sylvester Stallone movies", "a Bruce Willis movie" — a proper noun
    // qualifying a media noun. Checked on the FRAMED text so the scaffolding
    // ("find me", "how about") cannot supply the capitals.
    else if (PERSON_SHAPED.test(frame.text) || PERSON_SHAPED.test(text)) isRequest = true;
    // "…you think I'll like" — an explicit ask for something suited to them.
    else if (frame.personalized) isRequest = true;
  }

  if (!isRequest) return { kind: 'taste' };

  // THE RAW UTTERANCE TRAVELS, not a pre-digested filter. The Finder owns
  // interpretation and entity resolution; pre-parsing here would create a
  // second, quietly divergent interpreter — the exact failure being fixed.
  return {
    kind: 'request',
    href: `/app/finder?q=${encodeURIComponent(text.slice(0, MAX_Q))}&run=1`,
    count: frame.count,
    personalized: frame.personalized,
  };
}

/** Convenience for callers that only need the yes/no. */
export function isTitleRequest(raw: string): boolean {
  return canonicalRequestRoute(raw).kind === 'request';
}
