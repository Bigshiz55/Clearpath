import { NextResponse } from 'next/server';
import { authorizeTvAdmin } from '@/lib/tv/platform/adminAuth';
import { recentEgress, egressCounts } from '@/lib/tv/egressGuard';
import { dataModeReport } from '@/lib/tv/dataMode';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * ADMIN — DID ANYTHING CALL OUT, AND WAS IT ALLOWED TO?
 *
 * The in-process ring buffer, plus the standing policy. Admin-only not
 * because it carries secrets — it carries none, by construction — but because
 * a per-instance call log is operational detail that would only mislead an
 * ordinary reader, who would see "0 requests" from a fresh instance and
 * conclude something about the fleet.
 *
 * That per-instance limitation is stated in the response rather than left for
 * someone to discover.
 */
export async function GET(request: Request) {
  const auth = await authorizeTvAdmin(request);
  if (!auth.authorized) return NextResponse.json({ error: auth.reason }, { status: 403 });

  const counts = egressCounts();
  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    dataMode: dataModeReport(),
    counts,
    recent: recentEgress(100),
    scope: 'THIS SERVERLESS INSTANCE ONLY, since it started. Not a fleet-wide or historical ledger — source_requests is the durable record.',
    deniedMeteredAttempts: counts.byAdapter['tv_media']?.denied ?? 0,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
