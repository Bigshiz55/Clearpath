/**
 * QUERY REPAIR (pure, no I/O, client-safe).
 *
 * The forensic audit's three biggest P0 clusters shared one root cause: the
 * catalog endpoints pass the user's raw string to TMDB verbatim, and TMDB
 * search is neither typo-tolerant nor instruction-aware.
 *
 *   - "Creed 2015"            → 0 results   (the year became part of the name)
 *   - "Roocky", "Parsaite"    → 0 results   (one slip is fatal)
 *   - "Gary Sinise movies"    → 0 people    (role phrasing became the name)
 *   - "something good"        → a title page (a film shares the literal words)
 *
 * This module produces DETERMINISTIC repairs for a caller to TRY — it never
 * decides what the user meant. The catalog stays the judge: a candidate counts
 * only if TMDB actually returns something for it, so a legitimate title can
 * never be autocorrected into an unrelated one that doesn't exist.
 */

import { stripRequestFrame } from './requestFrame';

// ── Title + year ──────────────────────────────────────────────────────────

/**
 * Split a disambiguating year off a title.
 *
 * "Creed 2015" names one specific film among several called Creed. The year is
 * an instruction, not part of the name — searched literally it guaranteed zero
 * results, so adding the one detail that identifies the film made the search
 * strictly worse. Never fires when the year IS the whole query: "1917" and
 * "2012" are films.
 */
export function splitTitleYear(raw: string): { title: string; year: number | null } {
  const q = (raw ?? '').trim();
  const m = q.match(/(?:^|\s)\(?((?:19|20)\d{2})\)?(?=\s|$)/);
  if (!m || m.index === undefined) return { title: q, year: null };
  const without = (q.slice(0, m.index) + ' ' + q.slice(m.index + m[0].length))
    .replace(/\s+/g, ' ')
    .trim();
  if (without.length < 2) return { title: q, year: null };
  return { title: without, year: Number(m[1]) };
}

// ── Media-type and version qualifiers ─────────────────────────────────────

export interface QualifiedTitle {
  title: string;
  year: number | null;
  mediaType: 'movie' | 'tv' | null;
  /** True when anything beyond the bare title was recognised and removed. */
  qualified: boolean;
}

/**
 * The words people add to say WHICH one they mean.
 *
 * "Fargo the series", "It 1990 miniseries", "Ghosts the CBS one", "The Office
 * UK", "The Killing Danish original", "CSI NY not CSI Miami" — every qualifier
 * is an instruction, and searched literally every one of them guaranteed zero
 * results. 37 of the audit's remaining P0s were exactly this.
 *
 * The split is a CANDIDATE, not a verdict: the caller runs both readings and
 * lets exact catalog evidence decide, so "The First Lady" (raw resolves
 * exactly) is never damaged by the "the first X" rule that rescues "the first
 * Rocky" (raw resolves to nothing).
 */
const LEADING_QUALIFIERS: [RegExp, 'movie' | 'tv' | null][] = [
  [/^\s*which (?:one|version) is\s+/i, null],
  [/^\s*the (?:first|original|newest|latest)\s+/i, null],
  [/^\s*the (?:uk|us|british|american) version of\s+/i, null],
];
const TRAILING_QUALIFIERS: [RegExp, 'movie' | 'tv' | null][] = [
  [/\s+the (?:tv )?(?:series|show)$/i, 'tv'],
  [/\s+(?:tv|television) (?:series|show)$/i, 'tv'],
  [/\s+(?:the )?mini-?series$/i, 'tv'],
  [/\s+the (?:movie|film)$/i, 'movie'],
  [/\s+the original(?: series| version)?$/i, null],
  [/\s+the (?:remake|reboot)$/i, null],
  [/\s+the (?:uk|us|usa|british|american) (?:version|one|original)$/i, null],
  [/\s+(?:the )?[a-z]+ original$/i, null], // "Danish original"
  // "the Jordan Peele film", "the Pixar one", "the Lifetime remake",
  // "the Michael Mann one" — a name, then a version word.
  [/\s+the [a-z][a-z.'-]*(?: [a-z][a-z.'-]*)? (?:film|movie)$/i, 'movie'],
  [/\s+the [a-z][a-z.'-]*(?: [a-z][a-z.'-]*)? (?:one|version|remake)$/i, null],
  // Bare network / country tokens: "Sherlock BBC", "The Office UK".
  [/\s+(?:uk|us|usa|bbc|cbs|nbc|abc|itv)$/i, null],
];
/**
 * "CSI NY not CSI Miami" — the contrast names a TITLE that is not wanted.
 *
 * A first version cut at every " not " and turned predicate negations into
 * junk titles: "Severance but not as violent" became the "title" "Severance
 * but", whose results then let the router open a title page for what was a
 * recommendation request — 23 live regressions from one greedy regex. A
 * contrast tail must be a NAME: it may not begin with a degree word, a verb,
 * or an article, because "not as violent", "not finish" and "not another
 * Yellowstone" are constraints, and constraints belong to the Judge.
 */
const CONTRAST_TAIL = /\s*,?\s+not\s+(\S+).*$/i;
const CONTRAST_DENY = new Set([
  'as', 'too', 'very', 'really', 'quite', 'so', 'that', 'this', 'it', 'a', 'an', 'the',
  'another', 'about', 'be', 'been', 'being', 'seen', 'watched', 'finish', 'finished',
  'sure', 'my', 'me', 'i', 'we', 'like', 'just', 'only', 'again', 'anymore', 'available',
]);

export function splitTitleQualifiers(raw: string): QualifiedTitle {
  let t = (raw ?? '').trim();
  let mediaType: 'movie' | 'tv' | null = null;
  let qualified = false;

  for (const [re] of LEADING_QUALIFIERS) {
    const cut = t.replace(re, '');
    if (cut !== t && cut.trim().length >= 2) { t = cut.trim(); qualified = true; }
  }
  const contrast = t.match(CONTRAST_TAIL);
  if (
    contrast &&
    contrast.index !== undefined &&
    contrast.index > 0 &&
    !CONTRAST_DENY.has((contrast[1] ?? '').toLowerCase().replace(/[^a-z]/g, ''))
  ) {
    // Also drop a dangling conjunction the cut leaves behind ("X but not Y").
    t = t.slice(0, contrast.index).replace(/\s+(?:but|though|and|or)$/i, '').trim();
    qualified = true;
  }
  // Trailing qualifiers can stack ("the original series"); loop to a fixpoint,
  // but NEVER cut at position 0 — a title cannot be entirely qualifier.
  let changed = true;
  while (changed) {
    changed = false;
    for (const [re, mt] of TRAILING_QUALIFIERS) {
      const m = t.match(re);
      if (m && m.index !== undefined && m.index > 0) {
        t = t.slice(0, m.index).trim();
        if (mt) mediaType = mt;
        qualified = true;
        changed = true;
      }
    }
  }
  const { title, year } = splitTitleYear(t);
  return { title, year, mediaType, qualified: qualified || year !== null };
}

// ── Person phrasing ───────────────────────────────────────────────────────

const PERSON_LEAD =
  /^\s*(?:who\s+is|who'?s|(?:movies?|films?|shows?|series)\s+(?:with|starring|featuring|by|of|from|directed\s+by|written\s+by|created\s+by)|everything\s+(?:with|by|from)|anything\s+(?:with|by)|starring|featuring|directed\s+by|written\s+by|created\s+by|filmography\s+of)\s+/i;

/**
 * A bare preposition opening the remainder — "…with Tom Hanks".
 *
 * Split out from `PERSON_LEAD` because it is far weaker evidence: "With
 * Honors" and "Starring Adam Bakri" are titles, so this one is only trusted
 * when what follows looks like a full name (two words or more). It exists
 * because peeling the request frame off "what should I watch tonight with Tom
 * Hanks" leaves exactly this shape, and it is one of the commonest things
 * anybody says to a microphone.
 */
const PERSON_PREP_LEAD = /^\s*(?:with|starring|featuring)\s+/i;
const PERSON_TAIL =
  /\s+(?:movies?|films?|shows?|series|filmography|roles?|performances?|credits?|movies\s+and\s+shows)\s*[?!.]*\s*$/i;

/**
 * The person a role-phrased query names, or null when there is no phrasing.
 *
 * "Gary Sinise movies", "who is Sylvester Stallone" and "David Fincher
 * filmography" all searched TMDB's person index for the WHOLE sentence and
 * found nobody — half the audit's person category, every case a P0. Only the
 * phrasing is stripped; a bare name returns null so the caller's existing
 * behaviour is untouched.
 */
export function extractPersonName(raw: string): string | null {
  const q = (raw ?? '').trim();
  if (!q) return null;
  /* THE REQUEST FRAME COMES OFF FIRST.
     Measured on the reported production failure: "find me 3 Sylvester Stallone
     movies you think I'll like" matched NEITHER pattern below — no leading
     "movies with", and the sentence ends in "like" rather than in "movies" —
     so the person index was searched for the whole sentence and found nobody.
     With the framing peeled the remainder is "Sylvester Stallone movies", which
     the TAIL pattern has always handled. A frame that strips nothing leaves
     bare-name behaviour byte-identical. */
  const frame = stripRequestFrame(q);
  let t = frame.text;
  /* `stripped` MUST STILL MEAN "PERSON PHRASING WAS FOUND".
     Seeding it from the frame — my first draft — made every framed request look
     like a person request, so "three comedies you think I will love" came back
     with the person "comedies". Peeling the frame changes what the patterns
     below are shown; it must not change what counts as evidence. */
  let stripped = false;
  const lead = t.replace(PERSON_LEAD, '');
  if (lead !== t) { t = lead; stripped = true; }
  if (!stripped) {
    const prep = t.replace(PERSON_PREP_LEAD, '');
    // Two words minimum: a bare "with" is evidence only when a full name follows.
    if (prep !== t && prep.trim().split(/\s+/).length >= 2) { t = prep.trim(); stripped = true; }
  }
  const tail = t.replace(PERSON_TAIL, '');
  if (tail !== t) { t = tail; stripped = true; }
  t = t.replace(/[?!.]+\s*$/, '').trim();
  if (!stripped || t.length < 3) return null;
  // A name is a handful of words with no digits — "movies with 500 days" is
  // not a person, and letting it through would search people for a title.
  if (/\d/.test(t) || t.split(/\s+/).length > 4) return null;
  /* AN ARTICLE IS DROPPED; A QUALITY WORD IS DISQUALIFYING.
     These look alike and are not. "how about a Bruce Willis movie" reduces to
     "a Bruce Willis" — a real name wearing an article, and rejecting it outright
     (my first draft) lost a perfectly good query. "a good heist movie" reduces
     to "a good heist", which is a SUBJECT wearing a name's shape; no article
     removal saves that, and offering it to the person index can only return a
     false match. So the article comes off and the quality word ends it. */
  t = t.replace(/^(?:the|a|an)\s+/i, '').trim();
  if (!t || /^(?:good|best|great|top|new|old|scary|funny|sad|classic|other|more)\b/i.test(t)) return null;
  if (t.split(/\s+/).length > 4) return null;
  return t;
}

// ── Misspellings ──────────────────────────────────────────────────────────

/**
 * Bounded corrections for a query the catalog found NOTHING for.
 *
 * Two operations cover the common slips: collapsing accidentally doubled
 * letters ("Roocky", "boxxing", "Southpaww") and swapping one adjacent pair in
 * the longest word ("Parsaite" → "Parasite", "Raigng" → "Raging", "Knivse" →
 * "Knives"). Deliberately NOT a spellchecker: each candidate costs one catalog
 * lookup, every candidate is verified against the catalog before anyone sees
 * it, and the list is capped so a hostile string cannot fan out.
 *
 * Only ever consulted after the raw query returned zero results, so a real
 * title that happens to look misspelled can never be "corrected" away.
 */
export function misspellingCandidates(raw: string, max = 40): string[] {
  const q = (raw ?? '').trim();
  if (q.length < 3 || q.length > 60 || !/[a-z]/i.test(q)) return [];
  const out: string[] = [];
  const push = (s: string) => {
    const v = s.replace(/\s+/g, ' ').trim();
    if (v && v.toLowerCase() !== q.toLowerCase() && !out.some((o) => o.toLowerCase() === v.toLowerCase())) {
      out.push(v);
    }
  };

  // 1. Repeated-letter runs, shortened ONE AT A TIME. Collapsing every run at
  //    once turned "Creedd" into "cred" and "Warriorr" into "warior" — the
  //    typo'd double and the legitimate one died together. Shortening each run
  //    individually keeps "Creed"'s real "ee" while removing the stray "d".
  const runs = [...q.matchAll(/([a-z])\1+/gi)];
  for (const r of runs) {
    push(q.slice(0, r.index) + r[0]!.slice(1) + q.slice(r.index! + r[0]!.length));
  }
  // …and the everything-collapsed form as a fallback for double slips.
  if (runs.length > 1) push(q.replace(/([a-z])\1+/gi, '$1'));

  // 2. A space that slipped one position — "TheG odfather", "HappyV alley",
  //    "Murder, Sh eWrote". Swapping each space with its neighbouring letter
  //    restores the boundary. Deterministic and cheap: one candidate per side
  //    per space.
  for (let i = 0; i < q.length; i++) {
    if (q[i] !== ' ') continue;
    if (i + 1 < q.length && /[a-z]/i.test(q[i + 1]!)) {
      push(q.slice(0, i) + q[i + 1] + ' ' + q.slice(i + 2));
    }
    if (i > 0 && /[a-z]/i.test(q[i - 1]!)) {
      push(q.slice(0, i - 1) + ' ' + q[i - 1] + q.slice(i + 1));
    }
  }

  // 3. Adjacent transpositions in EVERY meaningful word. Longest word first —
  //    long words carry most slips, so their repairs land in the caller's
  //    first lookup chunk — but the cap is sized so EVERY word's every
  //    position fits: with a tight cap, no ordering covers both
  //    "A Christmas Pirnce" (slip in the short word) and "Betetr Call Saul"
  //    (slip deep in the long one). Candidates are only ever spent on
  //    zero-result queries, chunked and deadline-gated by the caller.
  const words = q.split(/\s+/);
  const order = words
    .map((w, i) => ({ w, i }))
    .filter(({ w }) => w.length >= 3 && !/\d/.test(w) && !/[^ -ɏ]/.test(w))
    .sort((a, b) => b.w.length - a.w.length);
  for (const { w, i: li } of order) {
    for (let i = 0; i + 1 < w.length && out.length < max; i++) {
      if (w[i]!.toLowerCase() === w[i + 1]!.toLowerCase()) continue;
      const swapped = w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2);
      push([...words.slice(0, li), swapped, ...words.slice(li + 1)].join(' '));
    }
  }
  return out.slice(0, max);
}

/**
 * DELETION-class repairs: the typo is a MISSING letter ("Holday" → "Holiday",
 * "Succssion" → "Succession", "Cred III" → "Creed III").
 *
 * Recovering a deletion means trying insertions, which fans out fast — so this
 * is a SEPARATE, last-resort wave the caller runs only after everything else
 * found nothing, with the alphabet cut to the ten letters that account for
 * most English text and the total hard-capped. Stopwords and numerals are
 * skipped: nobody drops a letter from "the" and notices.
 */
const INSERT_LETTERS = ['e', 'a', 'i', 'o', 'u', 'r', 's', 'n', 't', 'l'] as const;
const SKIP_WORDS = new Set(['the', 'a', 'an', 'of', 'at', 'in', 'and', 'or', 'to']);

export function insertionCandidates(raw: string, max = 120): string[] {
  const q = (raw ?? '').trim();
  if (q.length < 3 || q.length > 40 || !/[a-z]/i.test(q)) return [];
  const words = q.split(/\s+/);
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (wi: number, fixed: string) => {
    const cand = [...words.slice(0, wi), fixed, ...words.slice(wi + 1)].join(' ');
    const k = cand.toLowerCase();
    if (!seen.has(k) && k !== q.toLowerCase()) { seen.add(k); out.push(cand); }
  };
  // Latin words only (≤ U+024F, diacritics included): an emoji is a surrogate
  // PAIR, so "inserting a letter" into 🎄 splits it into two lone surrogates —
  // a mangled candidate that can still get catalog hits and win the wave. CJK
  // and other scripts are equally not letter-slip territory.
  const eligible = words
    .map((w, wi) => ({ w, wi }))
    .filter(({ w }) => w.length >= 2 && !SKIP_WORDS.has(w.toLowerCase()) && !/^[ivxlcdm]+$/i.test(w) && !/\d/.test(w) && !/[^ -ɏ]/.test(w));

  // FIRST: re-double each existing letter. Doubled letters are where deletions
  // cluster — "Unforgoten" is "Unforgotten" minus one of its "tt" — and this
  // class is only n candidates for the whole query.
  for (const { w, wi } of eligible) {
    for (let pos = 0; pos < w.length && out.length < max; pos++) {
      if (/[a-z]/i.test(w[pos]!)) push(wi, w.slice(0, pos + 1) + w[pos] + w.slice(pos + 1));
    }
  }

  // THEN the alphabet wave, ROUND-ROBIN across words by position so a long
  // first word cannot exhaust the cap before the word that actually carries
  // the deletion gets a turn ("Slow Horse" → "Slow Horses").
  const maxLen = Math.max(0, ...eligible.map(({ w }) => w.length));
  for (let pos = 1; pos <= maxLen && out.length < max; pos++) {
    for (const { w, wi } of eligible) {
      if (pos > w.length) continue;
      for (const ch of INSERT_LETTERS) {
        if (out.length >= max) break;
        push(wi, w.slice(0, pos) + ch + w.slice(pos));
      }
    }
  }
  return out;
}

// ── Generic phrases ───────────────────────────────────────────────────────

/**
 * Words that carry no identity — a query made ONLY of these names nothing.
 *
 * "something good", "a movie", "newer", "not that" and "the sequel" each
 * opened an unrelated title page because some film shares those literal words.
 * A phrase with no identifying token is a request, never a destination.
 *
 * Famous one-word titles that are also pronouns ("It", "Us", "Them") are kept
 * OUT of this list on purpose — typing "It" must keep finding It.
 */
const GENERIC_WORDS = new Set([
  'a', 'an', 'the', 'this', 'these', 'those', 'that', 'one', 'ones', 'things',
  'stuff', 'else', 'other', 'another', 'guy', 'girl', 'not', 'no', 'what', 'whats',
  // NOT here on purpose: 'thing' (The Thing), 'it', 'us', 'them', 'her', 'you' —
  // each is a famous title, and a generic list that swallows a title is the
  // original defect wearing a new hat.
  'which', 'who', 'something', 'anything', 'nothing', 'good', 'great', 'bad', 'nice',
  'fun', 'cool', 'best', 'better', 'new', 'newer', 'newest', 'old', 'older', 'oldest',
  'recent', 'latest', 'first', 'second', 'third', 'next', 'last', 'sequel', 'prequel',
  'movie', 'movies', 'film', 'films', 'show', 'shows', 'series', 'me', 'my', 'i', 'we',
  'for', 'to', 'with', 'about', 'watch', 'see', 'tonight', 'now', 'please', 'ok',
  'okay', 'maybe', 'more', 'less', 'again', 'different', 'like', 'want', 'need',
]);

/** True when every token is generic (single letters count as generic). */
export function isGenericPhrase(raw: string): boolean {
  const tokens = (raw ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0 || tokens.length > 6) return false;
  return tokens.every((t) => t.length === 1 || GENERIC_WORDS.has(t));
}
