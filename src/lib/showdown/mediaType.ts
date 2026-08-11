/**
 * WHICH DIAGNOSTIC TITLES ARE TELEVISION.
 *
 * The canonical engine keys every title as `${mediaType}:${tmdbId}`, so
 * crossing from Showdown into `preference_events` needs a media type that
 * `DiagnosticTitle` does not carry. It matters more than it looks: TMDB ids are
 * namespaced PER MEDIA TYPE, so `movie:1396` and `tv:1396` are different works
 * entirely. Guessing wrong does not degrade a recommendation, it attributes
 * someone's taste to a film they have never heard of.
 *
 * AN EXPLICIT SET RATHER THAN A DEFAULT. Defaulting to `movie` and listing the
 * exceptions would be one line shorter and silently wrong the first time
 * somebody adds a series without noticing — the failure would be invisible,
 * because a wrong-but-valid title id still writes cleanly. `mediaType.test.ts`
 * therefore asserts that EVERY id in the catalogue is classified here, so a new
 * title fails the suite until somebody states which it is. Same discipline as
 * `poster.ts`'s `UNRESOLVED`: leaving a blank has to be a decision, not an
 * oversight.
 */

import { TITLES } from '@/lib/voice/quickdna/definition';

/** Diagnostic titles that are series, by their catalogue id. */
export const TV_TITLE_IDS: ReadonlySet<string> = new Set([
  'making-a-murderer',
  'sherlock',
  'breaking-bad',
  'office',
  'squid-game',
  'dark',
  'true-detective',
  'last-dance',
  'bridgerton',
  'great-british-bake-off',
]);

export type ShowdownMediaType = 'movie' | 'tv';

export function mediaTypeFor(titleId: string): ShowdownMediaType {
  return TV_TITLE_IDS.has(titleId) ? 'tv' : 'movie';
}

/** The canonical engine key for a diagnostic title, or null if unknown. */
export function canonicalTitleId(titleId: string): string | null {
  const t = TITLES.find((x) => x.id === titleId);
  if (!t) return null;
  return `${mediaTypeFor(titleId)}:${t.tmdbId}`;
}
