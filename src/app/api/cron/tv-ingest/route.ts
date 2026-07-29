import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runTvmazeIngest } from '@/lib/viewing/ingest/tvmazeWriter';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * DAILY TV INGESTION — TVmaze.
 *
 * TVmaze needs no credentials, so unlike the TV Media / Schedules Direct path
 * this route used to plan for (and never actually ran — the writer didn't
 * exist yet), there is nothing to configure and nothing to gate on. It runs
 * once per UTC calendar day, checked against `tv_ingestion_runs` rather than a
 * fixed hour — TVmaze's single national feed has no per-market local time to
 * align to the way a ZIP-based lineup would — and is a no-op on every other
 * hourly cron tick.
 *
 * NOT registered in vercel.json — see docs/SCHEDULE_PROVIDERS.md and this
 * route's own auth gate: Vercel Hobby caps at two cron jobs, both already
 * spent on daily-scan and classify. Trigger this hourly from an external
 * scheduler (GitHub Actions `schedule:`, or Supabase pg_cron) with the
 * CRON_SECRET bearer token until either a cron slot frees up or the project
 * moves to Pro. See the commit this route shipped with for the full writeup.
 *
 * The browser never reaches TVmaze: this is the only path that does.
 */

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

const INGEST_DAYS = 7;

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

  // Once per UTC calendar day. A partial run (some days failed) still counts
  // as "ran" — retrying it hourly on TVmaze's free API is a fine default, but
  // a full success should not re-run six more times before midnight.
  const { data: todaysRuns } = await admin
    .from('tv_ingestion_runs')
    .select('id, status, started_at')
    .eq('provider_id', 'tvmaze')
    .gte('started_at', `${today}T00:00:00.000Z`)
    .order('started_at', { ascending: false })
    .limit(1);

  const alreadyRanToday = (todaysRuns ?? []).some((r) => r.status === 'success' || r.status === 'partial');
  if (alreadyRanToday) {
    return NextResponse.json({ ran: false, reason: `Already ran today (${today}, UTC).` });
  }

  const result = await runTvmazeIngest(INGEST_DAYS);
  return NextResponse.json({ ran: true, ...result }, { status: result.ok ? 200 : 502 });
}
