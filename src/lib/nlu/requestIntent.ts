/**
 * "SHOW ME TITLES" vs "HERE IS WHAT I LIKE".
 *
 * `/api/build-case` has to decide, from one free-text sentence, whether the
 * person is ASKING TO BE SHOWN something (send them to Forensic Search, which
 * filters and ranks real titles) or STATING A TASTE (just learn from it). Get
 * it wrong in the "show me" direction and a pure "I love Tarantino, hate gore"
 * gets hijacked into a search. Get it wrong the other way and a real request
 * lands on the generic Watch Now grid with the request silently dropped —
 * which is exactly what "boxing movies I would like" did: `movies` matched the
 * noun test, but the verb test only knew `I'd like`, never `I WOULD like`, so
 * the whole sentence was thrown away and the visitor got Shawshank and The
 * Godfather.
 *
 * Pure and unit-tested here rather than inline in the route, because this is
 * the single decision that determines whether someone's actual question is
 * answered or discarded.
 */

/** A genre, mood or media noun — something to be shown. */
export const FIND_NOUNS =
  /\b(movies?|films?|shows?|series|documentar(y|ies)|comed(y|ies)|funny|scary|horror|thrillers?|family|kids?|action|adventure|dramas?|romance|romantic|rom-?com|sci-?fi|fantasy|animated|anime|western|musical|feel-?good|myster(y|ies)|crime|suspense|tearjerker|date night|something|anything)\b/i;

/**
 * A REQUEST, not a preference. Deliberately excludes the bare preference verbs
 * (love / like / enjoy / hate / avoid) so a pure taste statement still builds
 * DNA — but it must cover the ordinary ways English asks to be shown things.
 *
 * `would like` and friends are listed explicitly: `i'?d like` matches "I'd
 * like" and "id like" and nothing else, so every unelided phrasing ("I would
 * like", "that I would enjoy", "movies I would love") fell straight through.
 */
export const FIND_VERBS =
  /\b(find|show me|recommend(ations?)?|suggest(ions?)?|give me|gimme|pull up|put on|i want|i wanna|i'?d like|would like|would love|would enjoy|want to see|wanna see|to see|in the mood for|looking for|feel like|to watch|can watch|could watch|movie night|good|great|best|binge|worth watching|any good|what should i watch)\b/i;

/** A request phrased as a bare description ("Something light and funny…"). */
const STARTS_WITH_SOMETHING = /^\s*(something|anything)\b/i;

/**
 * True when the sentence is asking to be SHOWN titles. Needs both a noun to
 * show and a verb that asks — or the bare-description opening, which is a
 * request on its own.
 */
export function wantsTitleResults(text: string): boolean {
  return (FIND_NOUNS.test(text) && FIND_VERBS.test(text)) || STARTS_WITH_SOMETHING.test(text);
}
