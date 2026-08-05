import { NextResponse } from 'next/server';
import { authorizeTvAdmin } from '@/lib/tv/platform/adminAuth';
import { FEASIBILITY_MATRIX } from '@/lib/tv/sources/feasibility';
import { dataModeReport } from '@/lib/tv/dataMode';
import {
  evaluatePromotion, isLegalTransition, STAGE_LABEL, SUPPORT_STAGES,
  MIN_CONSECUTIVE_RUNS_FOR_PRODUCTION, type SupportStage, type PromotionEvidence,
} from '@/lib/tv/supportStage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * ADMIN — SOURCE CONTROL.
 *
 * GET  reports every source with its stage and what promotion would require.
 * POST evaluates a proposed stage change against the promotion gate.
 *
 * The POST deliberately does NOT take a stage and apply it. It takes EVIDENCE
 * and computes the stage, because a control that lets an operator type
 * "production_supported" into a box is a control that will eventually be used
 * that way at 2am. `evaluatePromotion` is the same pure function the tests
 * exercise, so the dashboard and the test suite cannot disagree.
 */
export async function GET(request: Request) {
  const auth = await authorizeTvAdmin(request);
  if (!auth.authorized) return NextResponse.json({ error: auth.reason }, { status: 403 });

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    authorizedVia: auth.via,
    dataMode: dataModeReport(),
    stages: SUPPORT_STAGES,
    stageLabels: STAGE_LABEL,
    minConsecutiveRunsForProduction: MIN_CONSECUTIVE_RUNS_FOR_PRODUCTION,
    sources: FEASIBILITY_MATRIX.map((r) => ({
      slug: r.slug, name: r.name, stage: r.stage, verdict: r.verdict,
      costClass: r.costClass, reason: r.reason,
      legalNextStages: SUPPORT_STAGES.filter((s) => isLegalTransition(r.stage, s)),
    })),
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const auth = await authorizeTvAdmin(request);
  if (!auth.authorized) return NextResponse.json({ error: auth.reason }, { status: 403 });

  let body: { slug?: string; evidence?: Partial<PromotionEvidence>; targetStage?: SupportStage };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Body must be JSON.' }, { status: 400 });
  }

  const source = FEASIBILITY_MATRIX.find((r) => r.slug === body.slug);
  if (!source) return NextResponse.json({ error: `Unknown source: ${body.slug}` }, { status: 404 });

  const evidence: PromotionEvidence = {
    consecutiveSuccessfulRuns: 0,
    recordCountWithinExpectedRange: false, coverageDatesValid: false,
    sampledAgainstOriginatingSource: false, timezonesCorrect: false,
    duplicateRateAcceptable: false, matchConfidenceMeasured: false,
    failureRetainsLastGood: false, servedFromStoredRecords: false,
    zeroBrowserTriggeredUpstreamRequests: false, independentlyDisableable: false,
    noFixtureOrPlaceholderRows: false, freshnessAndConfidenceExposed: false,
    attributionSatisfied: false,
    ...(body.evidence ?? {}),
  };

  const promotion = evaluatePromotion(evidence);
  const target = body.targetStage;
  const transitionLegal = target ? isLegalTransition(source.stage, target) : null;

  return NextResponse.json({
    slug: source.slug,
    currentStage: source.stage,
    requestedStage: target ?? null,
    transitionLegal,
    promotion,
    // Nothing is applied. This route reports what the evidence WOULD justify;
    // a stage change is a database write made by a job that has the evidence,
    // not by a form that has an opinion.
    applied: false,
    note: 'Evaluation only. Stage changes are written by the ingestion pipeline from recorded evidence, never set directly.',
  }, { headers: { 'Cache-Control': 'no-store' } });
}
