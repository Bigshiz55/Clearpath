import { NextResponse } from 'next/server';
import { runProductionCaseJob } from '@/lib/cases/productionCaseJob';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Rebuild Crime Case Files' case links from the programmes currently stored.
 *
 * Safe without a secret for the same reasons as /api/tv/refresh: it takes no
 * caller-controlled input, makes no upstream calls, and is idempotent —
 * cases are keyed by a content-derived slug, so running it twice updates the
 * same rows rather than duplicating them. It reads and writes only our own
 * derived data.
 *
 * It is deliberately NOT part of a page render: matching is O(n^2) over the
 * Pack's programmes, which is a background job's work, not a customer's.
 */
export async function POST() {
  try {
    const report = await runProductionCaseJob('crime-case-files');
    return NextResponse.json(report, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Case rebuild failed.' },
      { status: 500 },
    );
  }
}
