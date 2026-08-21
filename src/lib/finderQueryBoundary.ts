import type { FinderQuery } from '@/lib/finder';

/**
 * THE ONE BOUNDARY WHERE A CLIENT-BUILT QUERY ENTERS THE SERVER.
 *
 * `/api/ask` and `/api/finder` each carried a private, byte-identical copy of
 * this whitelist — two competing definitions of what a client may claim.
 * Phase 7's ownership law says a boundary adapter converts ONCE; it does not
 * exist twice. This is the single definition; neither route may grow a local
 * copy again (pinned by src/lib/arch/semanticOwnership.test.ts).
 *
 * WHAT THIS IS FOR — and what it is not: a client query is legitimate input
 * ONLY as structured user state that never came from parsing English —
 * sliders the user dragged (the finder's `overrides` list), chips left after
 * a removal turn (no text travels), a provider carried by a deep link. When
 * raw text IS present, the server derives meaning from the text itself and
 * the client's parse of that same text is ignored — the browser is never a
 * semantic authority (see the routes' trust rules).
 *
 * The whitelist deliberately drops every semantic-extraction field
 * (subject*, keywordIds, castIds, people, excludeGenreIds, years,
 * similarTo…): those exist only server-side, derived from the sentence or
 * from canonical execution — a client cannot assert them.
 */
export function coerceClientQuery(raw: unknown): FinderQuery {
  const q = (raw ?? {}) as Partial<FinderQuery>;
  return {
    mediaType: q.mediaType === 'movie' || q.mediaType === 'tv' ? q.mediaType : 'any',
    genreIds: Array.isArray(q.genreIds) ? q.genreIds.map(Number).filter((n) => Number.isFinite(n)).slice(0, 6) : [],
    maxRuntime: typeof q.maxRuntime === 'number' ? q.maxRuntime : null,
    sinceMonths: typeof q.sinceMonths === 'number' ? q.sinceMonths : null,
    minAudience: typeof q.minAudience === 'number' ? q.minAudience : null,
    minImdb: typeof q.minImdb === 'number' ? q.minImdb : null,
    englishAudioOnly: Boolean(q.englishAudioOnly),
    onMyServices: Boolean(q.onMyServices),
    providerIds: Array.isArray(q.providerIds)
      ? q.providerIds.map(Number).filter((n) => Number.isFinite(n)).slice(0, 20)
      : undefined,
    minMatch: typeof q.minMatch === 'number' ? q.minMatch : null,
    streamItOnly: Boolean(q.streamItOnly),
    bingeableOnly: Boolean(q.bingeableOnly),
    upcoming: Boolean(q.upcoming),
    liveOnly: Boolean(q.liveOnly),
    pace: typeof q.pace === 'number' ? Math.max(0, Math.min(100, q.pace)) : null,
    originCountries: Array.isArray(q.originCountries) ? q.originCountries.map(String).slice(0, 4) : undefined,
    originalLanguages: Array.isArray(q.originalLanguages) ? q.originalLanguages.map(String).slice(0, 4) : undefined,
  };
}
