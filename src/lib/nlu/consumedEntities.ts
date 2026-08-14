/**
 * THE ENTITY BOUNDARY — language spent once cannot be spent again.
 *
 * Two readers used to consume the same words with neither aware of the other.
 * Person resolution read "Stallone" and produced a cast id; subject detection
 * then read the SAME token and produced a strict content subject, so the query
 * demanded films that ARE ABOUT Stallone as well as films he is IN. Nothing is
 * about an actor's surname, so every legitimate candidate was rejected on
 * centrality and the ask returned nothing.
 *
 *   Language already consumed as a RESOLVED ENTITY may not be reinterpreted
 *   as a generic content subject.
 *
 * THE INVARIANT IS ABOUT AN OCCURRENCE, NOT A VOCABULARY — and the first
 * implementation of this file got that wrong in both directions at once. It
 * tokenised the resolved name and deleted every occurrence of every token
 * across the whole utterance, which is
 *
 *   TOO BROAD — "a Tom Cruise cruise ship movie" spends `cruise` on the person
 *     ONCE. Deleting the vocabulary took the second one too, and the subject
 *     collapsed from "cruise ship" to "ship". The token is legitimate in one
 *     position and consumed in the other, so no stop-word list can tell them
 *     apart; only position can.
 *
 *   TOO NARROW — the resolver promises FUZZY identity: "Stalone" resolves to
 *     Sylvester Stallone. Masking the catalog's spelling left the user's
 *     spelling untouched, so `stalone` walked straight into subject detection
 *     and became a strict subject that no film on earth satisfies. Measured:
 *     subjectCanonical "stalone".
 *
 * So a consumed entity carries BOTH namings, and they are not interchangeable:
 *
 *   spokenAs      the user's own wording that the extractor attributed here
 *   resolvedName  what the catalog says that wording is
 *
 * Each token of the RESOLVED IDENTITY is spent exactly once, matched against
 * the user's own words — so a name the user spelled their own way is still
 * spent, and a word the user used twice is only spent once.
 *
 * WHAT IS DELIBERATELY NOT SPENT. The legacy extractor cannot say which of the
 * words it sent to the catalog are the name: for "I watched 3 movies yesterday.
 * Give me a Stallone movie." it attributes "watched yesterday stallone" and has
 * no idea that two of those are anecdote. `spokenAs` is therefore honest about
 * what it is — the language the extractor ATTRIBUTED to this entity — and never
 * claims to be a contiguous source span. Only tokens that also match the
 * resolved identity are consumed, so the residue survives untouched and that
 * separate defect stays visible instead of being papered over here.
 *
 * EVIDENCE, NOT GUESSWORK. Both fields come from whatever already resolved the
 * entity. This module never decides who is a person, has no vocabulary of its
 * own and cannot acquire one. That is also why the canonical interpreter's
 * `PersonReference.span` can feed `spokenAs` directly later: it is the same
 * field from a better extractor — one that CAN give a true span — not a
 * different mechanism.
 *
 * PURE. No I/O, no clock, no environment.
 */

/**
 * One entity that resolution already paid for.
 *
 * `spokenAs` is what the extractor attributed to this entity in the user's own
 * words. Depending on the extractor that may be a true source span (the
 * canonical layer) or a filtered token bag (the legacy `resolvePerson`); it is
 * never assumed to be contiguous, and nothing here depends on it being so.
 */
export interface ConsumedEntity {
  spokenAs: string;
  /** The catalog's canonical name for what `spokenAs` resolved to. */
  resolvedName: string;
}

/** Name particles are too short to spend safely — dropping "de" or "la" as a
 *  whole word would eat ordinary language for no benefit, since a two-letter
 *  token can never be the content subject the walk-back is looking for. */
const MIN_TOKEN = 3;

/** Below this length a one-character difference is a different word ("tom" vs
 *  "ton"), not a misspelling, so short tokens must match exactly. */
const MIN_FUZZY_LEN = 5;

const WORD = /[a-z0-9']+/gi;

/** Levenshtein distance, abandoned as soon as it exceeds `max`. */
function withinDistance(a: string, b: string, max: number): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
      if (cur[j]! < best) best = cur[j]!;
    }
    if (best > max) return false;
    prev = cur;
  }
  return prev[b.length]! <= max;
}

/**
 * Does this word in the utterance name that part of the resolved identity?
 * Exact for short tokens; one edit for anything long enough that a single
 * character cannot change which word was meant.
 */
function namesTheSame(spoken: string, nameToken: string): boolean {
  if (spoken === nameToken) return true;
  return Math.max(spoken.length, nameToken.length) >= MIN_FUZZY_LEN && withinDistance(spoken, nameToken, 1);
}

const tokensOf = (s: string): string[] =>
  (String(s ?? '').toLowerCase().match(WORD) ?? []).filter((t) => t.length >= MIN_TOKEN);

/** One word of the utterance, and where it sits. */
interface Word {
  value: string;
  start: number;
  end: number;
}

/**
 * THE NAME AS A COHERENT OCCURRENCE — the contract this file actually owes.
 *
 * Locating each name token independently is what "first match" means, and it
 * picks the wrong words the moment one of them appears earlier for an unrelated
 * reason. Measured on "Cruise ships sound fun. Give me a Tom Cruise movie.": the
 * `cruise` of "Cruise ships" was spent, the ACTOR's `cruise` survived beside
 * `movie`, and `subjectCanonical` came back "cruise" — the exact defect this
 * whole module exists to prevent, restored from the other direction.
 *
 * Searching from the end only reverses which sentence breaks. The fix is to
 * stop treating the name as a bag of independent lookups: find WHERE the person
 * was named, then spend only what is inside it.
 */
function locateOccurrence(
  found: readonly Word[],
  nameTokens: readonly string[],
  attributed: ReadonlySet<string>,
  consumed: ReadonlySet<number>,
): number[] {
  const free = (i: number) => !consumed.has(i) && found[i]!.value.length >= MIN_TOKEN;

  /* 1. THE NAME, SAID AS A NAME. When the resolved name appears as a
        contiguous run of words, that run IS the occurrence and needs no other
        evidence — "Tom Cruise" adjacent is not a coincidence the way a lone
        "cruise" is. Fuzzy per token, so a misspelling still matches here. */
  if (nameTokens.length > 0) {
    for (let i = 0; i + nameTokens.length <= found.length; i++) {
      let all = true;
      for (let k = 0; k < nameTokens.length; k++) {
        if (!free(i + k) || !namesTheSame(found[i + k]!.value, nameTokens[k]!)) {
          all = false;
          break;
        }
      }
      if (all) return Array.from({ length: nameTokens.length }, (_, k) => i + k);
    }
  }

  /* 2. THE LEGACY BAG. `resolvePerson` hands over a filtered token bag, not a
        span, and the words it attributed may be scattered ("watched yesterday
        stallone") or partial (the utterance said only a surname). Here the
        resolved identity is used as a SEQUENCE — matched in order, narrowest
        window wins — never as independent global lookups, and always behind the
        provenance gate. */
  const eligible = (i: number, token: string) =>
    free(i) && attributed.has(found[i]!.value) && namesTheSame(found[i]!.value, token);

  // Drop name tokens the utterance never offered (a surname-only ask never says
  // "sylvester"), then require the rest to appear in the name's own order.
  const present = nameTokens
    .map((t) => found.map((_, i) => i).filter((i) => eligible(i, t)))
    .filter((positions) => positions.length > 0);

  // Shrink from the FRONT on failure: a name's later parts are its identifying
  // ones, so "…Stallone" survives an unmatchable "Sylvester" rather than the
  // reverse.
  for (let drop = 0; drop < present.length; drop++) {
    const lists = present.slice(drop);
    let best: number[] | null = null;
    for (const start of lists[0]!) {
      const picked = [start];
      let cursor = start;
      let ok = true;
      for (let k = 1; k < lists.length; k++) {
        const next = lists[k]!.find((p) => p > cursor);
        if (next === undefined) {
          ok = false;
          break;
        }
        picked.push(next);
        cursor = next;
      }
      if (!ok) continue;
      const span = picked[picked.length - 1]! - picked[0]!;
      if (best === null || span < best[best.length - 1]! - best[0]!) best = picked;
    }
    if (best !== null) return best;
  }

  return [];
}

/**
 * Blank out the occurrence that entity resolution already spent, leaving the
 * rest of the sentence and its word order untouched.
 *
 * One occurrence per entity — not one per token, and not every match in the
 * utterance. A second use of the same word is the user talking about something
 * else and survives.
 *
 * Whole words only — a resolved "Hunt" cannot hollow out "manhunt".
 */
export function maskConsumedEntities(
  text: string,
  entities: readonly ConsumedEntity[] | undefined | null,
): string {
  if (!text || !entities || entities.length === 0) return text;

  const found: Word[] = [];
  for (const m of text.matchAll(WORD)) {
    found.push({ value: m[0]!.toLowerCase(), start: m.index!, end: m.index! + m[0]!.length });
  }
  if (found.length === 0) return text;

  const consumed = new Set<number>();
  for (const entity of entities) {
    for (const i of locateOccurrence(
      found,
      tokensOf(entity.resolvedName),
      new Set(tokensOf(entity.spokenAs)),
      consumed,
    )) {
      consumed.add(i);
    }
  }
  if (consumed.size === 0) return text;

  // Rebuild left to right, replacing each spent occurrence with a space —
  // never an empty string, which would fuse its neighbours into a word that was
  // never said.
  let out = '';
  let cursor = 0;
  for (const i of [...consumed].sort((a, b) => a - b)) {
    const w = found[i]!;
    out += text.slice(cursor, w.start) + ' ';
    cursor = w.end;
  }
  return out + text.slice(cursor);
}
