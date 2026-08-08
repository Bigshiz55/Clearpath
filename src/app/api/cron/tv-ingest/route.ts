import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runGatedTvIngest } from '@/lib/viewing/ingest/scheduledIngest';

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
 * REGISTERED in vercel.json as an hourly cron (`0 * * * *`). Vercel now allows
 * up to 100 cron jobs per project on every plan (as of 2026-01-20), so the
 * earlier two-cron ceiling that kept this route off the schedule no longer
 * applies. The route is idempotent under the hourly tick: TVmaze runs at most
 * once per UTC day and TV Media at most once per two hours, each gated against
 * `tv_ingestion_runs`, so the extra ticks are cheap no-ops. `/api/cron/daily-scan`
 * still calls the same gated ingest once a day as a harmless belt-and-suspenders
 * fallback, so the ingested tables stay warm even if an hourly tick is missed.
 *
 * The browser never reaches either provider: this is the only path that does.
 */

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function GET(req: Request) {
  // Vercel Cron sends this header; a bare public hit must not spend calls.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    const key = new URL(req.url).searchParams.get('key');
    if (auth !== `Bearer ${secret}` && key !== secret) return unauthorized();
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({
      ran: false,
      reason: 'Admin Supabase client unavailable (missing SUPABASE_SERVICE_ROLE_KEY).',
    }, { status: 200 });
  }

  const { tvmaze, tvmazeNational, tvmedia } = await runGatedTvIngest(admin);
  // 502 is reserved for a provider actually FAILING upstream. A missing or
  // unconfigured key is a configuration state — it now writes its own
  // 'skipped' run row with a machine-readable code (see tvMediaWriter), and
  // answering 502 for it every hour buried the one real signal this status
  // code carries.
  const tvmazeOk = (tvmaze as { ok?: boolean }).ok !== false;
  const tvmediaUpstreamFailure =
    tvmedia.ok === false && ['auth_failed', 'rate_limited', 'upstream_failed'].includes(tvmedia.status);
  return NextResponse.json({ tvmaze, tvmazeNational, tvmedia }, { status: tvmazeOk && !tvmediaUpstreamFailure ? 200 : 502 });
}
