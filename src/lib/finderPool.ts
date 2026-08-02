/**
 * HOW BIG A CANDIDATE POOL DOES A REQUEST NEED?
 *
 * The finder asked TMDB for two pages per media type, deduped, and then took
 * the first SIXTEEN — a constant with no relationship to how many results the
 * caller wanted. So "movies under two hours" could not have returned more than
 * sixteen titles no matter what the limit said, and after the hard filters ran
 * (runtime, year, audience, services) it returned about eight. The number the
 * user saw was set by an internal cap, not by the catalogue.
 *
 * The pool has to be bigger than the answer, because hydration is where
 * candidates die: a movie whose runtime TMDB does not report cannot honestly be
 * called "under two hours", so it is dropped, and so are the ones that miss the
 * audience floor or are not on your services. `OVERSHOOT` is the headroom for
 * that attrition.
 *
 * It also has to be BOUNDED. Every candidate is a full hydration — metadata,
 * providers, critic aggregators — so an unbounded pool is a fan-out of hundreds
 * of upstream calls per search. Hence a ceiling, a wave size, and an early exit
 * once enough have survived.
 *
 * Pure. No I/O. `finder.ts` is server-only and cannot be unit-tested; this can.
 */

/** TMDB `/discover` returns 20 rows a page. */
export const PAGE_SIZE = 20;

/**
 * Candidates hydrated per result wanted. Roughly half of a discover page
 * survives a typical constraint set, and a request with several hard filters
 * loses more, so 3× leaves room to actually fill the grid.
 */
export const OVERSHOOT = 3;

/** Never hydrate more than this for one search, whatever the limit says. */
export const MAX_CANDIDATES = 96;

/** Never hydrate fewer than this — a tiny ask still deserves ranking choice. */
export const MIN_CANDIDATES = 24;

/** Hydrations in flight at once. Bounded so one search cannot flood TMDB. */
export const HYDRATE_CONCURRENCY = 8;

/** Candidates hydrated per wave before we check whether we can stop. */
export const WAVE_SIZE = 24;

/** How many candidates to pull for a request wanting `limit` results. */
export function candidateTarget(limit: number): number {
  const want = Math.max(1, Math.floor(limit));
  return Math.max(MIN_CANDIDATES, Math.min(MAX_CANDIDATES, want * OVERSHOOT));
}

/**
 * Which discover pages to request, per media type.
 *
 * The pool is split across the media types in play, so a movies-only ask goes
 * deeper into the movie catalogue than an "anything" ask does — the same total
 * fan-out either way.
 */
export function discoverPages(limit: number, typeCount: number): number[] {
  const perType = Math.ceil(candidateTarget(limit) / Math.max(1, typeCount));
  const pages = Math.max(2, Math.ceil(perType / PAGE_SIZE));
  // TMDB caps discover at 500 pages; we never come close, but keep it sane.
  return Array.from({ length: Math.min(pages, 10) }, (_, i) => i + 1);
}

/**
 * Enough survivors to stop hydrating.
 *
 * Not simply `limit`: results are ranked by match score after the fact, so
 * stopping at exactly the number requested would mean the last title shown was
 * also the last one looked at. The extra quarter is the ranking headroom.
 */
export function enoughSurvivors(limit: number): number {
  return Math.ceil(Math.max(1, limit) * 1.25);
}

/**
 * Map with bounded concurrency, preserving input order.
 *
 * `Promise.all` over the whole pool would open one request per candidate at
 * once — with a 96-candidate pool and ~6 upstream calls per hydration that is
 * several hundred simultaneous requests, which upstream answers with rate
 * limits rather than data.
 */
export async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Split into fixed-size waves, so hydration can stop once it has enough. */
export function waves<T>(items: readonly T[], size: number): T[][] {
  const n = Math.max(1, size);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}

/**
 * Did a resolved TMDB vibe/trope keyword ("feel-good", "cozy") starve an
 * otherwise-broad request?
 *
 * A keyword id from `searchKeywords` is the first plain-text match with no
 * usage or popularity gating, and TMDB's keyword tagging is crowd-sourced and
 * sparse — a fuzzy vibe word can resolve to an id tagged on only a handful of
 * titles catalogue-wide. Used as a hard `with_keywords` filter, that starves
 * a request down to almost nothing without ever hitting zero, so the ordinary
 * "nothing matched" fallback never sees it — the two-result "Something
 * feel-good and uplifting" defect. Detected on YIELD, not on the word itself:
 * a keyword that really is well-tagged keeps its precision untouched.
 */
export function isKeywordStarved(survivorCount: number, limit: number, hadKeywords: boolean): boolean {
  return hadKeywords && survivorCount < Math.max(1, Math.ceil(limit / 2));
}
