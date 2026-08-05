import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runGatedTvIngest } from '@/lib/viewing/ingest/scheduledIngest';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * SELF-HEALING REFRESH — the trigger that does not depend on a shared secret.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 * The hourly external trigger (GitHub Actions → /api/cron/tv-ingest) has been
 * failing with HTTP 401 since the repository's CRON_SECRET diverged from the
 * deployment's, and nothing in this environment can write either secret. A
 * pipeline three Packs depend on must not have "two secrets in two vendors'
 * dashboards stay identical forever" as a single point of failure. This
 * route lets the product heal its own data: a pack page that detects stale
 * coverage fires one POST here, and operators (or an external scheduler)
 * can call it directly.
 *
 * ── WHY IT IS SAFE WITHOUT A SECRET ───────────────────────────────────────
 * It performs no caller-controlled work. It calls exactly what the
 * authenticated cron tick calls — `runGatedTvIngest` — whose own gates bound
 * the worst case regardless of who asks or how often:
 *
 *   - TVmaze runs at most once per UTC day (checked in tv_ingestion_runs);
 *   - TV Media runs at most once every 2 hours, inside its monthly call
 *     budget when one is configured;
 *   - everything else is a read of tv_ingestion_runs and an immediate no-op.
 *
 * Hammering this endpoint therefore costs the same as the hourly cron that
 * was already public knowledge, and can never exceed what the schedule
 * would have spent anyway. It writes nothing an attacker controls.
 */
export async function POST() {
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json(
      { ran: false, reason: 'Admin Supabase client unavailable (missing SUPABASE_SERVICE_ROLE_KEY).' },
      { status: 200 },
    );
  }

  const { tvmaze, tvmedia } = await runGatedTvIngest(admin);
  return NextResponse.json({ tvmaze, tvmedia }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}
