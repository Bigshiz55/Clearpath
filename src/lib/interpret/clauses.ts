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

import { stripRequestFrame } from '@/lib/nlu/requestFrame';

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
/**
 * A COORDINATING "and" THAT JOINS A REQUEST TO A STORY.
 *
 * "I had a burrito and want something fun tonight" is two independent clauses,
 * and only the second is actionable. Unsplit, the whole utterance leads with
 * "I had", trips the first-person and past-tense guards, and the request half
 * disappears — the burrito swallows the question.
 *
 * Split ONLY when what follows the conjunction opens a request verb phrase.
 * That is what keeps noun coordination intact: "cops and robbers", "a comedy
 * and a thriller" and "Rocky and Creed" name things, they do not ask for one,
 * and splitting them would shred the very spans the extractors depend on.
 *
 * The half this produces is ELLIPTICAL — "…and want something fun" becomes the
 * subjectless "want something fun", because English drops the repeated subject
 * across a conjunction. `REQUEST_VERB` therefore also accepts a clause-INITIAL
 * desire verb, which is only reachable for a clause that began this way or was
 * typed that way, both of which are requests.
 */
const AND_BEFORE_REQUEST =
  /\s+\band\s+(?=(?:then\s+|now\s+|also\s+)?(?:i\s+|we\s+)?(?:want|need|would\s+like|am\s+looking\s+for|are\s+looking\s+for|looking\s+for|find|give|show|recommend|suggest|get)\b)/i;

export function splitClauses(raw: string): string[] {
  return (raw ?? '')
    .replace(AND_BEFORE_REQUEST, '. ')
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
/* THE FOUR AMBIGUOUS VERBS ARE NOT IN THE LEADING ALTERNATIVE.
   "find", "show", "give" and "get" open requests and they open FILMS — the
   unrestricted leading form read "Get Out" as an order. They are still matched
   below when an object follows ("find ME"), and `stripRequestFrame` above
   already accepts the other legitimate shapes ("find 3 …", "show some …"),
   which is exactly the division of labour: the primitive knows which framings
   are real, this file decides what a framed clause is for.

   "put on" and "play" stay: they carry the same title risk ("Play Misty for
   Me") and that risk is PRE-EXISTING here, so removing them would trade a
   named regression for an unnamed one. Narrowing them belongs in its own
   change, judged on its own evidence. */
/**
 * THE REQUEST VOCABULARY, IN ONE PLACE.
 *
 * These words were listed here and listed AGAIN, differently, in the subject
 * extractor's structural guard — which knew `want`, `find` and `show` but not
 * `recommend`, `suggest`, `need` or `get`. So "recommend thrillers" bound the
 * SUBJECT "recommend": the verb asking for the search became the topic of it.
 * Two hand-kept lists of the same vocabulary will always drift; the fix is that
 * there is now one, and both readers build from it.
 */
/** Bare imperatives: "recommend something", "put on a comedy". */
const BARE_IMPERATIVE = ['recommend', 'suggest', 'pull up', 'put on', 'queue up', 'play', 'hit me with'] as const;
/** Transitive asks that take me/us: "find me a thriller". */
const TRANSITIVE_ASK = ['find', 'show', 'give', 'recommend', 'suggest', 'get'] as const;
/** Stated desires that lead a clause: "want a comedy", "need something short". */
const DESIRE = ['want', 'need', 'like', 'watch', 'see'] as const;

/** Every single word that can only be ASKING for something, never the thing. */
export const REQUEST_VERBS: readonly string[] = Array.from(
  new Set<string>([...BARE_IMPERATIVE, ...TRANSITIVE_ASK, ...DESIRE]),
);

const alt = (words: readonly string[]) => words.join('|');

const REQUEST_VERB = new RegExp(
  `^\\s*(?:please\\s+|just\\s+|maybe\\s+|ok(?:ay)?,?\\s+)*(?:${alt(BARE_IMPERATIVE)})\\b|\\b(?:${alt(TRANSITIVE_ASK)})\\s+(?:me|us)\\b|\\bi(?:'|’)?m looking for\\b|\\blooking for\\b|\\b(?:i|we)\\s+want\\b|\\bi'?d like\\b|\\bi would like\\b|\\bi wanna\\b|\\bwhat (?:else )?should\\b[^.?!]{0,40}?\\bwatch\\b|\\bwhat to watch\\b|\\bin the mood for\\b|\\bfeel like watching\\b|\\bsurprise me\\b|\\bhelp me (?:find|pick|choose)\\b|\\bany (?:good|recommendations?)\\b|^\\s*(?:please\\s+|just\\s+)*(?:find|show|give|get)\\s+(?:me\\s+|us\\s+)?(?:a|an|another|some|three|two|\\d)\\b|^\\s*(?:want|need)\\s+`,
  'i',
);

/** The kind of thing one asks to be shown several of. */
const MEDIA_NOUN =
  /\b(?:movies?|films?|shows?|series|documentar(?:y|ies)|comed(?:y|ies)|thrillers?|dramas?|myster(?:y|ies)|flicks?|picks?|titles?|episodes?|something to watch)\b/i;

/** A bare count leading a media noun: "3 Stallone movies". */
const COUNT_LED = /^\s*(?:\d+|a couple of|a few|one|two|three|four|five|six|seven|eight|nine|ten)\b/i;

/** A media noun handed to a credit cue: "movies directed by …", "films with …". */
const MEDIA_PERSON_REQUEST =
  /^\s*(?:movies?|films?|shows?|series)\s+(?:with|starring|featuring|directed\s+by|written\s+by|created\s+by|by|from)\b/i;

/**
 * A PRESENT-TENSE STATEMENT OF TASTE: "I like Stallone movies".
 *
 * `REACTION` covers the past forms ("I loved", "I hated") because those are how
 * a verdict on a specific work is phrased. A standing preference is present
 * tense, ends in a plural media noun, and is NOT an order — the difference
 * between "I like Stallone movies" (tell me about my taste) and "Stallone
 * movies" (fetch some).
 *
 * Guarding the rule below with this is load-bearing: without it "I like
 * Sylvester Stallone movies" became a request clause, ran through the
 * similarity spans, and manufactured "Sylvester Stallone" as a TITLE to
 * resolve — the fake-anchor defect that produced "Which title did you mean?".
 */
/* THE NEGATIVE LEAD IS THE SAME JUDGEMENT. "I don't like dumb comedies" is a
   standing preference exactly as "I like courtroom dramas" is — the polarity
   belongs to the negation layer (`negatedSpans` reads the "don't"), not to the
   role decider. Without the negated forms the sentence fell to BACKGROUND and
   the stated dislike vanished without even an acknowledgement. `hate`/`can't
   stand` are the lexically negative present-tense forms of the same lead. */
const PREFERENCE_LEAD =
  /\b(?:i|we)\s+(?:really\s+|kind\s+of\s+|sort\s+of\s+|generally\s+|usually\s+)?(?:don'?t\s+(?:like|love|enjoy)|do\s+not\s+(?:like|love|enjoy)|can'?t\s+stand|hate|dislike|like|love|enjoy|prefer|dig|am\s+into)\b/i;

/**
 * DOES THIS CLAUSE STATE A STANDING PREFERENCE?
 *
 * The 'taste' role covers three vocabularies — standing preference ("I like
 * courtroom dramas"), past reaction ("I loved Rocky"), and bare familiarity
 * ("I watched a horror movie yesterday") — because all three fence the clause
 * off from the request. But only the FIRST is durable taste about kinds of
 * things. A reaction is about one title (the title layer owns it), and
 * familiarity carries no verdict at all: reading "I watched a horror movie
 * yesterday" as "this viewer wants horror" is precisely the anecdote leak the
 * side-door contract forbids — and it is exactly what happened when the taste
 * extraction gated on the role alone.
 */
export function statesPreference(text: string): boolean {
  return PREFERENCE_LEAD.test(` ${text.toLowerCase()} `);
}

/**
 * A THIRD PARTY'S STANDING TASTE — "My wife likes comedies."
 *
 * The same judgement `PREFERENCE_LEAD` makes for the speaker, made for someone
 * else. Without it a sentence describing what a partner enjoys read as an
 * instruction to go fetch it, which is the third-person twin of the fake-anchor
 * defect that rule exists to prevent.
 *
 * The relationship nouns are NOT re-listed: `COMPANION` below already owns that
 * vocabulary, and a second copy would drift. Third-person verb agreement
 * ("likes", not "like") is what separates the statement from the request "a
 * comedy my wife would LIKE".
 */
const THIRD_PARTY_PREFERENCE_VERB =
  /\s+(?:really\s+|kind\s+of\s+|sort\s+of\s+|generally\s+|usually\s+)?(?:likes|loves|enjoys|prefers|digs|hates|watches|is\s+into)\b/i;

/** A plural media noun ANYWHERE in the clause: "recent crime movies", "Apple
 *  TV+ shows with crime". Plural is load-bearing — film titles use the
 *  singular ("Scary Movie", "The Lego Movie"). */
const PLURAL_MEDIA =
  /\b(?:movies|films|shows|series|documentaries|flicks|sitcoms|thrillers|dramas|comedies|mysteries)\b/i;

/**
 * THE SINGULAR UNFRAMED REQUEST — "another boxing movie", "a good mystery".
 *
 * `PLURAL_MEDIA` above deliberately refuses the singular, because film titles
 * ARE singular: accepting "<a> <word> movie" naively turns "A Goofy Movie" into
 * an order for goofy films. That guard is right, and it also silently discarded
 * half of ordinary consumer phrasing — measured against the deployed product,
 * "another boxing movie" and "a thriller that isn't slow" both classified as
 * statements and reached the finder as background noise.
 *
 * The discriminator is not number, it is THREE things at once:
 *
 *   1. the clause OPENS with an indefinite determiner  — anchored, so
 *      "Rocky is a boxing movie", where the identical noun phrase is a
 *      predicate nominative, is untouched;
 *   2. it names a medium or a genre;
 *   3. it is written as ORDINARY PROSE, not as a title.
 *
 * (3) is what replaces a title list. A typed title reference carries a Title
 * Case run ("A Goofy Movie", "The Dark Knight"); a request does not ("a good
 * mystery"). Single capitals are ignored so "a movie my wife and I would both
 * like" is unaffected.
 */
const INDEFINITE_LEAD = /^\s*(?:another|a|an)\s+/i;

/** Singular OR plural — the thing being asked for, medium or genre. */
const UNAMBIGUOUS_HEAD =
  /\b(?:movie|film|series|documentary|documentaries|flick|sitcom|thriller|drama|comedy|comedies|mystery|mysteries|western|musical|romcom)s?\b/i;

/* `show` is NOT in that list, and that exclusion is an existing named
   regression guard: "a horror show" is ordinary English for a disaster, and
   `show` is also the request verb. It is admitted only when a relative or
   modifier clause disambiguates it — "a show MY FAMILY CAN WATCH" is a
   request in a way "a horror show" is not. */
const AMBIGUOUS_HEAD = /\bshows?\b/i;
const QUALIFYING_CLAUSE =
  /\b(?:that|which|who|whom)\b|\b(?:my|our)\s+[\w-]+\s+(?:can|could|would|will|might)\b/i;

const namesAMediumOrGenre = (t: string): boolean =>
  UNAMBIGUOUS_HEAD.test(t) || (AMBIGUOUS_HEAD.test(t) && QUALIFYING_CLAUSE.test(t));

/** Two or more capitalised words in a row — how a title is written. */
const TITLE_CASE_RUN = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/;

/** A clause that opens by talking about the speaker is autobiography until
 *  something else proves otherwise — and every genuine first-person request
 *  ("I want…", "I'm looking for…") is already caught by `REQUEST_VERB` above. */
const FIRST_PERSON_LEAD = /^\s*(?:i|we)\b/i;

/**
 * "my top 5 favorite movies are X" — the speaker DESCRIBING their own list.
 *
 * Adversarial review caught this as a regression the moment the plural rule
 * stopped being tail-anchored: the clause names a medium and does not open
 * with "I", so it read as an order and donated its **5** to `requestedCount`.
 * A count from someone's list of favourites is an example, not an instruction,
 * and that is precisely the contamination the count field must refuse.
 *
 * The signature is a possessive subject joined to a copula — a sentence ABOUT
 * something the speaker has, rather than a request for something they want.
 */
const POSSESSIVE_STATEMENT = /^\s*(?:my|our)\b[^.;]*\b(?:are|is|were|was)\b/i;

/** "Something funny", "anything but horror" — a description standing in for a request. */
const LEADING_SOMETHING = /^\s*(?:something|anything)\b/i;

/** A reaction aimed at a work. The OBJECT matters, not the verb alone. */
const REACTION =
  /\b(?:i|we)\s+(?:really\s+|kind of\s+|sort of\s+)?(?:loved|liked|enjoyed|hated|disliked|couldn'?t stand|didn'?t (?:like|enjoy)|am obsessed with|was obsessed with)\b/i;

/** Familiarity without a verdict: "I've seen Creed", "I already watched Rocky". */
const FAMILIARITY =
  /\b(?:i|we)(?:'|’)?(?:ve|\s+have)?\s+(?:already\s+)?(?:seen|watched)\b/i;

/** A standing statement about a companion's taste: "my wife likes comedies".
 *  Built FROM `COMPANION` rather than beside it, so the relationship vocabulary
 *  has exactly one definition. */
function thirdPartyPreference(t: string): boolean {
  const m = COMPANION.exec(t);
  if (!m) return false;
  return THIRD_PARTY_PREFERENCE_VERB.test(t.slice(m.index + m[0].length));
}

/** Someone else in the room, and what they will not sit through. */
const COMPANION =
  /\b(?:my|our)\s+(?:wife|husband|partner|girlfriend|boyfriend|kid|kids|son|daughter|mum|mom|dad|roommate|friend|family)\b/i;

/**
 * A DIMINISHER RULES AN AXIS END OUT — the vocabulary, declared exactly once.
 *
 * "less X" and "fewer X" scope over the following span the way a negator does,
 * and the hedges people put in front ("a bit less", "slightly less") belong to
 * the diminisher, not to the span it governs. `more` is deliberately absent:
 * it is a direction, not a veto, and "something more funny" must keep meaning
 * funny. Consumed here by `CONSTRAINT` (a diminishing fragment is a request)
 * and by `negatedSpans` in interpret.ts (the polarity itself).
 *
 * A REGEX LITERAL, COMPOSED VIA `String.raw` AND `.source` — NEVER a plain
 * template with escaped backslashes. That is a toolchain lesson paid for in
 * production: the first landing built the negation regex from an ordinary
 * template literal, SWC constant-folded it into a string and mis-escaped `\b`
 * into a literal BACKSPACE character, and the deployed regex matched nothing —
 * every "no X" on /api/ask inverted to "X wanted" while 5208 unminified tests
 * stayed green. Tagged templates are opaque to the folder (a tag is an
 * arbitrary function), which is why every other dynamic regex in this codebase
 * already uses `String.raw`. `scripts/verify/bundleEscapes.mjs` now fails any
 * build that ships a corrupted escape, so the class is closed, not just this
 * instance.
 */
/* `(?!\s+than\b)`: "less THAN 90 minutes" is the QUANTITY comparative — a
   runtime bound the numeric alternative in CONSTRAINT already owns — not a
   quality veto. Without the lookahead the diminisher swallowed it and pushed
   `than` downstream as an excluded SUBJECT (caught in review before it
   shipped). */
export const DIMINISHER = /(?:a\s+bit\s+|a\s+little\s+|slightly\s+|somewhat\s+|much\s+|way\s+)?(?:less|fewer)(?!\s+than\b)/;

/**
 * A standalone filter that is a request even with no verb.
 *
 * A DIMINISHING FRAGMENT IS ONE OF THEM. "I want a comedy, less gory" filed
 * ", less gory" as conversational BACKGROUND and executed the comedy alone —
 * the constraint the user stated last, and most specifically, was the one
 * thrown away. "nothing gory" in the same position was already recognised,
 * because the marker list carried `nothing` and not `less`.
 *
 * `less than`/`more than` earlier in the alternation are QUANTITY comparatives
 * ("less than 90 minutes") and keep their numeric requirement; the diminisher
 * alternative is the QUALITY form and governs a word.
 */
const CONSTRAINT = new RegExp(
  String.raw`\b(?:under|over|less than|more than|no longer than|shorter than|at least|between)\s+(?:\d+|an?|one|two|three)\b|\b\d+\s*(?:minutes?|mins?|hours?|hrs?)\b|\bon (?:netflix|hulu|max|hbo|disney|prime|paramount|peacock|apple)\b|\b(?:no|not|nothing|none|without|except|avoid)\s+\w+|\b${DIMINISHER.source}\s+[a-z][\w'-]*`,
  'i',
);

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
/**
 * "a <description> movie" — an article, a description, an unambiguous movie
 * noun, and nothing else. `show`/`series` are excluded on purpose (see the call
 * site); the article requirement is what keeps capitalised titles out.
 */
const BARE_MOVIE_PHRASE = /^\s*(?:an?|the)\s+(.+?)\s+(movies?|films?|flicks?)\s*[.!?]?$/i;
/** Structural filler — present in every phrase, evidence for none. */
const NOT_DESCRIPTIVE =
  /^(?:good|great|best|new|newer|old|older|other|another|more|some|any|the|a|an|one|two|three|four|five|few|couple|nice|decent|solid|different|similar)$/i;

/**
 * IS THIS A DESCRIPTION, OR A TITLE THAT HAPPENS TO END IN "MOVIE"?
 *
 * `article + words + movie` cannot tell "a courtroom movie" from "The Lego
 * Movie" — both fit. An earlier version of this rule claimed the leading
 * article as the safety property; it is not one, it only excludes titles that
 * happen to lack an article, which is why "Get Out" and "A Few Good Men"
 * passed and gave false confidence while "A Goofy Movie" became a search for
 * the subject `goofy`.
 *
 * The real evidence is DESCRIPTIVE language: the token immediately qualifying
 * the media noun must be lowercase and carry meaning. "courtroom movie" and
 * "boxing movie" qualify; "Lego Movie" and "Goofy Movie" do not, because a
 * capitalised qualifier is title-shaped and this layer has no world knowledge
 * to settle it.
 *
 * That is a deliberate loss of recall: a bare "a Tom Hanks movie" is left
 * unexecuted rather than guessed at, because it is the same shape as "A Goofy
 * Movie". The layer's own principle — a miss should lose a reference rather
 * than confidently invent one. Explicit forms ("Give me a Tom Hanks movie",
 * "3 Sylvester Stallone movies", "how about a Bruce Willis movie") are
 * unaffected: they are promoted by request framing, not by this rule.
 */
function bareDescriptiveRequest(t: string): boolean {
  const m = BARE_MOVIE_PHRASE.exec(t);
  if (!m) return false;
  const qualifier = m[1]!.trim().split(/\s+/).pop() ?? '';
  return /^[a-z][\w-]{2,}$/.test(qualifier) && !NOT_DESCRIPTIVE.test(qualifier);
}

export function classifyClause(text: string): ClauseRole {
  const t = text.trim();
  if (!t) return 'background';

  /* THE BARE-NOUN-PHRASE REQUEST TEST, HOISTED — because companion language
     must not be allowed to claim a clause that is plainly an order. Evaluated
     here and consumed twice: once to stop `COMPANION` swallowing a request,
     and once as the classification itself further down. */
  /* Two shapes of the same thing: a plural media noun anywhere, or an
     indefinite phrase in clause-initial position. They share every guard
     below, so neither can bypass preference/reaction/familiarity detection. */
  const namesWhatIsWanted =
    PLURAL_MEDIA.test(t) ||
    (INDEFINITE_LEAD.test(t) && namesAMediumOrGenre(t) && !TITLE_CASE_RUN.test(t));

  const bareRequest =
    namesWhatIsWanted &&
    !FIRST_PERSON_LEAD.test(t) &&
    !POSSESSIVE_STATEMENT.test(t) &&
    !REACTION.test(t) &&
    !FAMILIARITY.test(t) &&
    !PAST_TENSE.test(t) &&
    !PREFERENCE_LEAD.test(t) &&
    !thirdPartyPreference(t);

  /* A COMPANION MENTION INSIDE A REQUEST IS A CONSTRAINT, NOT THE PURPOSE OF
     THE CLAUSE. "Pull up three TNT movies … something my family can watch"
     classified `companion` outright, so `requestClause` returned null and the
     whole request was thrown away — no count, no media, no network. Measured:
     the largest remaining source of dropped counts. Adversarial review then
     found the same swallow one step further out: "Find movies for my family
     after dinner" carries no "find ME", so neither the frame nor
     `REQUEST_VERB` recognised it and the request vanished again. Who a request
     is FOR travels in the companion constraint fields; it is not the clause's
     reason for existing. */
  if (COMPANION.test(t) && !bareRequest && !stripRequestFrame(t).stripped && !REQUEST_VERB.test(t)) {
    return 'companion';
  }

  const media = MEDIA_NOUN.test(t);
  /* THE LEXICAL FRAME IS CONSUMED, NOT RE-DERIVED.
     `stripRequestFrame` already owns the question "did this sentence carry
     request scaffolding" — the lead phrases, the count forms, the
     personalization tail, and the discipline that keeps "Get Out" and "A Few
     Good Men" from looking like orders. Asking it is how this layer inherits
     that work instead of growing a second, divergent copy of it.

     Measured before this call existed: "how about a Bruce Willis movie" came
     back `statement` with no person at all, because `REQUEST_VERB` has no
     "how about". The lexical layer had the answer and nothing asked it. */
  if (stripRequestFrame(t).stripped) return 'request';
  if (REQUEST_VERB.test(t)) return 'request';
  if (LEADING_SOMETHING.test(t)) return 'request';
  /* "movies directed by Christopher Nolan" — a media noun handed straight to a
     credit cue. No imperative, and unmistakably a request. This is a SEMANTIC
     judgement about clause role, so it lives here rather than in the lexical
     primitive: `requestFrame` may say what framing a sentence wears, never what
     the sentence is for. */
  if (MEDIA_PERSON_REQUEST.test(t)) return 'request';
  /* A BARE NOUN PHRASE IS AN ORDER WHEN IT NAMES THE ANSWER.
     "a courtroom movie", "a Tom Hanks courtroom movie", "a Sylvester Stallone
     boxing movie" carry no verb, no count and no scaffolding — the request IS
     the description of the thing wanted. Measured before this rule: all three
     classified `background`, so media fell back to `either`, requestedCount to
     null, and neither the person nor the subject was ever extracted.

     This is a clause-ROLE judgement (what is this sentence for), which is why
     it lives here and not in `requestFrame` — that primitive owns lexical
     scaffolding, and a bare noun phrase has none to own.

     LIMITED TO UNAMBIGUOUS MOVIE NOUNS. `show` is deliberately excluded: it is
     an ordinary noun as well as a medium, and "a horror show" is a named
     regression that must not become an order. The leading article is required
     so a bare capitalised title ("A Few Good Men", "Get Out") cannot match. */
  if (bareDescriptiveRequest(t)) return 'request';
  /* AN ARTICLE-LESS NOUN PHRASE ENDING IN A PLURAL MEDIA NOUN IS AN ORDER.
     "recent crime movies", "Apple TV+ movies", "Find Morgan Freeman movies"
     all classified `background` before this rule, so `requestClause` returned
     null and NOTHING was extracted from them — no media, no count, no person,
     no date. That is the single largest source of canonical-interpreter
     failures: a bare noun phrase is how people actually type, and the rule
     above only fires when a leading ARTICLE is present ("a courtroom movie").

     PLURAL IS THE DISCRIMINATOR, and it is what keeps titles safe. A film is
     named "Scary Movie", "The Lego Movie", "Silent Movie" — singular, always —
     while a person asking for several says "movies". Combined with the
     existing guards, "Get Out", "A Few Good Men" and "Two Weeks Notice" carry
     no media noun at all and cannot reach this line.

     THE NOUN MAY SIT ANYWHERE. The first cut anchored it to the END of the
     clause, which adversarial review broke immediately: "Apple TV+ shows with
     crime", "movies in the past decade", "movies older than 20 years" and
     "movies like Stallone" all push the noun off the end, and every one of them
     fell straight back to `background` with nothing extracted. A trailing
     qualifier is the normal shape of a request, not an exception to it. */
  if (bareRequest) return 'request';
  // A count only makes a request when it is counting the thing being asked for.
  // "I watched 3 movies yesterday" is past tense about the user, not an order.
  if (COUNT_LED.test(t) && media && !REACTION.test(t) && !FAMILIARITY.test(t) && !PAST_TENSE.test(t)) {
    return 'request';
  }

  /* "I like Yellowstone." — a STANDING preference is taste evidence exactly as
     a past-tense reaction is. `PREFERENCE_LEAD` was only ever consulted as a
     guard, so a present-tense statement of taste fell through to background and
     the reader's one piece of evidence was discarded before the request that
     followed it could use it. */
  if (PREFERENCE_LEAD.test(t)) return 'taste';
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
