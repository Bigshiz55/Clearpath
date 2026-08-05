import { NextResponse } from 'next/server';
import { authorizeTvAdmin } from '@/lib/tv/platform/adminAuth';
import { runSyncSimulation } from '@/lib/tv/fixtures/simulation';
import { SMALL_SCALE } from '@/lib/tv/fixtures/generator';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * ADMIN — RUN THE SYNCHRONISATION SIMULATION ON DEMAND.
 *
 * Thirty simulated days of three-hourly cycles, in well under a second,
 * returning the invariant results rather than a wall of cycles. An operator
 * can therefore answer "would a month of this hold up" before committing to
 * a provider, instead of finding out over a month.
 *
 * Bounded to 90 days so a query string cannot turn this into a denial of
 * service against our own function budget.
 */
export async function GET(request: Request) {
  const auth = await authorizeTvAdmin(request);
  if (!auth.authorized) return NextResponse.json({ error: auth.reason }, { status: 403 });

  const url = new URL(request.url);
  const daysRaw = Number(url.searchParams.get('days') ?? '30');
  const days = Number.isFinite(daysRaw) ? Math.min(Math.max(1, daysRaw), 90) : 30;
  const seed = url.searchParams.get('seed') ?? 'watchverdict-fixture-v1';

  const report = runSyncSimulation({ seed, profile: { ...SMALL_SCALE }, days });
  const { cycles, ...summary } = report;

  return NextResponse.json({
    ...summary,
    seed,
    // The first and last few cycles are enough to see the shape; the full
    // 240 would be a 60KB response nobody reads.
    firstCycles: cycles.slice(0, 5),
    lastCycles: cycles.slice(-5),
    degradedCycles: cycles.filter((c) => c.supportStage === 'degraded').length,
    allInvariantsHeld: Object.values(report.invariants).every(Boolean),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
