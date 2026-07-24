/**
 * The multi-stage AI Retrieval Pipeline orchestrator.
 *
 *   intent → expansion → parallel search → confidence → (recovery)
 *
 * PURE core: sources are INJECTED, so the whole pipeline runs offline in tests and
 * in the benchmark with fake sources, and in production with the real TMDB /
 * embeddings / live-TV adapters. Its invariant, asserted by tests and the
 * benchmark: `run()` NEVER returns an empty, help-less result — when no confident
 * candidate exists, `recovery` is always populated. It never fabricates titles.
 */
import { understandIntent } from './intent';
import { expandQueries } from './expand';
import { searchAll, type SearchSource } from './sources';
import { scoreAndRank, CONFIDENCE_BANDS } from './confidence';
import { recover } from './recovery';
import type { RetrievalResult, ScoredCandidate, SearchTelemetry } from './types';

export interface PipelineOptions {
  sources: SearchSource[];
  /** Max confident results to return. */
  limit?: number;
  /** Minimum confidence to count a result as "confident" (defaults to the band). */
  minConfidence?: number;
  maxExpansions?: number;
}

export async function runRetrieval(rawText: string, opts: PipelineOptions): Promise<RetrievalResult> {
  const intent = understandIntent(rawText);
  const expansions = expandQueries(rawText, intent, opts.maxExpansions ?? 100);
  const { candidates, queried, unavailable } = await searchAll(opts.sources, expansions);
  const ranked = scoreAndRank(candidates, expansions);

  const minConf = opts.minConfidence ?? CONFIDENCE_BANDS.high;
  const confident: ScoredCandidate[] = ranked.filter((c) => c.confidence >= minConf).slice(0, opts.limit ?? 10);

  const topConfidence = ranked[0]?.confidence ?? 0;
  let outcome: RetrievalResult['outcome'];
  if (confident.length > 0) outcome = 'confident';
  else if (ranked.some((c) => c.confidenceBand === 'medium')) outcome = 'ambiguous';
  else outcome = 'recovery';

  // The guarantee: whenever we have no confident results, ALWAYS produce recovery
  // content. (We also attach recovery for the ambiguous case so the UI can lead
  // with interpretations while still showing the medium-confidence leads.)
  const recovery = confident.length === 0 ? recover(rawText, intent, expansions, ranked) : null;

  const telemetry: SearchTelemetry = {
    originalQuery: rawText,
    rewrittenQueries: expansions.map((e) => e.query),
    candidateCount: ranked.length,
    topConfidence,
    outcome,
    intentKind: intent.kind,
    sourcesQueried: queried,
    sourcesUnavailable: unavailable,
  };

  return { outcome, intent, expansions, results: confident, recovery, telemetry };
}
