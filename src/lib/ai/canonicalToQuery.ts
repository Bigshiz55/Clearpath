import { EMPTY_QUERY } from '@/lib/finderParse';
import { genreIdFromName } from '@/lib/finderGenres';
import type { FinderQuery } from '@/lib/finder';
import { applyInternationalConstraints, type InternationalConstraints } from '@/lib/nlu/internationalConstraints';
import type { CanonicalDiscoveryRequest } from './schemas';

/**
 * CANONICAL → FINDERQUERY (pure, no I/O).
 *
 * Maps the parts of a validated CanonicalDiscoveryRequest that need no catalog
 * lookup straight onto a FinderQuery: media type, exact date bounds, runtime cap,
 * excluded genres, tone/pace hint, and the required/excluded SUBJECTS as lexemes
 * (a hard qualification gate, not a soft genre). Everything that needs a real
 * entity id — reference titles, people, providers, the subject's keyword ids — is
 * NOT resolved here; it is returned as `pendingResolution` for the route to look
 * up through the app's existing typed tools (searchPeople, resolveSource,
 * resolveSubjectRequirementForTerms, askSimilarTo). That keeps this function pure
 * and deterministic, and keeps entity resolution — the thing that must be
 * verified against real data — out of the model's hands.
 *
 * QUALIFY FIRST is preserved: required subjects become subjectLexemes + strict,
 * so a keyword hit is only a candidate and every result must be judged CENTRAL by
 * runFinder's eligibility gate before ranking. Excluded subjects and excluded
 * people are hard removals. Personalization (DNA) only ever orders what already
 * qualified.
 */

export interface PendingResolution {
  /** "like X" references (text) — resolved via askSimilarTo / referenceKeywordIds. */
  referenceTitles: { text: string; relationship: string }[];
  /** Required-subject terms → resolveSubjectRequirementForTerms (keyword ids + lexemes). */
  requiredSubjects: string[];
  /** Excluded-subject terms → without_keywords. */
  excludedSubjects: string[];
  /** People to require (with_cast) — resolved via searchPeople. */
  requiredPeople: string[];
  /** People to exclude — resolved via searchPeople, then credit-filtered. */
  excludedPeople: string[];
  /** Provider names → resolveSource → providerIds. */
  requiredProviders: string[];
}

export interface MappedQuery {
  query: FinderQuery;
  pendingResolution: PendingResolution;
  /** True when the model asked to clarify — the route should surface the question
   *  rather than run a search. */
  clarify: boolean;
}

/** Map a soft tone/theme hint to the finder's 0..100 pace, or null if none apply. */
function paceFromTones(tones: string[]): number | null {
  const t = tones.map((s) => s.toLowerCase());
  const has = (...words: string[]) => t.some((x) => words.some((w) => x.includes(w)));
  if (has('slow', 'meditative', 'quiet', 'atmospheric', 'slow-burn', 'slow burn')) return 15;
  if (has('cozy', 'comfort', 'gentle', 'easy')) return 35;
  if (has('fast', 'adrenaline', 'relentless', 'pulse', 'edge-of', 'action-packed', 'frenetic')) return 90;
  return null;
}

export function canonicalToQuery(req: CanonicalDiscoveryRequest): MappedQuery {
  const h = req.hardConstraints;

  const mediaType: FinderQuery['mediaType'] =
    req.mediaTypes.length === 1 && req.mediaTypes[0] ? req.mediaTypes[0] : 'any';

  const excludeGenreIds = h.excludedGenres
    .map((g) => genreIdFromName(g))
    .filter((n): n is number => n != null);

  const query: FinderQuery = {
    ...EMPTY_QUERY,
    mediaType,
    maxRuntime: h.runtimeMaxMinutes ?? null,
    excludeGenreIds: excludeGenreIds.length ? excludeGenreIds : undefined,
    minReleaseDate: h.releaseDateMin ?? undefined,
    // maxYear from an exact upper date bound (calendar year is enough for "before").
    maxYear: h.releaseDateMax ? Number(h.releaseDateMax.slice(0, 4)) : undefined,
    monetization: h.requiredMonetization.length ? h.requiredMonetization.join('|') : undefined,
    pace: paceFromTones(req.softPreferences.tones),
    similarTo: req.referenceTitles.length ? req.referenceTitles.map((r) => r.text).join(' / ') : undefined,
    // Required subjects become a HARD qualification gate. keyword ids are resolved
    // by the route (needs I/O); the lexemes + strict flag are set here so the
    // eligibility gate is armed even before ids land.
    subjectLexemes: h.requiredSubjects.length ? [...h.requiredSubjects] : undefined,
    subjectStrict: h.requiredSubjects.length ? true : undefined,
    subjectLabel: h.requiredSubjects.length ? h.requiredSubjects[0] : undefined,
    // Explicit requested count survives as the FINAL-selection cap ("10 shows").
    // Honored to the extent titles verify — the finder never pads to hit it.
    finalCount: req.requestedCount ?? undefined,
  };

  // International / language / audio constraints go through the ONE shared
  // applier, so "foreign", "non-English original", "English audio" and "English
  // dubbed" mean exactly what they mean on the legacy path. No constraint is
  // allowed to disappear because a different subsystem parsed the sentence.
  const intl: InternationalConstraints = {
    originCountriesRequired: [...h.international.originCountriesRequired],
    originCountriesExcluded: [...h.international.originCountriesExcluded],
    originalLanguagesRequired: [...h.international.originalLanguagesRequired],
    originalLanguagesExcluded: [...h.international.originalLanguagesExcluded],
    originalLanguageClass: h.international.originalLanguageClass,
    audioRequirement: h.international.audioRequirement,
  };
  applyInternationalConstraints(query, intl);

  return {
    query,
    clarify: req.clarificationRequired && req.ambiguities.length > 0,
    pendingResolution: {
      referenceTitles: req.referenceTitles.map((r) => ({ text: r.text, relationship: r.relationship })),
      requiredSubjects: [...h.requiredSubjects],
      excludedSubjects: [...h.excludedSubjects],
      requiredPeople: [...h.requiredPeople],
      excludedPeople: [...h.excludedPeople],
      requiredProviders: [...h.requiredProviders],
    },
  };
}
