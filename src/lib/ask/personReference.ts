import 'server-only';
import { searchPeople } from '@/lib/tmdb/client';
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
  /** Why we believe this is the person — surfaced in the receipt, never invented. */
  evidence: 'exact-name-match' | 'sole-credited-match';
}

export interface AmbiguousPerson {
  kind: 'ambiguous';
  spokenAs: string;
  candidates: Array<{ id: number; name: string; knownFor: string }>;
}

export interface UnresolvedPerson {
  kind: 'unresolved';
  spokenAs: string;
}

export type PersonResolution = ResolvedPerson | AmbiguousPerson | UnresolvedPerson;

export interface PersonReferenceInput {
  /** Exactly as the user named them. Never the whole sentence. */
  spokenAs: string;
  role: CreditRole;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

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

  const exact = hits.find((h) => norm(h.name) === wanted);
  if (exact) return { kind: 'resolved', id: exact.id, name: exact.name, evidence: 'exact-name-match' };

  // Only people the catalog can actually show credits for are candidates. An
  // uncredited stub outranking a real actor on a fuzzy match is the failure
  // mode this filter exists for.
  const credited = hits.filter((h) => Boolean(h.knownFor));

  if (isMononym) {
    const bearing = credited.filter((h) => norm(h.name).split(' ').includes(wanted));
    if (bearing.length === 1) {
      const only = bearing[0]!;
      return { kind: 'resolved', id: only.id, name: only.name, evidence: 'sole-credited-match' };
    }
    if (bearing.length > 1) {
      return {
        kind: 'ambiguous',
        spokenAs,
        candidates: bearing.slice(0, 5).map((h) => ({ id: h.id, name: h.name, knownFor: h.knownFor })),
      };
    }
    return { kind: 'unresolved', spokenAs };
  }

  const top = credited[0];
  return top
    ? { kind: 'resolved', id: top.id, name: top.name, evidence: 'sole-credited-match' }
    : { kind: 'unresolved', spokenAs };
}
