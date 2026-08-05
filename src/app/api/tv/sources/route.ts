import { NextResponse } from 'next/server';
import { FEASIBILITY_MATRIX, blockedOn, availableWithoutCredentials } from '@/lib/tv/sources/feasibility';
import { STAGE_LABEL } from '@/lib/tv/supportStage';

export const dynamic = 'force-dynamic';

/**
 * THE SOURCE FEASIBILITY MATRIX, AS AN API.
 *
 * Public because everything in it is a statement about what this product does
 * and does not use, and which of those are blocked on what. No credential, no
 * endpoint, no internal hostname — a verdict, a reason, and a fallback.
 *
 * Being able to read "TV Media: conditional, disabled, needs two explicit
 * keys" from outside is the point: a claim nobody can check is a claim.
 */
export async function GET() {
  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      stageLabels: STAGE_LABEL,
      sources: FEASIBILITY_MATRIX.map((r) => ({
        slug: r.slug, name: r.name, sourceType: r.sourceType,
        capabilities: r.capabilities, coverageLevel: r.coverageLevel,
        accessibility: r.accessibility, authType: r.authType, geography: r.geography,
        completeness: r.completeness, rateLimits: r.rateLimits,
        terms: r.termsSummary, attributionRequired: r.attributionRequired,
        parserComplexity: r.parserComplexity, fallback: r.fallback,
        supportStage: r.stage, verdict: r.verdict, reason: r.reason,
        costClass: r.costClass,
      })),
      usableWithNoCredentials: availableWithoutCredentials().map((r) => r.slug),
      blockedOn: blockedOn(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
