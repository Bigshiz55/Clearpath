import { NextResponse } from 'next/server';
import { serverEnv, ConfigError } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';
import { runDailyScan } from '@/lib/digest';
import { runGatedTvIngest } from '@/lib/viewing/ingest/scheduledIngest';
import { runWatchmodeSync } from '@/lib/watchmode/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * TV listings ingest, riding this daily tick as a harmless fallback. The
 * authoritative schedule is now `/api/cron/tv-ingest`, registered directly in
 * vercel.json at an hourly cadence (Vercel allows up to 100 cron jobs per
 * project on every plan as of 2026-01-20, so there is no longer a two-cron
 * ceiling forcing TV ingest to piggyback here). A full guide only needs the
 * tables kept warm, so this daily call stays as belt-and-suspenders: if an
 * hourly tick is ever missed, the ingested guide (`getIngestedGuideAirings`)
 * still never goes permanently empty. Both providers gate themselves (see
 * `runGatedTvIngest`), and a failure here must never fail the release-notes
 * scan above it.
 */
async function runTvIngest(admin: ReturnType<typeof createAdminClient>) {
  try {
    return await runGatedTvIngest(admin);
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'TV ingest failed.' };
  }
}

/**
 * Watchmode streaming-availability sync, riding this same daily tick for the
 * same one-cron-slot reason TV ingest does — see `/api/cron/watchmode-sync`
 * for the full explanation. `runWatchmodeSync` never throws on a Watchmode-
 * side failure by itself, but this wrapper exists as the same belt-and-
 * suspenders as `runTvIngest` above: a bug here must never fail the release-
 * notes scan or the TV ingest that already run on this route.
 */
async function runWatchmode(admin: ReturnType<typeof createAdminClient>) {
  try {
    return await runWatchmodeSync(admin);
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Watchmode sync failed.' };
  }
}

/**
 * Daily new-release scan, plus TV listings ingest. Intended to be invoked by
 * Vercel Cron (see vercel.json). Protected by CRON_SECRET: the caller must
 * send `Authorization: Bearer <secret>` (Vercel Cron does this automatically
 * when CRON_SECRET is set) or `?key=<secret>`.
 */
export async function GET(request: Request) {
  const secret = serverEnv.cronSecret();
  if (!secret) {
    return NextResponse.json(
      { error: 'Daily scan is not configured (missing CRON_SECRET).' },
      { status: 503 },
    );
  }

  const auth = request.headers.get('authorization');
  const key = new URL(request.url).searchParams.get('key');
  if (auth !== `Bearer ${secret}` && key !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const summary = await runDailyScan(admin);
    const tvIngest = await runTvIngest(admin);
    const watchmode = await runWatchmode(admin);
    return NextResponse.json({ ok: true, ...summary, tvIngest, watchmode, ranAt: new Date().toISOString() });
  } catch (e) {
    if (e instanceof ConfigError) {
      return NextResponse.json({ error: e.userMessage }, { status: 503 });
    }
    return NextResponse.json({ error: 'Scan failed.' }, { status: 500 });
  }
}
