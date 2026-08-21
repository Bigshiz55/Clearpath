import 'server-only';

/**
 * RECOMMENDATION FILTER TYPES — the shape `recommend.ts` (the live engine
 * behind /app/watch, /api/dna-mirror and the slate server actions) applies
 * when a recalculation carries constraints.
 *
 * WHAT USED TO LIVE HERE, AND WHY IT IS GONE (graph Phase 7, cross-surface
 * consolidation): this module also carried a THIRD natural-language reader —
 * a regex pass plus its own model prompt — whose only caller was the
 * `/api/recommendations` POST, an HTTP route with zero callers anywhere in
 * the product. A parser reachable only from an unreachable door is not a
 * feature, it is another interpretation of English waiting to drift from
 * the canonical one. The route and the reader were deleted together; the
 * filter TYPES stay because the live recommender genuinely consumes them.
 */
export interface RecFilters {
  excludeGenreIds: number[];
  mediaType: 'movie' | 'tv' | 'any';
  minYear: number | null; // "too many old movies" → a recency floor
  maxYear: number | null; // "give me the classics" → an age floor
  maxRuntime: number | null; // "too long" → minutes ceiling
}

export const NO_FILTERS: RecFilters = {
  excludeGenreIds: [],
  mediaType: 'any',
  minYear: null,
  maxYear: null,
  maxRuntime: null,
};

export function hasFilters(f: RecFilters): boolean {
  return (
    f.excludeGenreIds.length > 0 ||
    f.mediaType !== 'any' ||
    f.minYear != null ||
    f.maxYear != null ||
    f.maxRuntime != null
  );
}
