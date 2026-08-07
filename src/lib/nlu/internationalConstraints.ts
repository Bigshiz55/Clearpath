import type { FinderQuery } from '@/lib/finder';

/**
 * THE ONE SHARED INTERNATIONAL / LANGUAGE / AUDIO CONSTRAINT MODEL.
 *
 * Origin, original language, and audio are three independent factual axes. This
 * neutral shape is the single meaning of "foreign", "non-English original",
 * "English audio", and "English dubbed" across the whole app: the legacy
 * detectors normalise INTO it, the Claude canonical request maps INTO it, and
 * exactly one function (`applyInternationalConstraints`) writes it onto a
 * FinderQuery. That is what stops the five-way drift the routes had, where the
 * same sentence meant different things depending on who parsed it.
 *
 * Pure, no I/O. The app still VERIFIES the actual English availability at
 * scoring time (englishAvailability); this only expresses the requirement.
 */

export type OriginalLanguageClass = 'any' | 'english' | 'non_english';
export type AudioRequirement = 'any' | 'english_audio' | 'english_dub' | 'original_audio';

export interface InternationalConstraints {
  /** ISO-3166 production origins required / excluded. */
  originCountriesRequired: string[];
  originCountriesExcluded: string[];
  /** ISO-639-1 original languages required / excluded ("not Korean"). */
  originalLanguagesRequired: string[];
  originalLanguagesExcluded: string[];
  /** Coarse original-language gate. */
  originalLanguageClass: OriginalLanguageClass;
  /** Audio requirement — english_dub is stricter than english_audio (see enum). */
  audioRequirement: AudioRequirement;
}

export const EMPTY_INTERNATIONAL: InternationalConstraints = {
  originCountriesRequired: [],
  originCountriesExcluded: [],
  originalLanguagesRequired: [],
  originalLanguagesExcluded: [],
  originalLanguageClass: 'any',
  audioRequirement: 'any',
};

/** True when the constraints express nothing (a no-op). */
export function isEmptyInternational(c: InternationalConstraints): boolean {
  return (
    c.originCountriesRequired.length === 0 &&
    c.originCountriesExcluded.length === 0 &&
    c.originalLanguagesRequired.length === 0 &&
    c.originalLanguagesExcluded.length === 0 &&
    c.originalLanguageClass === 'any' &&
    c.audioRequirement === 'any'
  );
}

/** Normalise the legacy detectors' output into the shared shape. `foreign` is
 *  the generic non-English-original signal ("foreign", "non-english"). */
export function fromLegacyDetectors(input: {
  countries: string[];
  languages: string[];
  foreign: boolean;
  englishAudioRequired: boolean;
  englishDubRequired: boolean;
  originalAudioPreferred: boolean;
}): InternationalConstraints {
  const audioRequirement: AudioRequirement = input.englishDubRequired
    ? 'english_dub'
    : input.englishAudioRequired
      ? 'english_audio'
      : input.originalAudioPreferred
        ? 'original_audio'
        : 'any';
  // A dub or an explicit "foreign" makes the original NON-English; an explicit
  // original language other than English does too.
  const nonEnglish =
    input.foreign || input.englishDubRequired || input.languages.some((l) => l && l !== 'en');
  return {
    originCountriesRequired: input.countries.slice(),
    originCountriesExcluded: [],
    originalLanguagesRequired: input.languages.filter((l) => l && l !== 'en'),
    originalLanguagesExcluded: [],
    originalLanguageClass: nonEnglish ? 'non_english' : 'any',
    audioRequirement,
  };
}

/**
 * Write the shared constraints onto a FinderQuery — the single place these
 * semantics become finder filters. Never loosens a stronger signal the parser
 * already set; only fills what is unset.
 */
export function applyInternationalConstraints(query: FinderQuery, c: InternationalConstraints): FinderQuery {
  const q = query;

  if (c.originCountriesRequired.length && !(q.originCountries && q.originCountries.length)) {
    q.originCountries = c.originCountriesRequired.slice();
  }
  if (c.originalLanguagesRequired.length && !(q.originalLanguages && q.originalLanguages.length)) {
    q.originalLanguages = c.originalLanguagesRequired.slice();
  }
  if (c.originalLanguagesExcluded.length) {
    q.excludeOriginalLanguages = Array.from(
      new Set([...(q.excludeOriginalLanguages ?? []), ...c.originalLanguagesExcluded]),
    );
  }

  // Original-language class → hard finder gates.
  if (c.originalLanguageClass === 'non_english') q.nonEnglishOriginal = true;
  if (c.originalLanguageClass === 'english') q.englishOriginalOnly = true;

  // Audio requirement → English-availability gates. english_dub is the strict
  // "non-English original WITH an English track" (englishAvailability ===
  // 'available'); english_audio is the looser native-OR-dub. A dub also implies
  // a non-English original, so set that gate too for consistency.
  if (c.audioRequirement === 'english_dub') {
    q.englishDubOnly = true;
    q.nonEnglishOriginal = true;
  } else if (c.audioRequirement === 'english_audio') {
    q.englishAudioOnly = true;
  }
  // 'original_audio' and 'any' add no hard English gate (every title has its own
  // original audio); the requirement is carried in the receipt, not a filter.

  return q;
}
