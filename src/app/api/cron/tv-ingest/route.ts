import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runTvmazeIngest } from '@/lib/viewing/ingest/tvmazeWriter';
import { runTvMediaIngest } from '@/lib/viewing/ingest/tvMediaWriter';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * TV INGESTION — TV Media (primary) and TVmaze (fallback/supplement).
 *
 * TVmaze needs no credentials, so unlike the TV Media / Schedules Direct path
 * this route used to plan for (and never actually ran — the writer didn't
 * exist yet), there is nothing to configure and nothing to gate on. It runs
 * once per UTC calendar day, checked against `tv_ingestion_runs` rather than a
 * fixed hour — TVmaze's single national feed has no per-market local time to
 * align to the way a ZIP-based lineup would — and is a no-op on every other
 * hourly cron tick.
 *
 * TV Media is metered and its data only refreshes every two hours upstream
 * (CHANGES §6), so it is gated separately: at most once every two hours,
 * checked the same way against `tv_ingestion_runs`. It is a cheap no-op with
 * zero DB writes when `TVMEDIA_API_KEY` is unset (see runTvMediaIngest) — so
 * this route can run TVmaze and TV Media unconditionally on every tick and
 * let each ingest decide for itself whether there is anything to do. Full
 * guide reads (`src/lib/tv/ingestedGuide.ts`) merge whatever both writers
 * have stored with no code change: TVmaze keeps carrying its own
 * Hallmark/Lifetime/crime channels either way, TV Media adds the rest once a
 * key exists, and if TV Media has never run the guide simply falls back to
 * whatever TVmaze already ingested (CHANGES §7 — never a blank page).
 *
 * NOT registered in vercel.json — see docs/SCHEDULE_PROVIDERS.md and this
 * route's own auth gate: Vercel Hobby caps at two cron jobs, both already
 * spent on daily-scan and classify. Trigger this hourly from an external
 * scheduler (GitHub Actions `schedule:`, or Supabase pg_cron) with the
 * CRON_SECRET bearer token until either a cron slot frees up or the project
 * moves to Pro. See the commit this route shipped with for the full writeup.
 *
 * The browser never reaches either provider: this is the only path that does.
 */

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

const INGEST_DAYS = 7;
const TVMEDIA_INGEST_DAYS = 14;
const TVMEDIA_MIN_INTERVAL_MS = 2 * 60 * 60 * 1000;

/** Most recent run (any status) for a provider, so both the "once a day" and
 *  "once every 2h" gates can be expressed as one age check. */
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

export async function GET(req: Request) {
  // Vercel Cron sends this header; a bare public hit must not spend calls.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    const key = new URL(req.url).searchParams.get('key');
    if (auth !== `Bearer ${secret}` && key !== secret) return unauthorized();
  }

  const today = new Date().toISOString().slice(0, 10);
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({
      ran: false,
      reason: 'Admin Supabase client unavailable (missing SUPABASE_SERVICE_ROLE_KEY).',
    }, { status: 200 });
  }

  // TVmaze: once per UTC calendar day. A partial run (some days failed) still
  // counts as "ran" — retrying it hourly on TVmaze's free API is a fine
  // default, but a full success should not re-run six more times before
  // midnight.
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
    : { ran: true, ...(await runTvmazeIngest(INGEST_DAYS)) };

  // TV Media: no more than once every two hours (CHANGES §6). A no-op with no
  // DB writes when unconfigured, so this check only matters once a key is
  // set — attempting the call every hour before that would be harmless but
  // wasteful against `tv_ingestion_runs`.
  const lastTvMediaRun = await lastRunAt(admin, 'tv_media');
  const tvMediaDue = !lastTvMediaRun || (Date.now() - Date.parse(lastTvMediaRun)) >= TVMEDIA_MIN_INTERVAL_MS;
  const tvmedia = tvMediaDue
    ? await runTvMediaIngest(TVMEDIA_INGEST_DAYS)
    : { ok: true, ran: false, reason: `Ran within the last 2h (${lastTvMediaRun}).` };

  const ok = (tvmaze as { ok?: boolean }).ok !== false && tvmedia.ok !== false;
  return NextResponse.json({ tvmaze, tvmedia }, { status: ok ? 200 : 502 });
}
