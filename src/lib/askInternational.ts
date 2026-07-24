import type { FinderQuery } from '@/lib/finder';
import { detectOrigin, detectAudio, detectRuntimeMaxMinutes, detectExcludedMediaType } from '@/lib/nlu/detectors';

/**
 * Foreign-origin / English-audio / runtime are dimensions neither the LLM filter
 * schema nor the regex parser captured, so "a Spanish film with English audio,
 * under two hours" used to keep only "movie". These deterministic detectors run
 * on the raw text and AUGMENT whatever query the parser produced — restricting
 * the candidate pool to the requested origin/language + runtime, and requiring
 * English audio at verification. Never overrides a stronger signal already set.
 * Pure; safe to unit-test and to run in the ask route.
 */
export function augmentInternational(query: FinderQuery, text: string): FinderQuery {
  if (!text) return query;
  const origin = detectOrigin(text);
  const audio = detectAudio(text);
  const runtimeMax = detectRuntimeMaxMinutes(text);
  if (origin.countries.length && !(query.originCountries && query.originCountries.length)) {
    query.originCountries = origin.countries;
  }
  if (origin.languages.length && !(query.originalLanguages && query.originalLanguages.length)) {
    query.originalLanguages = origin.languages;
  }
  if (audio.englishAudioRequired) query.englishAudioOnly = true;
  if (runtimeMax != null && query.maxRuntime == null) query.maxRuntime = runtimeMax;
  // "the movie, not the series" narrows an uncommitted query to the type the
  // user DIDN'T rule out. Only fills when the parser stayed on 'any', so an
  // explicit mediaType from the parser always wins.
  if (!query.mediaType || query.mediaType === 'any') {
    const excluded = detectExcludedMediaType(text);
    if (excluded) query.mediaType = excluded === 'tv' ? 'movie' : 'tv';
  }
  return query;
}
