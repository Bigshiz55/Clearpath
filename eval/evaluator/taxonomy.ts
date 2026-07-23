/**
 * Phase 7 — failure taxonomy. Classifies a graded case into ONE primary
 * root-cause category (plus optional secondaries) by inspecting the parse diff
 * and the independent constraint violations. Deliberately prioritized: the
 * earliest-in-pipeline root cause wins, because a parse miss upstream explains
 * the downstream constraint violation.
 */
import type { CaseResult } from './result';

export const TAXONOMY = [
  'speech_transcription',
  'query_normalization',
  'intent_classification',
  'entity_extraction',
  'time_interpretation',
  'conversational_context',
  'ambiguity_handling',
  'candidate_retrieval',
  'provider_data',
  'schedule_filtering',
  'subscription_filtering',
  'exclusion_filtering',
  'viewing_history_filtering',
  'metadata_enrichment',
  'taste_dna_calculation',
  'ranking_weights',
  'deduplication',
  'explanation_generation',
  'empty_result_handling',
  'performance',
  'test_data_defect',
  'evaluator_uncertainty',
] as const;

export type FailureCategory = (typeof TAXONOMY)[number];

export interface Classification {
  categories: FailureCategory[];
  primary: FailureCategory | null;
}

export function classify(r: Omit<CaseResult, 'failureCategories' | 'primaryCategory' | 'passed' | 'criticalFailure' | 'score'>): Classification {
  const cats: FailureCategory[] = [];
  const A = r.layerA;
  const B = r.layerB;
  const c = r.case;

  // Upstream-first ordering. When intent is wrong, attribute it to the most
  // likely upstream cause (a time or entity parse miss usually explains it)
  // before falling back to a pure intent-classification error.
  if (!A.intentCorrect) {
    const intendedBroadcast = c.intended.normalizedIntent === 'scheduled_broadcast_discovery';
    if (c.noise !== 'clean') cats.push('speech_transcription');
    if (intendedBroadcast && (!A.fields.timeWindow || !A.fields.availabilityType)) cats.push('time_interpretation');
    else if (!A.fields.networks || !A.fields.platforms || !A.fields.watchTitle) cats.push('entity_extraction');
    else cats.push('intent_classification');
  } else {
    if (!A.fields.networks || !A.fields.platforms || !A.fields.watchTitle) cats.push('entity_extraction');
    if (!A.fields.timeWindow || !A.fields.availabilityType) cats.push('time_interpretation');
  }
  if (!A.fields.requestedCount || !A.fields.contentTypes) cats.push('query_normalization');
  if (!A.fields.excludedAttributes) cats.push('exclusion_filtering');
  if ((c.expected.expectsClarification || (c.expected.expectedAmbiguities?.length ?? 0) > 0) && !A.clarificationCorrect) {
    cats.push('ambiguity_handling');
  }
  if (c.intended.watchTitle && !A.fields.watchTitle) cats.push('conversational_context');

  // Downstream constraint failures.
  if (B.hallucinations > 0) cats.push('metadata_enrichment');
  if (B.duplicateCount > 0) cats.push('deduplication');
  if (B.timeWindowViolations > 0) cats.push('schedule_filtering');
  if (B.subscriptionViolations > 0) cats.push('subscription_filtering');
  if (B.exclusionViolations > 0 && !cats.includes('exclusion_filtering')) cats.push('exclusion_filtering');
  if (B.previouslyWatchedLeaks > 0 || B.previouslyRejectedLeaks > 0) cats.push('viewing_history_filtering');
  if (B.networkOrPlatformViolations > 0 && !cats.includes('entity_extraction')) cats.push('provider_data');

  // Recall / ranking / response.
  if (r.layerC.graded && (r.layerC.recall ?? 1) < 0.75 && B.hardValid) cats.push('candidate_retrieval');
  if (r.layerD.graded) {
    if (r.layerD.idealTopRank != null && r.layerD.idealTopRank > 1) cats.push('ranking_weights');
    else if ((r.layerD.ndcg ?? 1) < 0.85 && B.hardValid) cats.push('ranking_weights');
    if (!r.layerD.descendingByMatch) cats.push('ranking_weights');
  }
  if (r.layerE.score < 0.7) {
    cats.push(r.pipeline.items.length === 0 ? 'empty_result_handling' : 'explanation_generation');
  }
  if (r.layerF.totalMs > 1500) cats.push('performance');

  // de-dup preserving order
  const uniq = [...new Set(cats)];
  return { categories: uniq, primary: uniq[0] ?? null };
}
