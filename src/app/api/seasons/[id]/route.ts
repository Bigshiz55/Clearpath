import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * Per-season streaming availability for a TV show (Watchmode episode-level).
 *
 * DISABLED — this used to call Watchmode's `/episodes/` endpoint live, once
 * per request (`getWatchmodeSeasons` in `src/lib/watchmode/client.ts`,
 * still present and self-contained, just no longer called from here). That
 * is exactly the pattern the free-tier budget guard
 * (`src/lib/watchmode/sync.ts`) exists to prevent: any live per-request
 * Watchmode call is unbounded under real traffic and can burn a month's
 * 2,000-call budget in hours, regardless of which endpoint it hits.
 *
 * The sync job only fetches TITLE-level availability today, not per-season/
 * episode data, so there is no cache to read here yet either — `{ seasons:
 * [] }` is the same graceful "nothing to show" response the UI already
 * handled before a key was ever configured. Re-enabling this would need its
 * own cron-synced, cache-backed source, same shape as
 * `watchmode_availability`.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ seasons: [] });
}
