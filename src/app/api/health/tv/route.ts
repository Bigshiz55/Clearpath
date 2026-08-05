import { NextResponse } from 'next/server';
import { getTvHealth } from '@/lib/tv/health';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * TV LISTINGS PIPELINE HEALTH — the operator's window into the ingest.
 *
 * Public by the same reasoning as /api/health/schema: everything served is a
 * timestamp, a count, a coverage window, a boolean "is configured", or a
 * sanitized error CODE. No key material, no secret values, no raw provider
 * payloads — the service-role-only run/ledger tables are read server-side
 * and only these summaries leave.
 *
 * Exists because this pipeline broke for three days with no way to see it:
 * the hourly GitHub trigger 401'd, TV Media silently stopped, and the packs
 * looked "empty" while the DB held data they weren't linked to. Every one of
 * those states is a field here now.
 */
export async function GET() {
  try {
    const health = await getTvHealth();
    return NextResponse.json(health, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json(
      {
        generatedAt: new Date().toISOString(),
        verdict: 'degraded',
        error: e instanceof Error ? e.message : 'Health check failed.',
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
