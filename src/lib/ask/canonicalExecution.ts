import 'server-only';
import { EMPTY_QUERY, GENRE_WORDS as PARSE_GENRE_IDS } from '@/lib/finderParse';
import { genreIdFromName } from '@/lib/finderGenres';
import { DEFAULT_RESULT_LIMIT, type FinderQuery } from '@/lib/finder';
import { searchBySubject, resolveKeywordIds, resolveProvider } from '@/lib/ai/tools';
import { resolvePersonReference, type PersonResolution } from './personReference';
import { planPersonConstraint, type PersonConstraint, type PersonPlan } from '@/lib/people/constraint';
import type { CanonicalIntent, LookbackWindow } from '@/lib/interpret/types';

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
  /** Tones the sentence stated that no execution primitive can carry —
   *  DISCLOSED to the user, never silently dropped. */
  undeliverableTones: string[];
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
/**
 * The SHARED parsing vocabulary, then the canonical map. `finderParse`'s
 * alias table is how the legacy parser executed "funny", "scary",
 * "romantic" and "supernatural" — consuming it here preserves those exact
 * readings instead of growing a second vocabulary that would drift.
 */
const genreIdFor = (name: string): number | null =>
  PARSE_GENRE_IDS[name.trim().toLowerCase()] ?? genreIdFromName(name);

/**
 * TONES ONTO EXISTING PRIMITIVES — measured from the legacy parser, not
 * invented: funny/scary/romantic execute as genres through the alias map
 * above; fast-paced and slow execute as the finder's `pace`. Everything
 * else had NO legacy execution; a wanted tone with no home is disclosed,
 * and a vetoed one takes the same keyword-exclusion channel every other
 * veto uses, because dropping a veto is ignoring one.
 */
const TONE_PACE: Record<string, number> = { 'fast-paced': 90, fastpaced: 90, slow: 15 };

/**
 * A RELATIVE WINDOW BECOMES A CONCRETE BOUND — here, where the clock lives.
 *
 * The interpreter is pure and records "5 years back" as semantics; this is the
 * only place allowed to know what today is. Keeping the arithmetic on this side
 * of the boundary is what lets the same sentence be interpreted identically
 * forever and still retrieve the right decade.
 *
 * Returns the `YYYY-MM-DD` the existing Finder constraint `minReleaseDate`
 * already speaks. A `future` window yields nothing: the catalogue cannot answer
 * "released in the next two years", and a silent lower bound would be a wrong
 * answer rather than an empty one.
 */
const MS_PER_DAY = 86_400_000;

export function lookbackToMinReleaseDate(w: LookbackWindow, nowMs: number): string | undefined {
  if (w.direction !== 'past' || w.amount <= 0) return undefined;
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const d = new Date(nowMs);
  switch (w.unit) {
    case 'day':
      return iso(nowMs - w.amount * MS_PER_DAY);
    case 'week':
      return iso(nowMs - w.amount * 7 * MS_PER_DAY);
    case 'month':
      d.setUTCMonth(d.getUTCMonth() - w.amount);
      return iso(d.getTime());
    case 'decade':
      d.setUTCFullYear(d.getUTCFullYear() - w.amount * 10);
      return iso(d.getTime());
    case 'year':
    default:
      d.setUTCFullYear(d.getUTCFullYear() - w.amount);
      return iso(d.getTime());
  }
}

export function intentToQuery(intent: CanonicalIntent, opts: { now?: number } = {}): MappedIntent {
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
    const id = genreIdFor(g.span);
    if (id != null) genreIds.push(id);
    else unmappedWanted.push(g.span);
  }
  const excludeGenreIds: number[] = [];
  const unmappedVetoed: string[] = [];
  for (const g of vetoedGenres) {
    const id = genreIdFor(g.span);
    if (id != null) excludeGenreIds.push(id);
    else unmappedVetoed.push(g.span);
  }

  /* TONES — the same alias map and the pace primitive, split by polarity. */
  let pace: number | null = null;
  const undeliverableTones: string[] = [];
  for (const t of intent.tones) {
    const key = t.term.trim().toLowerCase();
    const gid = genreIdFor(key);
    if (t.wanted) {
      if (gid != null) {
        if (!genreIds.includes(gid)) genreIds.push(gid);
      } else if (TONE_PACE[key] != null) {
        if (pace == null) pace = TONE_PACE[key]!;
      } else {
        undeliverableTones.push(t.term);
      }
    } else {
      if (gid != null) {
        if (!excludeGenreIds.includes(gid)) excludeGenreIds.push(gid);
      } else {
        // A vetoed tone with no genre home joins the keyword-exclusion
        // channel — same path as every other vetoed span.
        unmappedVetoed.push(t.term);
      }
    }
  }

  const query: FinderQuery = {
    ...EMPTY_QUERY,
    // 'none' (a media contradiction) is the ROUTE's to clarify before
    // execution; if it arrives here anyway, the honest widest reading is used.
    mediaType: intent.media === 'either' || intent.media === 'none' ? 'any' : intent.media,
    genreIds,
    excludeGenreIds: excludeGenreIds.length ? excludeGenreIds : undefined,
    maxRuntime: intent.runtime.maxMinutes ?? null,
    pace,
    minYear: intent.date.minYear ?? undefined,
    maxYear: intent.date.maxYear ?? undefined,
    finalCount: intent.requestedCount ?? undefined,
  };

  /* "movies from the last 5 years" — the semantic window the interpreter
     recorded, resolved against the injected clock and handed to the constraint
     the Finder already has. An explicit year is the more specific statement and
     keeps precedence. */
  if (intent.date.lookback && query.minYear == null) {
    const from = lookbackToMinReleaseDate(intent.date.lookback, opts.now ?? Date.now());
    if (from) query.minReleaseDate = from;
  }

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
    undeliverableTones,
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
  /** A credit role the engine cannot run — the route answers with a refusal,
   *  because films someone merely appeared in are a confidently wrong answer
   *  to a question about their directing. Never silently downgraded. */
  refusedRole: Extract<PersonPlan, { kind: 'refuse' }> | null;
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

  /*
   * THE ROLE TRAVELS FROM THE INTENT, NEVER FROM THE RAW SENTENCE.
   * `CanonicalIntent.people[].role` was read once by the interpreter
   * ("directed by" → director); here each resolved identity is planned into
   * a TYPED PersonConstraint through the same `planPersonConstraint` the
   * legacy arm uses. 'any' takes the actor reading — the pre-existing cast
   * semantics of an unmarked name. A role the engine cannot execute for the
   * requested medium comes back as a REFUSAL the route must answer with,
   * never a silent downgrade to actor.
   */
  const constraints: PersonConstraint[] = [];
  const castIds: number[] = [];
  let refusedRole: CanonicalExecution['refusedRole'] = null;
  people.forEach((p, i) => {
    if (p.kind !== 'resolved') return;
    const intentRole = mapped.pending.requiredPeople[i]!.role;
    const plan = planPersonConstraint(
      p.id,
      intentRole === 'any' ? 'actor' : intentRole,
      query.mediaType === 'tv' ? 'tv' : 'movie',
    );
    if (plan.kind === 'apply') {
      constraints.push(plan.constraint);
      if (plan.constraint.role === 'actor') castIds.push(p.id);
    } else if (refusedRole === null) {
      refusedRole = plan;
    }
  });
  if (constraints.length > 0) {
    query.people = constraints;
    if (castIds.length > 0) query.castIds = castIds;
    /* Cast/crew filtering is movie-only in the finder. Stated media still
       wins when the user asked for TV — this only fills an unstated one. */
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

  people.forEach((p, i) => {
    if (p.kind === 'resolved') {
      const role = mapped.pending.requiredPeople[i]!.role;
      interpretation.push(
        role === 'director'
          ? `Filtering to titles directed by ${p.name}.`
          : `Filtering to titles featuring ${p.name}.`,
      );
    }
    if (p.kind === 'unresolved') interpretation.push(`I couldn’t find anyone called “${p.spokenAs}”.`);
  });

  for (const t of mapped.undeliverableTones) {
    interpretation.push(`“${t}” isn’t a tone I can filter by yet — showing results without it.`);
  }

  return {
    query,
    limit: mapped.requestedCount ?? DEFAULT_RESULT_LIMIT,
    people,
    ambiguity: ambiguity as CanonicalExecution['ambiguity'],
    excludePersonIds: excludedIds,
    refusedRole,
    interpretation,
  };
}
