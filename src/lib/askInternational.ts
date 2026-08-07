import type { FinderQuery } from '@/lib/finder';
import { detectOrigin, detectAudio, detectRuntimeMaxMinutes, detectExcludedMediaType } from '@/lib/nlu/detectors';
import { fromLegacyDetectors, applyInternationalConstraints } from '@/lib/nlu/internationalConstraints';

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
  // Origin + original language + audio all go through the ONE shared model, so
  // the legacy detector path and the Claude canonical path mean exactly the same
  // thing (english_dub != english_audio; foreign = non-English original). This is
  // the single implementation both /api/finder and /api/ask ultimately share.
  const intl = fromLegacyDetectors({
    countries: origin.countries,
    languages: origin.languages,
    foreign: origin.foreign,
    englishAudioRequired: audio.englishAudioRequired,
    englishDubRequired: audio.englishDubRequired,
    originalAudioPreferred: audio.originalAudioPreferred,
  });
  applyInternationalConstraints(query, intl);
  // Runtime is a CEILING, so the tighter value must win. The parser's default
  // cap (~150) is not a user signal, and a worded "under two hours" (120) the
  // regex parser misses would otherwise be lost. Taking the min never loosens
  // an explicit, stricter cap the parser set (e.g. 90 stays 90).
  if (runtimeMax != null && (query.maxRuntime == null || runtimeMax < query.maxRuntime)) {
    query.maxRuntime = runtimeMax;
  }
  // "the movie, not the series" narrows an uncommitted query to the type the
  // user DIDN'T rule out. Only fills when the parser stayed on 'any', so an
  // explicit mediaType from the parser always wins.
  if (!query.mediaType || query.mediaType === 'any') {
    const excluded = detectExcludedMediaType(text);
    if (excluded) query.mediaType = excluded === 'tv' ? 'movie' : 'tv';
  }
  return query;
}
