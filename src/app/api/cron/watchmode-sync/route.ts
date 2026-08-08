import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runWatchmodeSync } from '@/lib/watchmode/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Watchmode streaming-availability sync — title-map import (once/day) +
 * up to 50 titles' availability, budget-guarded at 2,000 calls/month. See
 * `src/lib/watchmode/sync.ts` for the full contract.
 *
 * NOT registered in vercel.json — a once-a-day sync doesn't need its own cron
 * entry. `/api/cron/daily-scan` calls `runWatchmodeSync` directly alongside
 * the TV ingest it rides along on, so the sync still runs automatically once a
 * day. This route exists for anyone who wants to trigger it by hand or from an
 * external scheduler. (Vercel now allows up to 100 cron jobs per project on
 * every plan as of 2026-01-20, so a dedicated entry could be added if a
 * tighter cadence were ever wanted — the daily piggyback is simply enough.)
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization');
    const key = new URL(request.url).searchParams.get('key');
    if (auth !== `Bearer ${secret}` && key !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const admin = createAdminClient();
    const result = await runWatchmodeSync(admin);
    // Not running (no key yet, or the budget guard held back) is a normal,
    // expected outcome — never a 4xx/5xx just because there was nothing to do.
    return NextResponse.json({ ...result, ranAt: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Watchmode sync failed.' }, { status: 500 });
  }
}
