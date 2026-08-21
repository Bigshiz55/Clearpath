/**
 * SAYING SO, WHEN WE CANNOT SATISFY THE REQUEST.
 *
 * ── WHAT THIS COMPLETES ───────────────────────────────────────────────────
 * Execution stopped silently dropping requirements it could not resolve: it
 * returns `unresolvedRequirements`. But an internal signal nobody renders is
 * only half the repair — the user still sees films chosen without the one
 * thing they actually specified, which is precisely the reported failure
 * ("Looking for a good Samuel L Jackson movie" → three 2026 films he is not
 * in, at "100 match").
 *
 * The order of preference is:
 *   1. RESOLVE it — normalization upstream now handles punctuation, casing,
 *      accents and hyphenation, which is what the reported case needed.
 *   2. ASK — when the catalog holds near misses, name them. A typo is a
 *      question with an obvious answer, not a dead end.
 *   3. ADMIT — when it holds nothing, say plainly that we could not find them
 *      and return NOTHING rather than something unrelated.
 *
 * What it must never do is proceed as though the requirement was never made.
 *
 * PURE. No I/O — the near misses are gathered upstream where the search
 * already happened.
 */
import type { UnresolvedRequirement } from './hardConstraints';
import type { FinderQuery } from '@/lib/finder';

/** Catalog near misses for a spoken name, keyed by exactly what was said. */
export type NearMisses = Record<string, Array<{ id: number; name: string; knownFor?: string }>>;

/**
 * Did anything else survive to execute? If so the request still has substance
 * and runs on it, with the miss DISCLOSED rather than hidden; only a request
 * whose entire substance failed to resolve becomes a clarify.
 *
 * ONE DEFINITION, used by /api/ask and /api/finder alike. Each route carried
 * its own inline copy and the finder's dropped the origin/language/audio
 * fields — so "a French movie with <unresolvable person>" clarified (and lost
 * the origin constraint) on one route while executing with the miss disclosed
 * on the other. Reviewer catch on the Phase 7 fold; the whole point of that
 * fold is that the two routes cannot diverge, so the predicate lives here.
 */
export function requestHasOtherConstraints(q: FinderQuery): boolean {
  return (
    (q.genreIds?.length ?? 0) > 0 ||
    (q.keywordIds?.length ?? 0) > 0 ||
    (q.castIds?.length ?? 0) > 0 ||
    (q.people?.length ?? 0) > 0 ||
    (q.providerIds?.length ?? 0) > 0 ||
    (q.originCountries?.length ?? 0) > 0 ||
    (q.originalLanguages?.length ?? 0) > 0 ||
    q.englishAudioOnly === true ||
    q.englishDubOnly === true ||
    q.minYear != null ||
    q.maxYear != null ||
    q.maxRuntime != null ||
    Boolean(q.subjectLabel) ||
    Boolean(q.subjectCanonical)
  );
}

export interface UnresolvedClarification {
  /** One sentence, naming what could not be honoured. */
  clarify: string;
  /** Concrete choices, when the catalog gave us any. Never invented. */
  options: string[];
  /** The requirements this covers, for the caller's own bookkeeping. */
  unresolved: UnresolvedRequirement[];
}

const list = (names: string[]): string =>
  names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

export function unresolvedClarification(
  unresolved: readonly UnresolvedRequirement[],
  nearMisses: NearMisses,
  opts: { requestHasOtherConstraints?: boolean } = {},
): UnresolvedClarification | null {
  if (unresolved.length === 0) return null;

  const missing = unresolved.filter((u) => u.reason === 'unresolved');

  /* AN UNSUPPORTED ROLE IS ALREADY ANSWERED HONESTLY ELSEWHERE. The route
     returns a dedicated `unsupported-role` response naming the credit it cannot
     filter by; producing a second, vaguer message here would preempt the
     better one. */
  if (missing.length === 0) return null;

  /* A SPURIOUS SPAN MUST NOT DEAD-END A REAL REQUEST.
     Person extraction leans on capitalisation, so "Give me a foreign movie with
     English audio" yields a "person" called English. Blocking every request
     whose person span happens not to resolve would turn that into a dead end —
     trading a silent wrong answer for a loud non-answer, which is not an
     improvement.

     So the question is whether the requirement was the WHOLE request. With
     nothing else to execute, dropping it leaves a query that answers a
     different question, and asking is the only honest move. With real
     constraints still standing, the request is run on those and the miss is
     DISCLOSED rather than hidden — the route already says "I couldn't find
     anyone called X" in its interpretation line. */
  if (opts.requestHasOtherConstraints === true) return null;

  const options = missing.flatMap((u) =>
    (nearMisses[u.entity] ?? []).map((c) => (c.knownFor ? `${c.name} — ${c.knownFor}` : c.name)),
  );
  const named = list(missing.map((u) => u.entity));

  return {
    clarify:
      options.length > 0
        ? `I couldn’t verify ${named}. Did you mean one of these?`
        : `I couldn’t find anyone called ${named}, so I haven’t guessed — tell me another way to spell it and I’ll try again.`,
    options,
    unresolved: [...unresolved],
  };
}
