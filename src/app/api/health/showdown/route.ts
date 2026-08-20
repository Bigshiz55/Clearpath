import { NextResponse } from 'next/server';
import { readCachedDimensions } from '@/lib/titleDimensions';
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
  /* AND "0 OF 113" IS TWO DIFFERENT PROBLEMS TOO — the same argument as the
     docblock above, one level up. This read used to collapse an EMPTY table and
     an UNREADABLE one into the same empty Map, so the endpoint whose whole job
     is telling an operator what is wrong reported "covered: 0" for both. One of
     those is fixed by running the classifier; the other is fixed by giving the
     deployment a service-role key, and the classifier will not help at all.
     Sending an operator to the wrong remedy is worse than reporting nothing,
     because they will run it, watch the number stay at zero, and conclude the
     classifier is broken. */
  const evidence = await readCachedDimensions(diagnosticDimensionKeys());
  const coverage = assessCoverage(evidence.dims);
  const couldNotLook = evidence.status === 'unavailable';

  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      /** `ok` = this is what the catalog holds. `unavailable` = we did not
       *  look, and every count below measures nothing. */
      evidence: evidence.status,
      covered: coverage.covered,
      total: coverage.total,
      ratio: Number(coverage.ratio.toFixed(3)),
      threshold: MIN_USABLE_COVERAGE,
      /** False means a completed Showdown cannot influence recommendations. */
      usable: coverage.usable,
      missing: coverage.missing,
      remedy: couldNotLook
        ? 'The fingerprint cache could not be READ — this is not a coverage gap and the classifier will not fix it. Check SUPABASE_SERVICE_ROLE_KEY on this deployment and that the `title_dimensions` table exists.'
        : coverage.missing.length > 0
          ? 'Run GET /api/cron/classify (CRON_SECRET) until `usable` is true; it prioritises the diagnostic catalogue.'
          : null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
