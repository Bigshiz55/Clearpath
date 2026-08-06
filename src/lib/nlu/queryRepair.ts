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

// ── Person phrasing ───────────────────────────────────────────────────────

const PERSON_LEAD =
  /^\s*(?:who\s+is|who'?s|movies?\s+(?:with|starring|featuring|by|of|from)|films?\s+(?:with|starring|featuring|by|of|from)|shows?\s+(?:with|starring|featuring|by|of|from)|everything\s+(?:with|by|from)|anything\s+(?:with|by)|starring|featuring|directed\s+by|written\s+by|created\s+by|filmography\s+of)\s+/i;
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
  let t = q;
  let stripped = false;
  const lead = t.replace(PERSON_LEAD, '');
  if (lead !== t) { t = lead; stripped = true; }
  const tail = t.replace(PERSON_TAIL, '');
  if (tail !== t) { t = tail; stripped = true; }
  t = t.replace(/[?!.]+\s*$/, '').trim();
  if (!stripped || t.length < 3) return null;
  // A name is a handful of words with no digits — "movies with 500 days" is
  // not a person, and letting it through would search people for a title.
  if (/\d/.test(t) || t.split(/\s+/).length > 4) return null;
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
export function misspellingCandidates(raw: string, max = 12): string[] {
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

  // 2. Adjacent transpositions — but only in the LONGEST word, where a slip is
  //    likeliest and where n candidates stay affordable.
  const words = q.split(/\s+/);
  let li = 0;
  words.forEach((w, i) => { if (w.length > (words[li]?.length ?? 0)) li = i; });
  const w = words[li]!;
  for (let i = 0; i + 1 < w.length && out.length < max; i++) {
    if (w[i]!.toLowerCase() === w[i + 1]!.toLowerCase()) continue;
    const swapped = w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2);
    push([...words.slice(0, li), swapped, ...words.slice(li + 1)].join(' '));
  }
  return out.slice(0, max);
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
