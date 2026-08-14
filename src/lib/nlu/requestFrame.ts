/**
 * THE SENTENCE AROUND THE REQUEST.
 *
 * ── THE PRODUCTION FAILURE THIS FIXES ─────────────────────────────────────
 * "find me 3 Sylvester Stallone movies you think I'll like" returned NOTHING.
 * Not a bad answer — an empty one, on a query naming one of the most findable
 * actors alive. Measured against the shipped code:
 *
 *   extractPersonName(…)  -> null   (no leading "movies with", and the sentence
 *                                    ends in "like", not in "movies")
 *   resolvePersonId(…)    -> null   ("you think i'll like" survives the
 *                                    stopword list, leaving 6 words, and the
 *                                    2–4 word guard rejects it)
 *
 * Both person extractors are keyed to a narrow set of phrasings, and BOTH miss
 * every natural spoken one. That is the whole defect: the more conversational
 * the request — which is exactly what a microphone produces — the more likely
 * it was to return zero results. A person typing "Sylvester Stallone movies"
 * was served; a person SAYING what they wanted was not.
 *
 * ── WHY A SHARED STRIPPER AND NOT MORE PATTERNS ───────────────────────────
 * The instinct is to add "find me" to one regex and "you think I'll like" to
 * another. That is how these two extractors got out of step in the first
 * place: each grew its own list, each covers a different subset, and a fix to
 * one silently leaves the other broken. There is only one thing going on —
 * a request has SCAFFOLDING around its SUBSTANCE — so it is peeled once, here,
 * and every extractor downstream receives the substance.
 *
 *   "find me 3 Sylvester Stallone movies you think I'll like"
 *    └── lead ──┘ └c┘ └──── substance ─────┘ └──── tail ─────┘
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ──────────────────────────────────────
 * It does not remove content words. Genre, subject, mood, provider and title
 * words all survive, because they are the request. Only the framing goes:
 * how the user asked, how many they asked for, and their statement that the
 * answer should suit them. Each of those is captured rather than discarded —
 * `count` and `personalized` come back as facts, because "3" is an instruction
 * and "you think I'll like" is the difference between a catalogue listing and
 * a recommendation.
 *
 * NEVER STRIPS TO NOTHING. If peeling would empty the query the original is
 * returned untouched, because a title made entirely of framing words is still a
 * title — "Get Out", "Us", "Some Like It Hot".
 *
 * ── WHERE THIS SITS, AND WHAT IT MAY NEVER BECOME ────────────────────────
 * This is a LEXICAL PRIMITIVE and it is deliberately the junior partner. It
 * knows which framings are real — the lead phrases, the count forms, the
 * personalization tail, and the discipline that keeps "Get Out" and "A Few Good
 * Men" from looking like orders. It has NO opinion about what a request is FOR.
 *
 * `src/lib/interpret/` is the canonical semantic front door: clause role,
 * `kind`, `requestedCount`, person spans, and the CREDIT ROLE this file cannot
 * express at all. It CONSUMES this module (see `classifyClause`) rather than
 * re-deriving the same framing, which is what stops `/api/ask` from eventually
 * disagreeing with itself depending on which layer answered.
 *
 * SO: nothing semantic may be added here. No roles, no relations, no genre or
 * subject extraction, no decision about whether something should be executed.
 * If a change needs any of those, it belongs in `interpret/` and this file
 * should be given a smaller job, not a bigger one.
 * `interpret/inheritance.test.ts` enforces the boundary in both directions.
 *
 * PURE. No I/O, no clock.
 */

/** Spoken and typed ways of opening a request. Order matters — longest first. */
const LEAD = [
  /^\s*(?:hey\s+)?(?:watch\s*verd(?:1|i)ct[,:]?\s*)?/i,
  /^\s*(?:can|could)\s+you\s+(?:please\s+)?(?:find|show|get|give|recommend|suggest)\s+(?:me|us)?\s*/i,
  /^\s*(?:what|which)\s+(?:should|shall|can|could)\s+(?:i|we)\s+watch\s*(?:tonight|today|now)?\s*/i,
  /^\s*(?:i(?:'m| am)\s+)?looking\s+for\s*/i,
  /^\s*i\s+(?:want|need|feel\s+like)\s+(?:to\s+watch\s+)?/i,
  /* THE SHORT VERBS NEED AN OBJECT OR A QUANTITY BEHIND THEM.
     "get", "find", "show", "give" and "list" are request verbs and they are
     also the opening words of films: the unrestricted form of this pattern
     turned "Get Out" into "Out". So a bare verb is only framing when it is
     followed by the person being served ("find ME") or by how many they want
     ("find 3", "find some") — both of which a title never supplies. */
  /^\s*(?:please\s+)?(?:find|show|get|give|list)\s+(?:me|us)\s*/i,
  /^\s*(?:please\s+)?(?:find|show|get|give|list)\s+(?=\d|some\s|any\s|a\s+few\s|a\s+couple\s|a\s+handful\s)/i,
  /^\s*(?:please\s+)?(?:pull\s+up|recommend|suggest)\s+(?:me|us)?\s*/i,
  /^\s*(?:how\s+about|what\s+about|let'?s\s+watch|got\s+any)\s*/i,
  /^\s*(?:any|some)\s+(?:good\s+)?(?:recommendations?|ideas?|suggestions?)\s+for\s*/i,
];

/**
 * A stated quantity, as a digit or a word.
 *
 * "a couple" is 2 and "a few" is 3 by the ordinary English reading. They are
 * included because a spoken request uses them constantly, and treating them as
 * unparseable meant falling back to a default page of results for someone who
 * had just told us how many they wanted.
 */
const COUNT_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, 'a couple of': 2, 'a couple': 2,
  'a few': 3, 'a handful of': 5, 'a handful': 5,
};
/** Digits: "3 Stallone movies". Nothing is titled that, so this is always framing. */
const DIGIT_LEAD = /^\s*(\d{1,2})\s+(?=\S)/;

/**
 * Words: "three", "a few", "some".
 *
 * THESE ARE ONLY FRAMING WHEN SOMETHING ELSE ALREADY PROVED IT IS A REQUEST,
 * and that restriction is not caution — it is a correction. The first draft
 * treated a leading word-count as framing unconditionally and turned
 *
 *   "Two Weeks Notice"  ->  "Weeks Notice"
 *   "A Few Good Men"    ->  "Good Men"
 *   "Three Billboards…" ->  "Billboards…"
 *   "Some Like It Hot"  ->  "Like It Hot"
 *
 * every one of them a real film, every one of them broken in the name of fixing
 * search. Films open with a quantity constantly; requests open with a quantity
 * only after saying "find me". So a digit stands on its own and a word does not:
 * it counts only once a lead phrase has been removed, which is the evidence that
 * this is somebody asking rather than somebody naming.
 */
const WORD_LEAD = new RegExp(
  `^\\s*(?:${Object.keys(COUNT_WORDS)
    .sort((a, b) => b.length - a.length)
    .map((w) => w.replace(/ /g, '\\s+'))
    .join('|')})\\s+(?=\\S)`,
  'i',
);

/**
 * A quantity that names no number — and it carries the same restriction, for
 * the same reason: "Some Like It Hot" and "Any Given Sunday" are films.
 */
const VAGUE_LEAD = /^\s*(?:some|any)\s+(?=\S)/i;

/**
 * The trailing clause where a person says the answer should suit them.
 *
 * THIS IS THE HALF THAT WAS MISSING EVERYWHERE. Every extractor in the codebase
 * knew about "movies with X"; none knew that a request can END with an opinion
 * about the asker. It is the most natural thing to say out loud, and it is what
 * broke the reported query. Matched greedily to the end of the sentence,
 * because by construction nothing meaningful follows it.
 */
const PERSONAL_TAIL =
  /\s+(?:that\s+|which\s+)?(?:you\s+(?:think|reckon|figure)\s+)?(?:i|we)(?:'|’)?(?:d|ll)?\s*(?:would\s+|will\s+|might\s+|should\s+|probably\s+)?(?:like|love|enjoy|dig|be\s+into|go\s+for)\b.*$/i;

/** A trailing "you think", left when the clause is phrased the other way round. */
const THINK_TAIL = /\s+(?:that\s+)?you\s+(?:think|reckon|might\s+think)\b\s*$/i;

/** "…for me", "…for us" — framing, and it can follow either of the above. */
const FOR_TAIL = /\s+for\s+(?:me|us|myself|ourselves)\b\s*$/i;

export interface RequestFrame {
  /** The request with its scaffolding removed. Never empty. */
  text: string;
  /** A stated count, when the user gave one. */
  count: number | null;
  /** Did they ask for something suited to THEM, rather than a plain listing? */
  personalized: boolean;
  /** Was anything actually removed? False means `text === input`. */
  stripped: boolean;
}

/**
 * Peel the framing off a request.
 *
 * Idempotent: framing already removed cannot be removed again, so a caller
 * that peels twice gets the same answer, and a downstream extractor that also
 * strips its own phrasing composes cleanly with this rather than fighting it.
 */
export function stripRequestFrame(raw: string): RequestFrame {
  const input = (raw ?? '').trim();
  if (!input) return { text: '', count: null, personalized: false, stripped: false };

  let t = input;
  let count: number | null = null;
  let personalized = false;

  /* A DIGIT NEEDS NO PERMISSION. Nothing in the catalogue is called
     "3 Stallone movies", so a leading number is framing wherever it appears —
     including in "3 Sylvester Stallone movies", typed with no request verb. */
  const digit = t.match(DIGIT_LEAD);
  if (digit) {
    const n = Number(digit[1]);
    const rest = t.slice(digit[0].length).trim();
    if (n >= 1 && n <= 20 && rest.length > 0) {
      count = n;
      t = rest;
    }
  }

  /* LEADS, TO A FIXPOINT. "can you find me a few Stallone movies" carries two
     phrases and one pass would leave the second. `leadStripped` is the evidence
     that unlocks the word-forms below: it means the user said how they were
     asking, which a film title never does. */
  let leadStripped = false;
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 6) {
    changed = false;
    for (const re of LEAD) {
      const next = t.replace(re, '');
      if (next !== t && next.trim().length > 0) {
        t = next.trim();
        changed = true;
        leadStripped = true;
      }
    }
    if (count === null) {
      const d = t.match(DIGIT_LEAD);
      if (d) {
        const n = Number(d[1]);
        const rest = t.slice(d[0].length).trim();
        if (n >= 1 && n <= 20 && rest.length > 0) {
          count = n;
          t = rest;
          changed = true;
        }
      }
    }
    if (leadStripped && count === null) {
      const w = t.match(WORD_LEAD);
      if (w) {
        const n = COUNT_WORDS[w[0].trim().toLowerCase().replace(/\s+/g, ' ')];
        const rest = t.slice(w[0].length).trim();
        if (n != null && rest.length > 0) {
          count = n;
          t = rest;
          changed = true;
        }
      }
    }
    if (leadStripped) {
      const vague = t.replace(VAGUE_LEAD, '');
      if (vague !== t && vague.trim().length > 0) {
        t = vague.trim();
        changed = true;
      }
    }
  }

  /* TAILS. The personalization clause runs to the end of the sentence by
     construction — "…you think I'll like" has nothing meaningful after it — so
     it is matched greedily and removed whole. */
  for (const re of [PERSONAL_TAIL, THINK_TAIL, FOR_TAIL]) {
    const next = t.replace(re, '');
    if (next !== t && next.trim().length > 0) {
      t = next.trim();
      personalized = true;
    }
  }

  t = t.replace(/[\s,]+$/, '').replace(/\s+/g, ' ').trim();

  /* NEVER TO NOTHING. "The Holiday" opens with a lead word and "Like a Boss"
     ends in one; a title made entirely of framing is still a title, and an
     empty query is strictly worse than an unstripped one. */
  if (!t) return { text: input, count, personalized, stripped: false };

  return { text: t, count, personalized, stripped: t !== input };
}
