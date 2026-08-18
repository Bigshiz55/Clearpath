import 'server-only';
import { getPersonCreditCount, searchPeople } from '@/lib/tmdb/client';
import type { CreditRole } from '@/lib/interpret/types';

/**
 * IDENTITY FOR AN ALREADY-EXTRACTED PERSON REFERENCE.
 *
 * The canonical layer says a person was named and how they were spoken of; it
 * may never say WHO that is. This module is the other half: it takes the span
 * and asks the real people catalog, and it is the only place allowed to turn
 * "Sylvester Stallone" into a TMDB id.
 *
 * WHY THIS EXISTS RATHER THAN `resolvePersonId(text)`. The legacy resolver took
 * the WHOLE UTTERANCE and dug a name out of it with a stopword list. Measured on
 * the live preview, "I watched 3 movies yesterday. Give me a Stallone movie."
 * reached TMDB as the query `"watched yesterday stallone"` — the anecdote's
 * residue glued to the name, because "watched" and "yesterday" are not in
 * `NON_NAME` and the list can never be finished. A second reading of the same
 * sentence is exactly the defect the canonical layer removes, so on this path
 * the sentence is read ONCE and only the span arrives here.
 *
 * ── POPULARITY IS NOT IDENTITY ───────────────────────────────────────────
 *
 * `resolvePerson` (the AI tool path) takes TMDB's first hit. For a full name
 * that is fine — the catalog's top match for "Sylvester Stallone" is not in
 * doubt. For a BARE SURNAME it is not fine: "Stallone" matches Sylvester, Frank,
 * Sage and Jennifer, and taking the most popular means confidently attaching the
 * wrong human being to someone's evening. A clarification is the better answer,
 * and the product already supports one.
 *
 * So identity is earned by evidence, and the two shapes have different bars:
 *
 *   FULL NAME  (two or more tokens) — an exact, case-insensitive name match is
 *              decisive. Failing that, the top hit is accepted only if it has
 *              known-for credits, which is what separates a real public figure
 *              from an empty catalog stub.
 *
 *   MONONYM    (one token) — accepted ONLY when exactly one candidate with real
 *              credits carries that token in their name. Two or more and the
 *              answer is `ambiguous`, carrying the candidates so the route can
 *              ask rather than guess.
 */

export interface ResolvedPerson {
  kind: 'resolved';
  id: number;
  name: string;
  /** Why we believe this is the person — surfaced in the receipt, never
   *  invented, and each label states exactly what was proven:
   *  - exact-name-match: the ONE catalog person with this normalized name
   *  - sole-credited-exact-match: several share the exact name; only one has
   *    any credits, and an uncredited stub is not a rival identity
   *  - unique-credited-name-match: no exact hit, but every spoken token
   *    matches this candidate's name in order (fuzzy per token) and NO other
   *    credited candidate can say the same
   *  - sole-credited-match: mononym — exactly one credited person bears the
   *    token in their name */
  evidence:
    | 'exact-name-match'
    | 'sole-credited-exact-match'
    | 'sole-role-consistent-exact-match'
    | 'dominant-filmography-exact-match'
    | 'unique-credited-name-match'
    | 'sole-credited-match';
}

export interface AmbiguousPerson {
  kind: 'ambiguous';
  spokenAs: string;
  candidates: Array<{ id: number; name: string; knownFor: string }>;
}

export interface UnresolvedPerson {
  kind: 'unresolved';
  spokenAs: string;
  /**
   * Catalog names that came back but were not defensible as THIS person.
   *
   * Carried so the route can ask "did you mean…?" instead of dead-ending. They
   * are near misses, never answers: nothing here has been accepted, and the
   * caller must not treat them as a resolution.
   */
  nearMisses?: Array<{ id: number; name: string; knownFor: string }>;
}

export type PersonResolution = ResolvedPerson | AmbiguousPerson | UnresolvedPerson;

export interface PersonReferenceInput {
  /** Exactly as the user named them. Never the whole sentence. */
  spokenAs: string;
  role: CreditRole;
}

/**
 * A NAME, WITH THE CHARACTERS THAT CARRY NO IDENTITY REMOVED.
 *
 * ── THE PRODUCTION FAILURE THIS FIXES ─────────────────────────────────────
 * This collapsed whitespace and lowercased, and did nothing else. TMDB spells
 * him "Samuel L. Jackson"; a person types "Samuel L Jackson". Those normalized
 * to different strings, the exact-match branch missed, and the resolver
 * returned UNRESOLVED — after which the required constraint was silently
 * dropped and the query ran as a generic recommendation. Three unrelated 2026
 * films came back at "100 match".
 *
 * A period is not evidence about who someone is. Neither is an apostrophe, a
 * hyphen, or an accent — "Gordon-Levitt" and "Gordon Levitt" are one person,
 * as are "D'Amico" and "DAmico", "Peña" and "Pena".
 *
 * WHAT IS DELIBERATELY NOT DONE HERE: nothing fuzzy. Letters are never
 * changed, dropped or transposed, so two genuinely different names stay
 * different — the exactness of the exact-match branch is preserved, it is
 * simply computed over the part of the string that means something.
 */
const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    // Periods and apostrophes join what they separate: "l." -> "l",
    // "d'amico" -> "damico".
    .replace(/[.\u2018\u2019']/g, '')
    // Hyphens and dashes separate what they join: "gordon-levitt" -> two words.
    .replace(/[-\u2010-\u2015]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

/* Fuzzy identity, at the same bar the entity boundary uses
   (lib/nlu/consumedEntities.ts): a token shorter than five characters must
   match exactly — one edit in "tom" is a different word — while a longer
   token tolerates a single edit, so "Stalone" still names Stallone. */
const MIN_FUZZY_LEN = 5;

function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

const tokenMatches = (spoken: string, candidate: string): boolean =>
  spoken === candidate ||
  (Math.max(spoken.length, candidate.length) >= MIN_FUZZY_LEN && withinOneEdit(spoken, candidate));

/**
 * Every spoken token names a token of the candidate's name, IN ORDER.
 * "Robert Downy" matches both "Robert Downey" and "Robert Downey Jr." —
 * which is exactly why matching alone is never resolution: it must also be
 * UNIQUE among credited candidates before an identity is claimed.
 */
function nameMatchesSpoken(spokenTokens: readonly string[], candidateName: string): boolean {
  if (spokenTokens.length === 0) return false;
  const candidateTokens = norm(candidateName).split(' ');
  let at = 0;
  for (const spoken of spokenTokens) {
    let found = -1;
    for (let i = at; i < candidateTokens.length; i++) {
      if (tokenMatches(spoken, candidateTokens[i]!)) {
        found = i;
        break;
      }
    }
    if (found < 0) return false;
    at = found + 1;
  }
  return true;
}

/**
 * Resolve one named person against the real catalog.
 *
 * `role` is accepted and carried so a director ask can be answered by a credit
 * lookup rather than a cast filter. This function does not branch on it today —
 * crediting is PR #68's subject and duplicating it here would create the second
 * owner this whole change exists to remove.
 */
export async function resolvePersonReference(input: PersonReferenceInput): Promise<PersonResolution> {
  const spokenAs = (input.spokenAs ?? '').trim().slice(0, 120);
  if (spokenAs.length < 2) return { kind: 'unresolved', spokenAs };

  const hits = await searchPeople(spokenAs).catch(() => []);
  if (hits.length === 0) return { kind: 'unresolved', spokenAs };

  const wanted = norm(spokenAs);
  const isMononym = wanted.split(' ').length === 1;

  const asAmbiguous = (candidates: typeof hits): AmbiguousPerson => ({
    kind: 'ambiguous',
    spokenAs,
    candidates: candidates.slice(0, 5).map((h) => ({ id: h.id, name: h.name, knownFor: h.knownFor })),
  });

  // Only people the catalog can actually show credits for are candidates. An
  // uncredited stub outranking a real actor on a fuzzy match is the failure
  // mode this filter exists for.
  const credited = hits.filter((h) => Boolean(h.knownFor));

  /* EXACT, AND UNIQUE. Two people really can carry the same exact name, and
     "the first one" is not an identity decision — it is response ordering.
     One exact hit is decisive; several fall back to the credits filter, and
     only a SOLE credited bearer of the exact name is uniquely defensible. */
  const exacts = hits.filter((h) => norm(h.name) === wanted);
  if (exacts.length === 1) {
    const only = exacts[0]!;
    return { kind: 'resolved', id: only.id, name: only.name, evidence: 'exact-name-match' };
  }
  if (exacts.length > 1) {
    /* EXACT-NAME NAMESAKES ARE THE REAL WORLD, NOT AN EDGE CASE. The catalog
       holds several credited people named exactly "Christopher Nolan"; asking
       "which one?" for the director the sentence plainly meant is over-asking,
       and taking the first is popularity. Two pieces of DETERMINISTIC catalog
       evidence settle it before any clarification:

       1. THE SENTENCE'S OWN ROLE. "directed by X" states a department. When
          exactly one exact-name bearer's primary department is Directing (or
          Writing for a creator ask), that bearer is uniquely defensible.
          Deliberately NOT applied to actor/unmarked asks — "with X" is a weak
          cue, and department-matching it would hand the ask to a namesake.

       2. FILMOGRAPHY DOMINANCE. One bearer with a real body of work
          (≥ 10 credits and ≥ 3× every rival) against namesake stubs is the
          catalog saying who the public figure is — credit EVIDENCE, not
          search order.

       Rivals of comparable substance remain a genuine question → clarify. */
    const creditedExacts = exacts.filter((h) => Boolean(h.knownFor));
    if (creditedExacts.length === 1) {
      const only = creditedExacts[0]!;
      return { kind: 'resolved', id: only.id, name: only.name, evidence: 'sole-credited-exact-match' };
    }
    const pool = creditedExacts.length > 0 ? creditedExacts : exacts;

    const wantedDept =
      input.role === 'director' ? 'Directing' : input.role === 'creator' ? 'Writing' : null;
    if (wantedDept) {
      const roleConsistent = pool.filter((h) => h.knownForDepartment === wantedDept);
      if (roleConsistent.length === 1) {
        const only = roleConsistent[0]!;
        return { kind: 'resolved', id: only.id, name: only.name, evidence: 'sole-role-consistent-exact-match' };
      }
    }

    const counts = await Promise.all(pool.slice(0, 5).map((h) => getPersonCreditCount(h.id).catch(() => 0)));
    const top = Math.max(...counts);
    const topIdx = counts.indexOf(top);
    const dominant =
      top >= 10 && counts.every((c, i) => i === topIdx || top >= 3 * Math.max(c, 1));
    if (dominant) {
      const only = pool[topIdx]!;
      return { kind: 'resolved', id: only.id, name: only.name, evidence: 'dominant-filmography-exact-match' };
    }
    return asAmbiguous(pool);
  }

  if (isMononym) {
    const bearing = credited.filter((h) => norm(h.name).split(' ').includes(wanted));
    if (bearing.length === 1) {
      const only = bearing[0]!;
      return { kind: 'resolved', id: only.id, name: only.name, evidence: 'sole-credited-match' };
    }
    if (bearing.length > 1) return asAmbiguous(bearing);
    return { kind: 'unresolved', spokenAs, nearMisses: nearMissesFrom(credited) };
  }

  /* FULL NAME, NO EXACT MATCH. The old fallback took `credited[0]` here and
     called it "sole-credited-match" — a false receipt: nothing sole had been
     established, and response order (popularity) chose the human being. Now
     resolution requires deterministic evidence that leaves exactly ONE
     defensible candidate: every spoken token matches the candidate's name in
     order, fuzzy per token, and no other credited candidate can say the same.
     Several plausible candidates are a QUESTION; none is an honest miss. */
  const matching = credited.filter((h) => nameMatchesSpoken(wanted.split(' '), h.name));
  if (matching.length === 1) {
    const only = matching[0]!;
    return { kind: 'resolved', id: only.id, name: only.name, evidence: 'unique-credited-name-match' };
  }
  if (matching.length > 1) return asAmbiguous(matching);
  return { kind: 'unresolved', spokenAs };
}

/** The closest credited names we saw, capped — evidence for a question. */
function nearMissesFrom(
  hits: ReadonlyArray<{ id: number; name: string; knownFor?: string | null }>,
): Array<{ id: number; name: string; knownFor: string }> {
  return hits.slice(0, 3).map((h) => ({ id: h.id, name: h.name, knownFor: h.knownFor ?? '' }));
}
