/**
 * DAILY FETCH PRIORITY — pure, no I/O.
 *
 * Which ~50 titles get a Watchmode call today, in order: watchlist first
 * (someone is actively deciding), the docket next (tonight's shortlist —
 * currently always empty, see the doc comment on `docket` below), Pack
 * pages next (Hallmark/Lifetime/Crime content), then everything else. A
 * title already checked within the last 14 days is skipped regardless of
 * tier — availability doesn't change fast enough to justify spending a call
 * on it sooner.
 */

export type PriorityTier = 'watchlist' | 'docket' | 'pack' | 'catalog';

export interface PriorityCandidate {
  tmdbId: number;
  tmdbMediaType: 'movie' | 'tv';
  watchmodeId: number;
  tier: PriorityTier;
}

/** Lower sorts first. `docket` is a real tier in the ordering even though no
 *  candidates are ever produced for it today — the docket
 *  (`src/lib/docketStore.ts`) is browser-localStorage-only, with no server
 *  table, so a server-side daily batch job has no way to see it. Nothing
 *  fabricates docket candidates to fill this tier; it is honestly empty
 *  until (if ever) the docket gets a server-side counterpart. */
const TIER_ORDER: Record<PriorityTier, number> = { watchlist: 0, docket: 1, pack: 2, catalog: 3 };

export const DAILY_FETCH_CAP = 50;
export const REFRESH_INTERVAL_MS = 14 * 24 * 60 * 60 * 1000;

export function titleKey(tmdbId: number, tmdbMediaType: 'movie' | 'tv'): string {
  return `${tmdbMediaType}:${tmdbId}`;
}

/**
 * Build today's batch: dedupe (a title can legitimately appear in more than
 * one tier — keep its highest-priority occurrence), drop anything fetched
 * within `REFRESH_INTERVAL_MS`, sort by tier (stable — each tier's incoming
 * order, e.g. "most recently added to the watchlist first", survives), and
 * cap at `cap`.
 */
export function selectDailyBatch(
  candidates: readonly PriorityCandidate[],
  lastFetchedAtMs: ReadonlyMap<string, number>,
  nowMs: number,
  cap = DAILY_FETCH_CAP,
): PriorityCandidate[] {
  const byKey = new Map<string, PriorityCandidate>();
  for (const c of candidates) {
    const key = titleKey(c.tmdbId, c.tmdbMediaType);
    const existing = byKey.get(key);
    if (!existing || TIER_ORDER[c.tier] < TIER_ORDER[existing.tier]) byKey.set(key, c);
  }

  const due = [...byKey.values()].filter((c) => {
    const last = lastFetchedAtMs.get(titleKey(c.tmdbId, c.tmdbMediaType));
    return last == null || nowMs - last >= REFRESH_INTERVAL_MS;
  });

  due.sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]);
  return due.slice(0, cap);
}
