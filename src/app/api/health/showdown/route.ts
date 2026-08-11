import { NextResponse } from 'next/server';
import { getCachedDimensions } from '@/lib/titleDimensions';
import {
  MIN_USABLE_COVERAGE,
  assessCoverage,
  diagnosticDimensionKeys,
} from '@/lib/showdown/dimensionCoverage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * IS SHOWDOWN ACTUALLY LIVE?
 *
 * "Live" here does not mean the route renders — it means a completed
 * calibration can reach the ranker. That depends on the 46 diagnostic titles
 * carrying fingerprints in `title_dimensions`, and the failure when they do not
 * is completely silent: the session finishes, the events insert, the results
 * screen celebrates, and the recommendation order never moves.
 *
 * This is the deterministic answer, and it deliberately reports a NUMBER rather
 * than a boolean alone, because "34 of 46" and "0 of 46" are the same kind of
 * broken to a boolean and very different problems to an operator.
 *
 * Read-only, no secrets: catalogue ids and a count. It reads the fingerprint
 * cache and classifies nothing — generation is `/api/cron/classify`, in batch,
 * because CLAUDE.md forbids an LLM call on a request path.
 */
export async function GET() {
  const cached = await getCachedDimensions(diagnosticDimensionKeys());
  const coverage = assessCoverage(cached);

  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      covered: coverage.covered,
      total: coverage.total,
      ratio: Number(coverage.ratio.toFixed(3)),
      threshold: MIN_USABLE_COVERAGE,
      /** False means a completed Showdown cannot influence recommendations. */
      usable: coverage.usable,
      missing: coverage.missing,
      remedy:
        coverage.missing.length > 0
          ? 'Run GET /api/cron/classify (CRON_SECRET) until `usable` is true; it prioritises the diagnostic catalogue.'
          : null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
