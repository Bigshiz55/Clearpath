/**
 * HOW MANY RESULTS DID THEY ASK FOR?
 *
 * "A great movie under two hours" returned two movies.
 *
 * Both count readers in this codebase took the FIRST number in the sentence and
 * called it the answer, so every number a request contains — a runtime, a date
 * window, a rating floor, a season number — was read as "and give me that many
 * results". "under two hours" → 2. "from the last 3 years" → 3. "IMDb 7 or
 * higher" → 7. The one thing those numbers never are is a result count.
 *
 * The rule this module enforces: A NUMBER IS A RESULT COUNT ONLY WHEN IT COUNTS
 * RESULTS. That means one of two things is true —
 *
 *   • it is immediately followed by a word for the thing being returned
 *     ("three MOVIES", "a couple of PICKS", "5 TITLES"), or
 *   • it follows a request verb with nothing else in between
 *     ("give me five", "show me 3", "top 10").
 *
 * and in neither case is it bound to a unit ("two HOURS", "3 YEARS", "8/10").
 * Anything else returns null, which means "they did not say" — and "they did
 * not say" is a browse, so it gets the full default page.
 *
 * Pure. No I/O, no clock. Shared by `detectors.ts` (production result limits)
 * and `queryPlan.ts` (the planner + eval harness) so there is exactly one
 * definition of what a count is.
 */

/**
 * THE DEFAULT PAGE, when the ask names no number.
 *
 * This was 8 in two places and 24 in a third, and the two 8s were the ones on
 * the live path — so the 24 that `finder.ts` documents at length was never
 * reached by anything a person typed. 24 fills the responsive grid at every
 * breakpoint (2/3/4/6 columns) and is what "show me movies under two hours"
 * should look like: a shelf, not a shortlist.
 */
export const DEFAULT_RESULT_COUNT = 24;

/** The ceiling on a count somebody states out loud. */
export const MAX_REQUESTED_COUNT = 60;

const NUM_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20,
};

/** Vague quantities people actually say. */
const FUZZY_WORDS: Record<string, number> = { couple: 2, few: 3, several: 4, handful: 5 };

/**
 * Units that CLAIM a number. When one of these follows, the number belongs to
 * it and is not available to be a result count — this is the whole fix.
 */
const UNIT_AFTER =
  /^(?:hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|years?|yrs?|months?|weeks?|days?|decades?|seasons?|episodes?|eps?|parts?|chapters?|volumes?|books?|stars?|points?|pts?|percent|%|out\s+of|\/\s*10|\/\s*5|k\b|million|billion)$/;

/**
 * Comparators that make a number a THRESHOLD rather than a quantity. "at least
 * 3 seasons" is caught by the unit rule; "over 80" is not, and an audience
 * floor is not a request for eighty movies.
 */
const COMPARATOR_BEFORE =
  /(?:under|below|beneath|over|above|less\s+than|fewer\s+than|more\s+than|greater\s+than|at\s+least|at\s+most|no\s+more\s+than|up\s+to|within|between|rated|rating|score|imdb|metacritic|tomatometer|audience|since|after|before|from|past|last|next|season|episode|chapter|part|volume)$/;

/**
 * Words for the thing being returned — the tell that a number is a count.
 *
 * Genre plurals belong here too: "three thrillers" and "five comedies" name the
 * results just as squarely as "three movies" does.
 */
const RESULT_NOUN =
  /^(?:movies?|films?|flicks?|features?|shows?|series|sitcoms?|documentar(?:y|ies)|docs?|titles?|picks?|options?|choices?|ideas?|suggestions?|recommendations?|recs?|results?|things?|ones?|watches?|thrillers?|comedies|dramas?|mysteries|romances?|westerns?|musicals?|animations?|blockbusters?|classics?|indies|rom-?coms?|whodunits?|capers?|slashers?|epics?|biopics?)$/;

/** Verbs that introduce a bare count: "give me five", "top 10". */
const ASK_BEFORE = /(?:give|show|send|find|get|list|name|suggest|recommend|want|need|top|best|first)(?:\s+(?:me|us|them|it))?$/;

interface Token {
  /** The numeric value. */
  value: number;
  /** Character offset of the token's start / end in the lowered text. */
  start: number;
  end: number;
  /** True for "a couple"/"a few" — vague, but still a real request. */
  fuzzy: boolean;
}

const WORD_ALT = Object.keys(NUM_WORDS).join('|');
const FUZZY_ALT = Object.keys(FUZZY_WORDS).join('|');
const TOKEN_RE = new RegExp(
  String.raw`\b(?:(\d{1,3})|(${WORD_ALT})|(?:an?\s+)?(${FUZZY_ALT}))\b`,
  'g',
);

/** Every number-ish token in the text, in order. */
function tokenize(text: string): Token[] {
  const out: Token[] = [];
  for (const m of text.matchAll(TOKEN_RE)) {
    const at = m.index ?? 0;
    if (m[1]) {
      // A 4-digit year or a decade ("1990s", "the 80s") is never a count. The
      // token regex only takes 1–3 digits, so guard the decade shape here.
      const after = text.slice(at + m[0].length);
      if (/^s\b/.test(after) && Number(m[1]) >= 20) continue;
      out.push({ value: Number(m[1]), start: at, end: at + m[0].length, fuzzy: false });
    } else if (m[2]) {
      out.push({ value: NUM_WORDS[m[2]]!, start: at, end: at + m[0].length, fuzzy: false });
    } else if (m[3]) {
      out.push({ value: FUZZY_WORDS[m[3]]!, start: at, end: at + m[0].length, fuzzy: true });
    }
  }
  return out;
}

/**
 * Words that end the noun phrase a number is quantifying. Past one of these,
 * whatever noun turns up belongs to a different clause: in "give me 5 on
 * Netflix under two hours", the "hours" after "under" is not what the 5 counts.
 */
const BREAKER = /^(?:on|from|in|with|without|under|over|that|which|who|for|at|to|by|about|between|during|since|after|before|and|or|but|out|released|starring|like|similar)$/;

/** Filler that sits between a count and its noun: "five GOOD crime movies". */
const SKIP = /^(?:of|the|a|an|really|very|good|great|solid|decent|new|old|more|other|different|best|top|classic|recent|short|long|foreign|english|spanish|korean|japanese|french|funny|scary|sad|light|dark|quick|easy|obscure|underrated)$/;

/** The words immediately before the token. */
function prevWords(text: string, t: Token): string {
  return text.slice(0, t.start).trimEnd();
}

/**
 * What, if anything, does this number quantify?
 *
 * Scans forward through the noun phrase — skipping the adjectives and proper
 * nouns people put between a count and its noun ("five LIFETIME movies") —
 * until it finds either a word for the thing being returned, a unit that claims
 * the number for itself, or the end of the phrase.
 */
type Head = 'result' | 'unit' | null;

const LOOKAHEAD = 4;

function head(text: string, t: Token): Head {
  // "8/10", "80%" — the unit is glued on with no space at all.
  if (/^\s*(?:%|\/\s*\d)/.test(text.slice(t.end, t.end + 4))) return 'unit';

  const words = text.slice(t.end).match(/[a-z%/]+/g) ?? [];
  let looked = 0;
  for (const w of words) {
    if (UNIT_AFTER.test(w)) return 'unit';
    if (RESULT_NOUN.test(w)) return 'result';
    if (SKIP.test(w)) continue; // filler does not count against the window
    if (BREAKER.test(w)) return null;
    if (++looked >= LOOKAHEAD) return null;
  }
  return null;
}

/** Does a unit or a comparator own this number? */
function claimed(text: string, t: Token): boolean {
  if (head(text, t) === 'unit') return true;
  return COMPARATOR_BEFORE.test(prevWords(text, t));
}

export interface CountOptions {
  /** Accept "several"/"a handful" as counts (the planner does; detectors did not). */
  fuzzy?: boolean;
  /** Upper bound on an accepted count. */
  max?: number;
}

/**
 * The requested number of results, or null when the ask does not state one.
 *
 * Null is not a failure — it is the common case, and it means "browse", which
 * the caller answers with `DEFAULT_RESULT_COUNT`.
 */
export function extractResultCount(raw: string, opts: CountOptions = {}): number | null {
  const max = opts.max ?? MAX_REQUESTED_COUNT;
  const text = (raw ?? '').toLowerCase().trim();
  if (!text) return null;

  const tokens = tokenize(text);
  if (tokens.length === 0) return null;

  const ok = (t: Token): number | null => {
    if (t.fuzzy && opts.fuzzy === false) return null;
    return t.value >= 1 && t.value <= max ? t.value : null;
  };

  // A span that is nothing BUT a count ("3", "a couple of") — the planner
  // splits multi-group asks and hands us the count fragment on its own.
  if (tokens.length === 1 && tokens[0]!.start === 0 && tokens[0]!.end >= text.replace(/\s+of$/, '').length) {
    return ok(tokens[0]!);
  }

  const free = tokens.filter((t) => !claimed(text, t));

  // 1) A number that counts results — "three movies", "five Lifetime movies".
  for (const t of free) {
    if (head(text, t) === 'result') {
      const v = ok(t);
      if (v != null) return v;
    }
  }

  // 2) A bare number right after a request verb — "give me five", "top 10".
  for (const t of free) {
    if (ASK_BEFORE.test(prevWords(text, t))) {
      const v = ok(t);
      if (v != null) return v;
    }
  }

  // 3) Otherwise they did not ask for a quantity. A number floating in a
  //    sentence is describing the content, not the size of the answer.
  return null;
}
