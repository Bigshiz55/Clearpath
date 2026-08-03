import 'server-only';
import type { createAdminClient } from '@/lib/supabase/admin';
import { runTvmazeIngest } from './tvmazeWriter';
import { runTvMediaIngest } from './tvMediaWriter';

/**
 * SHARED GATING — TV Media (primary) and TVmaze (fallback/supplement).
 *
 * Used by both `/api/cron/tv-ingest` (an hourly tick, for whoever ends up
 * triggering it — an external scheduler, or a future freed-up Vercel Cron
 * slot) and `/api/cron/daily-scan` (a guaranteed once-a-day tick, ridden here
 * because Vercel Hobby's two-cron cap is already spent on daily-scan and
 * classify). Same gating either way so running from a daily tick never
 * double-runs what an hourly tick would have already done:
 *
 *  - TVmaze: once per UTC calendar day, checked against `tv_ingestion_runs`
 *    rather than a fixed hour — its single national feed has no per-market
 *    local time to align to.
 *  - TV Media: at most once every two hours (its data only refreshes that
 *    often upstream). A cheap no-op with zero DB writes when
 *    `TVMEDIA_API_KEY` is unset, so this can be called unconditionally on
 *    every tick and let each ingest decide for itself whether there's
 *    anything to do.
 *
 * Full guide reads (`src/lib/tv/ingestedGuide.ts`) merge whatever both
 * writers have stored with no code change: TVmaze keeps carrying its own
 * Hallmark/Lifetime/crime channels either way, TV Media adds the rest once a
 * key exists and this has run at least once, and if TV Media has never run
 * the guide simply falls back to whatever TVmaze already ingested.
 */

const TVMAZE_INGEST_DAYS = 7;
const TVMEDIA_INGEST_DAYS = 14;
const TVMEDIA_MIN_INTERVAL_MS = 2 * 60 * 60 * 1000;

async function lastRunAt(
  admin: ReturnType<typeof createAdminClient>, providerId: string,
): Promise<string | null> {
  const { data } = await admin
    .from('tv_ingestion_runs')
    .select('started_at, status')
    .eq('provider_id', providerId)
    .in('status', ['success', 'partial'])
    .order('started_at', { ascending: false })
    .limit(1);
  return data?.[0]?.started_at ?? null;
}

export async function runGatedTvIngest(admin: ReturnType<typeof createAdminClient>) {
  const today = new Date().toISOString().slice(0, 10);

  const { data: todaysRuns } = await admin
    .from('tv_ingestion_runs')
    .select('id, status, started_at')
    .eq('provider_id', 'tvmaze')
    .gte('started_at', `${today}T00:00:00.000Z`)
    .order('started_at', { ascending: false })
    .limit(1);
  const alreadyRanToday = (todaysRuns ?? []).some((r) => r.status === 'success' || r.status === 'partial');
  const tvmaze = alreadyRanToday
    ? { ran: false, reason: `Already ran today (${today}, UTC).` }
    : { ran: true, ...(await runTvmazeIngest(TVMAZE_INGEST_DAYS)) };

  const lastTvMediaRun = await lastRunAt(admin, 'tv_media');
  const tvMediaDue = !lastTvMediaRun || (Date.now() - Date.parse(lastTvMediaRun)) >= TVMEDIA_MIN_INTERVAL_MS;
  const tvmedia = tvMediaDue
    ? await runTvMediaIngest(TVMEDIA_INGEST_DAYS)
    : { ok: true, ran: false, reason: `Ran within the last 2h (${lastTvMediaRun}).` };

  return { tvmaze, tvmedia };
}
