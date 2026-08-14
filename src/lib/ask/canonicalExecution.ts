import 'server-only';
import { EMPTY_QUERY } from '@/lib/finderParse';
import { genreIdFromName } from '@/lib/finderGenres';
import { DEFAULT_RESULT_LIMIT, type FinderQuery } from '@/lib/finder';
import { searchBySubject, resolveKeywordIds, resolveProvider } from '@/lib/ai/tools';
import { resolvePersonReference, type PersonResolution } from './personReference';
import type { CanonicalIntent } from '@/lib/interpret/types';

/**
 * CANONICAL INTENT → A TYPED FINDER EXECUTION REQUEST.
 *
 * The boundary this file defines:
 *
 *   raw utterance → interpret(raw) → CanonicalIntent → [here] → FinderQuery
 *
 * and, critically, NOT:
 *
 *   raw utterance → interpret(raw) → then ALSO resolvePersonId(raw),
 *   parseRequestedCount(raw), applyRequiredSubject(query, raw)
 *
 * That second shape is what the deployed product did, and it is why "Give me a
 * Stallone movie" returned zero titles. `applyRequiredSubject` re-read the
 * sentence, `detectGeneralSubject` took the word before the media noun, and the
 * actor's surname became a STRICT SUBJECT — "show only titles where *stallone*
 * is genuinely central". Nothing is about an actor, so eligibility rejected
 * every candidate. Two independent readings of one sentence disagreed, and the
 * loser was the user.
 *
 * So nothing below reads the original English. Every value comes from a
 * canonical field, and the only outward calls are ENTITY RESOLUTION — turning a
 * span the interpreter emitted into an id the catalog vouches for.
 *
 * WHAT THIS FILE IS NOT. It is not a new subject engine, a new person resolver
 * or a second finder. Subjects go to `searchBySubject`, which already accepts
 * already-extracted TERMS rather than a sentence; people go to
 * `resolvePersonReference`; providers to `resolveProvider`. The existing
 * execution machinery stays exactly where it is and keeps its behaviour — this
 * layer only stops it being handed a second, conflicting interpretation.
 */

/** Split so the pure half is testable with no I/O and no mocks. */
export interface MappedIntent {
  query: FinderQuery;
  /** Spans that need the world before they mean anything. */
  pending: {
    requiredPeople: Array<{ spokenAs: string; role: CanonicalIntent['people'][number]['role'] }>;
    excludedPeople: string[];
    requiredSubjects: string[];
    excludedSubjects: string[];
    providers: string[];
  };
  /** The count the user actually asked for. `null` = unsaid; the caller defaults. */
  requestedCount: number | null;
}

/**
 * PURE. Canonical fields onto the query shape, with no lookups.
 *
 * `finalCount` is set from `requestedCount` because that is the count the
 * sentence carried — "give me a Sylvester Stallone movie" asks for one film and
 * answering with eight is the same species of not-listening as answering a
 * request for three with one. The anecdote's "3" never reaches here: the
 * interpreter read the count from the REQUEST clause only, so the number in
 * "I watched 3 movies yesterday" was never a candidate.
 */
export function intentToQuery(intent: CanonicalIntent): MappedIntent {
  const wantedGenres = intent.genres.filter((g) => g.wanted);
  const vetoedGenres = intent.genres.filter((g) => !g.wanted);

  /*
   * A GENRE WORD THE CATALOG HAS NO GENRE FOR IS STILL A CONSTRAINT.
   * "supernatural" is in the interpreter's genre vocabulary but TMDB has no
   * such genre id — dropping it silently would turn "no supernatural stuff"
   * into nothing at all, which is ignoring a veto. The span falls back to the
   * SUBJECT channel instead (keyword resolution downstream), so the
   * constraint stays executable and canonical-owned.
   */
  const genreIds: number[] = [];
  const unmappedWanted: string[] = [];
  for (const g of wantedGenres) {
    const id = genreIdFromName(g.span);
    if (id != null) genreIds.push(id);
    else unmappedWanted.push(g.span);
  }
  const excludeGenreIds: number[] = [];
  const unmappedVetoed: string[] = [];
  for (const g of vetoedGenres) {
    const id = genreIdFromName(g.span);
    if (id != null) excludeGenreIds.push(id);
    else unmappedVetoed.push(g.span);
  }

  const query: FinderQuery = {
    ...EMPTY_QUERY,
    mediaType: intent.media === 'either' ? 'any' : intent.media,
    genreIds,
    excludeGenreIds: excludeGenreIds.length ? excludeGenreIds : undefined,
    maxRuntime: intent.runtime.maxMinutes ?? null,
    minYear: intent.date.minYear ?? undefined,
    maxYear: intent.date.maxYear ?? undefined,
    finalCount: intent.requestedCount ?? undefined,
  };

  /* ORIGIN / AUDIO — canonical fields onto the query, replacing the legacy
     whole-utterance augmentation on this path. Dub is stricter than audio and
     wins, exactly as the augmentation ruled. */
  if (intent.origin.countries.length) query.originCountries = [...intent.origin.countries];
  if (intent.origin.languages.length) query.originalLanguages = [...intent.origin.languages];
  if (intent.origin.englishDubOnly) query.englishDubOnly = true;
  else if (intent.origin.englishAudioOnly) query.englishAudioOnly = true;

  return {
    query,
    pending: {
      requiredPeople: intent.people
        .filter((p) => p.relation === 'required')
        .map((p) => ({ spokenAs: p.span, role: p.role })),
      excludedPeople: intent.people.filter((p) => p.relation === 'excluded').map((p) => p.span),
      requiredSubjects: [...intent.subjects.filter((s) => s.wanted).map((s) => s.span), ...unmappedWanted],
      excludedSubjects: [...intent.subjects.filter((s) => !s.wanted).map((s) => s.span), ...unmappedVetoed],
      providers: [...intent.providers],
    },
    requestedCount: intent.requestedCount,
  };
}

export interface CanonicalExecution {
  query: FinderQuery;
  limit: number;
  /** Every person the sentence named, with how identity was settled. */
  people: PersonResolution[];
  /** Set when a named person could not be pinned down — the route asks instead
   *  of guessing. Only ever produced by the mononym rule. */
  ambiguity: Extract<PersonResolution, { kind: 'ambiguous' }> | null;
  /** "…but not another Stallone movie" — resolved ids, credit-filtered later. */
  excludePersonIds: number[];
  /** Disclosures the response shows, in the product's existing voice. */
  interpretation: string[];
}

/**
 * Resolve the canonical spans against the world and finish the query.
 *
 * Order matters only in that people are resolved before subjects, so the
 * receipt can say plainly that a person became a CAST constraint and not a
 * theme — the distinction the live failure erased.
 */
export async function resolveCanonicalExecution(intent: CanonicalIntent): Promise<CanonicalExecution> {
  const mapped = intentToQuery(intent);
  const query = { ...mapped.query };
  const interpretation: string[] = [];

  const people = await Promise.all(
    mapped.pending.requiredPeople.map((p) => resolvePersonReference({ spokenAs: p.spokenAs, role: p.role })),
  );

  const ambiguity = people.find((p) => p.kind === 'ambiguous') ?? null;

  const castIds = people
    .filter((p): p is Extract<PersonResolution, { kind: 'resolved' }> => p.kind === 'resolved')
    .map((p) => p.id);
  if (castIds.length > 0) {
    query.castIds = castIds;
    /* Cast filtering is movie-only in the finder, and the sentence said
       "movie" in every shape that reaches here. Stated media still wins when
       the user asked for TV — this only fills an unstated one. */
    if (query.mediaType === 'any') query.mediaType = 'movie';
  }

  const excludedIds = (
    await Promise.all(
      mapped.pending.excludedPeople.map((span) => resolvePersonReference({ spokenAs: span, role: 'any' })),
    )
  )
    .filter((p): p is Extract<PersonResolution, { kind: 'resolved' }> => p.kind === 'resolved')
    .map((p) => p.id);

  if (mapped.pending.requiredSubjects.length > 0) {
    const sr = await searchBySubject(mapped.pending.requiredSubjects);
    if (sr) {
      query.subjectKeywordIds = sr.keywordIds;
      query.subjectLexemes = sr.lexemes;
      query.subjectStrict = true;
      query.subjectLabel = sr.label;
      query.subjectCanonical = sr.canonical;
      if (sr.keywordIds.length === 0) {
        interpretation.push(
          `“${sr.label}” isn’t a well-tagged catalog subject — showing only titles where it is genuinely central, if any.`,
        );
      }
    }
  }

  if (mapped.pending.excludedSubjects.length > 0) {
    const ids = await resolveKeywordIds(mapped.pending.excludedSubjects);
    if (ids.length) query.excludeKeywordIds = [...new Set([...(query.excludeKeywordIds ?? []), ...ids])];
  }

  if (mapped.pending.providers.length > 0) {
    const ids: number[] = [];
    for (const name of mapped.pending.providers) {
      const src = await resolveProvider(name);
      if (src) ids.push(src.providerId);
    }
    if (ids.length) query.providerIds = ids;
  }

  for (const p of people) {
    if (p.kind === 'resolved') interpretation.push(`Filtering to titles featuring ${p.name}.`);
    if (p.kind === 'unresolved') interpretation.push(`I couldn’t find anyone called “${p.spokenAs}”.`);
  }

  return {
    query,
    limit: mapped.requestedCount ?? DEFAULT_RESULT_LIMIT,
    people,
    ambiguity: ambiguity as CanonicalExecution['ambiguity'],
    excludePersonIds: excludedIds,
    interpretation,
  };
}
