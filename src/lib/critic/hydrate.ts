/**
 * FINGERPRINT HYDRATION — giving a resolved identity something to say.
 *
 * ── THE GAP THIS CLOSES ───────────────────────────────────────────────────
 * GC2 established WHICH title the user meant and deliberately stopped there:
 * `resolveAnchor` leaves `dims` undefined, so `objectiveAuthority` returns 0
 * and the critic term is inert. Correct, and useless — a perfectly resolved
 * anchor still could not move a single recommendation.
 *
 * ── ONE TITLE, ONE FINGERPRINT VOCABULARY ─────────────────────────────────
 * The dimensions come from `title_dimensions` through `getCachedDimensions` —
 * the same table, the same reader and the same `isValidDimensions` gate the
 * production ranker already trusts. There is deliberately no `critic_dimensions`
 * table, no critic-only classifier and no second enrichment path: a title that
 * means one thing to the ranker and another to the critic is a system that can
 * explain a recommendation it did not make.
 *
 * ── CACHE-ONLY, BY CONSTRUCTION ───────────────────────────────────────────
 * `getCachedDimensions` never classifies — its own docblock says so — which is
 * exactly the property the request path needs: no AI call, no remote
 * classification, no latency cliff on a miss. A missing fingerprint is a
 * MISSING FINGERPRINT: the anchor stays unhydrated, earns zero authority, and
 * ranking degrades to the behaviour that existed before the critic. Nothing is
 * invented to fill the hole.
 *
 * The backfill that populates the cache already exists (`/api/cron/classify`,
 * which calls `getTitleDimensions`). Hydration DEPENDS on it and must not
 * bypass it — an anchor the classifier has not reached yet is silent until it
 * does, which is a coverage question rather than a correctness one.
 *
 * ── IDENTITY MUST SURVIVE ─────────────────────────────────────────────────
 * Lookup is by `tmdbId` + `mediaType` only. No title string is used as identity
 * after GC2 resolved it — reintroducing one here would undo that gate a layer
 * later, quietly.
 *
 * The loader is injected so this module performs no I/O of its own and stays
 * testable without a database; production passes `getCachedDimensions`.
 */

import { isValidDimensions, type TitleDimensions } from '@/lib/scoring/dimensions';
import type { AnchorResolution } from './anchor';

/**
 * The cache key, exactly as `getCachedDimsBatch` builds it: `media_type` first,
 * then the id, hyphen-separated.
 *
 * THE COMPOSITE IS LOAD-BEARING. `title_dimensions` is queried by `tmdb_id`
 * ALONE (`.in('tmdb_id', ids)`), so the returned rows can include a series that
 * happens to share a film's numeric id. Only keying the lookup on media type as
 * well stops a movie anchor silently adopting a TV fingerprint — which would
 * not error anywhere, and would make the critic confidently wrong.
 */
export const dimensionCacheKey = (mediaType: 'movie' | 'tv', tmdbId: number): string =>
  `${mediaType}-${tmdbId}`;

/** The read this module needs. `getCachedDimensions` satisfies it as-is. */
export type DimensionLoader = (
  keys: { tmdb_id: number; media_type: 'movie' | 'tv' }[],
) => Promise<Map<string, TitleDimensions>>;

/**
 * Attach canonical fingerprints to the resolved anchors in a batch.
 *
 * Returns the resolutions in the SAME ORDER and of the same shape, so the
 * authority arithmetic in `anchorsToObjective` still sees everything that was
 * asked for — including the anchors that could not be placed. Renormalising
 * over only the successful ones is the mistake that reports a half-understood
 * request as fully understood.
 */
export async function hydrateAnchors(
  resolutions: readonly AnchorResolution[],
  load: DimensionLoader,
): Promise<AnchorResolution[]> {
  const resolved = resolutions.filter(
    (r): r is Extract<AnchorResolution, { status: 'resolved' }> => r.status === 'resolved',
  );
  if (resolved.length === 0) return [...resolutions];

  const keys = resolved.map((r) => ({
    tmdb_id: r.anchor.tmdbId,
    media_type: r.anchor.mediaType,
  }));

  let cache: Map<string, TitleDimensions>;
  try {
    cache = await load(keys);
  } catch {
    /* A missing table or a failed read degrades to "no fingerprints", which is
       already a safe state. It must never become an invented one. */
    return [...resolutions];
  }

  return resolutions.map((r) => {
    if (r.status !== 'resolved') return r;
    const dims = cache.get(dimensionCacheKey(r.anchor.mediaType, r.anchor.tmdbId));
    /* THE SAME VALIDITY GATE THE CACHE ITSELF USES. A partial blob is not a
       weaker fingerprint — it is not a fingerprint, and treating any non-null
       JSON as authoritative is how a half-classified title starts steering
       recommendations. Checked here too because a loader is injectable. */
    if (!dims || !isValidDimensions(dims)) return r;
    return { ...r, anchor: { ...r.anchor, dims } };
  });
}
