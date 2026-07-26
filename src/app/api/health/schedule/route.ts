import { NextResponse } from 'next/server';
import { SchedulesDirectAdapter, SD_USERNAME_ENV, SD_PASSWORD_ENV, SD_LINEUP_ENV } from '@/lib/viewing/adapters/schedulesDirect';
import { TvmazeAdapter, COVERAGE } from '@/lib/viewing/adapters/tvmaze';

export const dynamic = 'force-dynamic';

/**
 * SCHEDULE PROVIDER PROBE — "is Live TV actually wired up?"
 *
 * Reports whether each provider is configured and reachable. It reports the
 * PRESENCE of each variable and never its value: no username, no password, no
 * lineup contents, no listing data. That is what makes it safe to leave on.
 *
 * This endpoint exists because the previous failure was undiagnosable — the
 * grid source had been WAF-blocked for an unknown length of time and nothing
 * anywhere said so.
 */
export async function GET() {
  const headers = { 'cache-control': 'no-store' };
  const sd = new SchedulesDirectAdapter();
  const configured = sd.isConfigured();

  const env = {
    [SD_USERNAME_ENV]: !!process.env[SD_USERNAME_ENV],
    [SD_PASSWORD_ENV]: !!process.env[SD_PASSWORD_ENV],
    [SD_LINEUP_ENV]: !!process.env[SD_LINEUP_ENV],
  };

  if (!configured) {
    return NextResponse.json({
      primary: {
        providerId: sd.providerId,
        configured: false,
        status: 'misconfigured',
        env,
        nextStep:
          'Live TV has no full-grid provider on this deployment. Follow docs/SCHEDULE_PROVIDERS.md — ' +
          'create a Schedules Direct account, then set the three variables in Vercel (Production + Preview) and redeploy.',
      },
      supplementary: {
        providerId: new TvmazeAdapter().providerId,
        configured: true,
        isFullGrid: COVERAGE.isFullGrid,
        note: `Premiere feed only (~${COVERAGE.typicalRowsPerUsDay} rows per US day). Omits: ${COVERAGE.omits.join(', ')}.`,
      },
      liveTvUsable: false,
    }, { headers });
  }

  // Configured: make one real, bounded call and report only the shape of it.
  const now = Date.now();
  const res = await sd.fetch({
    region: 'US',
    windowStartUtc: now,
    windowEndUtc: now + 3_600_000,
    lineupId: process.env[SD_LINEUP_ENV] ?? null,
  }).catch(() => null);

  return NextResponse.json({
    primary: {
      providerId: sd.providerId,
      configured: true,
      env,
      status: res?.status ?? 'unavailable',
      // Counts only — never the listings themselves.
      totalRaw: res?.totalRaw ?? 0,
      totalNormalized: res?.totalNormalized ?? 0,
      errorCode: res?.errorCode ?? null,
      fetchedAt: res?.fetchedAt ?? null,
    },
    supplementary: {
      providerId: new TvmazeAdapter().providerId,
      isFullGrid: COVERAGE.isFullGrid,
    },
    liveTvUsable: res?.status === 'healthy',
  }, { headers });
}
