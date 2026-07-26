import { NextResponse } from 'next/server';
import { providerCapabilities, getLiveSchedule, hasFullGridProvider } from '@/lib/viewing/liveTv';
import {
  TvMediaAdapter, TVM_API_KEY_ENV, TVM_BASE_URL_ENV, TVM_LINEUP_ENV, TVM_ZIP_ENV,
} from '@/lib/viewing/adapters/tvMedia';
import { COVERAGE } from '@/lib/viewing/adapters/tvmaze';

export const dynamic = 'force-dynamic';

/**
 * SCHEDULE PROVIDER HEALTH — "is Live TV actually wired up, and to what?"
 *
 * Reports configuration by PRESENCE and results by COUNT. No credential, no
 * lineup contents, no listing rows. Safe to leave publicly reachable, and the
 * thing whose absence made the original outage undiagnosable: the grid source
 * had been blocked for an unknown length of time and nothing anywhere said so.
 */
export async function GET() {
  const headers = { 'cache-control': 'no-store' };
  const providers = providerCapabilities();
  const tvm = new TvMediaAdapter();

  const env = {
    [TVM_API_KEY_ENV]: !!process.env[TVM_API_KEY_ENV],
    [TVM_LINEUP_ENV]: !!process.env[TVM_LINEUP_ENV],
    [TVM_ZIP_ENV]: !!process.env[TVM_ZIP_ENV],
    [TVM_BASE_URL_ENV]: !!process.env[TVM_BASE_URL_ENV],
  };

  if (!tvm.isConfigured() && !hasFullGridProvider()) {
    return NextResponse.json({
      mode: 'partial',
      message: 'No TV Media credentials configured.',
      liveTvComplete: false,
      env,
      providers,
      supplementary: {
        providerId: 'tvmaze_premieres',
        isFullGrid: COVERAGE.isFullGrid,
        note: `Premiere feed only (~${COVERAGE.typicalRowsPerUsDay} rows per US day). Omits: ${COVERAGE.omits.join(', ')}.`,
      },
      nextStep:
        `Set ${TVM_API_KEY_ENV} and ${TVM_LINEUP_ENV} (or ${TVM_ZIP_ENV}) in Vercel ` +
        '(Production + Preview) and redeploy. See docs/SCHEDULE_PROVIDERS.md.',
    }, { headers });
  }

  // Configured: make one real bounded call and report only its shape.
  const now = Date.now();
  const rs = await getLiveSchedule({ hours: 6, nowMs: now, pageSize: 30 }).catch(() => null);

  return NextResponse.json({
    mode: rs?.status === 'healthy' ? 'complete' : 'degraded',
    liveTvComplete: rs?.status === 'healthy',
    env,
    providers,
    probe: rs
      ? {
          status: rs.status,
          statusMessage: rs.statusMessage,
          totalAvailable: rs.totalAvailable,
          totalReturned: rs.totalReturned,
          fallbackUsed: rs.fallbackUsed,
          traceId: rs.traceId,
          // Counts and statuses only — never the listings themselves.
          sources: rs.sources.map((s) => ({
            sourceId: s.sourceId, status: s.status, rawCount: s.rawCount, errorCode: s.errorCode ?? null,
          })),
          distinctChannels: new Set(rs.results.map((r) => r.channelId)).size,
        }
      : null,
  }, { headers });
}
