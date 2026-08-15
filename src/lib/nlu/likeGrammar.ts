/**
 * IS THIS "like" THE VERB OR THE PREPOSITION?
 *
 * ── THE PRODUCTION FAILURE THIS OWNS ──────────────────────────────────────
 * "I like Sylvester Stallone movies, what else do you think I'll like?"
 * reached the comparison parser, whose like-cue accepted the BARE token
 * "like" wherever it appeared. The first "like" here is the verb "to like" —
 * a preference the user is stating — but the parser read it as the
 * preposition ("movies like Rocky") and extracted the words after it as a
 * TITLE anchor. "Sylvester Stallone movies" then went on trial as a film
 * nobody has made, could not resolve, and the user was asked "Which title
 * did you mean?" for a sentence that never named one. The same mechanism
 * turned "I would like 3 boxing movies" into a comparison against a film
 * called "3 boxing movies".
 *
 * ── THE GRAMMATICAL TEST, NOT A WORD LIST OF TITLES ───────────────────────
 * English marks the difference by what sits IMMEDIATELY BEFORE the token:
 *
 *   VERB        a subject pronoun, optionally through auxiliaries/adverbs —
 *               "I like…", "I'd like…", "you think I'll like…",
 *               "we would really like…", "going to like…"
 *   PREPOSITION a noun phrase — "movies like Rocky", "thrillers like Se7en",
 *               "something like Heat" — or nothing at all ("Like Heat, but…")
 *
 * So the test examines only the text before the token, and only for the
 * closed grammatical class that can sit between a subject and its verb.
 * Nothing here names a person, a film, or a genre; "Stallone" appears in no
 * pattern. A noun subject the test has never seen keeps its prepositional
 * reading, which is exactly the conservative failure the parsers already
 * promise ("a dropped modifier returns a broader answer; an invented one
 * returns a wrong answer with confidence").
 *
 * ONE OWNER: the critic's comparison parser and the legacy similarity
 * extractor both consult this, so the verb reading cannot be fixed in one
 * door and stay broken in the other.
 *
 * PURE. No I/O.
 */

/** Subject pronouns (with their 'd/'ll clitics) and the auxiliaries/adverbs
 *  that can stand between a subject and the verb "like". */
const VERB_LIKE_BEFORE =
  /(?:\b(?:i|we|you|they|he|she)(?:['’](?:d|ll))?|\b(?:would|will|won['’]?t|might|may|should|could|must|do|does|did|don['’]?t|doesn['’]?t|didn['’]?t|wouldn['’]?t|shouldn['’]?t|couldn['’]?t|can['’]?t|cannot|never|not|really|truly|also|always|probably|definitely|to|gonna)|\bgoing\s+to)[\s,]*$/i;

/**
 * True when the token starting at `likeIndex` in `text` is the VERB "to
 * like" (a stated preference), false when it reads as the similarity
 * preposition. `likeIndex` is the start of the cue match — for an adverb-led
 * cue ("just like", "kinda like") pass the match start, since those adverbs
 * modify the verb the same way ("I would just like three movies").
 */
export function isVerbLike(text: string, likeIndex: number): boolean {
  return VERB_LIKE_BEFORE.test(text.slice(0, likeIndex));
}

/** Cue texts whose leading word is an ADVERB rather than a noun — these can
 *  precede the verb too, so they need the same subject test as bare "like".
 *  Noun-led cues ("movies like", "something like") are safely prepositional. */
export const ADVERB_LED_LIKE = /^(?:more|kinda|kind\s+of|sort\s+of|just|a\s+lot)\s+like$/i;
