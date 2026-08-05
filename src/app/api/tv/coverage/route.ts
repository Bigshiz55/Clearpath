import { NextResponse } from 'next/server';
import { dataModeReport } from '@/lib/tv/dataMode';
import { queryWatchNow } from '@/lib/tv/platform/query';
import { SCALE, countCorpus } from '@/lib/tv/fixtures/generator';
import { FEASIBILITY_MATRIX } from '@/lib/tv/sources/feasibility';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * COVERAGE — what this deployment can actually answer, and from where.
 *
 * Deliberately honest about the difference between the corpus this product
 * can EXERCISE and the data it can SHOW. In fixture mode those are the same
 * number and the response says so; in production the corpus counts are
 * declared as targets, not as availability, because a fixture row is never
 * real coverage.
 *
 * The fixture census is computed at the SMALL profile here — a full-scale
 * count takes ~16 seconds, which is fine in a script and not fine in a
 * request handler. The full-scale figures come from `scripts/fixtureCorpus.ts`.
 */
export async function GET() {
  const mode = dataModeReport();
  const sample = queryWatchNow({ limit: 5 });

  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      dataMode: mode,
      watchNowStatus: sample.status,
      watchNowMessage: sample.message,
      fixtureScaleTargets: SCALE,
      sources: FEASIBILITY_MATRIX.map((r) => ({
        slug: r.slug, stage: r.stage, verdict: r.verdict,
        coverageLevel: r.coverageLevel, capabilities: r.capabilities,
        costClass: r.costClass,
      })),
      // What a normal user could actually be shown right now, per capability.
      userVisibleSources: FEASIBILITY_MATRIX
        .filter((r) => r.stage === 'verified' || r.stage === 'production_supported')
        .map((r) => r.slug),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
