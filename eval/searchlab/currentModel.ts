/**
 * BASELINE ranker — a faithful reference of the CURRENT production behaviour in
 * `src/lib/askJudge.ts:askSimilarTo` (commit ef79637):
 *
 *   const seedKey = `${seed.mediaType}-${seed.id}`;
 *   const cands = similar.filter(s => `${s.mediaType}-${s.id}` !== seedKey && !seen.has(...)).slice(0,16);
 *   ...score each... .sort((a,b) => b.matchScore - a.matchScore)   // personal score only
 *
 * i.e. seed excluded by a SINGLE tmdb id, NO canonical dedup, NO similarity gate,
 * NO contradiction penalty, ranked by personalized score alone. This module
 * exists so the frozen suite can measure the real "before" without a live call.
 */
import type { Ranker, RankedResult, CandidateTrace } from './types';

export const currentRanker: Ranker = (seed, candidates, opts) => {
  const traces: CandidateTrace[] = [];
  const excludedSeedOrDup: string[] = [];
  const kept: { canonicalId: string; title: string; personalFit: number }[] = [];

  for (const c of candidates) {
    // Current seed exclusion: exact TMDB id only (mediaType-id).
    const isExactSeedId = c.mediaType === seed.mediaType && c.tmdbId === seed.tmdbId;
    if (isExactSeedId && !opts.allowSeed) {
      excludedSeedOrDup.push(c.title);
      traces.push(trace(c, false, 'excluded_exact_tmdb_id'));
      continue;
    }
    // Everything else qualifies — there is no gate in the current engine.
    kept.push({ canonicalId: c.canonicalId, title: c.title, personalFit: c.personalScore });
    traces.push(trace(c, true, null));
  }

  kept.sort((a, b) => b.personalFit - a.personalFit);
  const items = kept.slice(0, opts.requestedCount).map((k, i) => ({ ...k, rank: i + 1 }));
  const result: RankedResult = { items, traces, excludedSeedOrDup };
  return result;
};

function trace(
  c: { title: string; canonicalId: string; personalScore: number; providerRank?: number },
  qualified: boolean,
  exclusionReason: string | null,
): CandidateTrace {
  return {
    candidateTitle: c.title,
    canonicalId: c.canonicalId,
    candidateSource: 'tmdb_recommendations',
    qualification: {
      hardConstraintsPassed: qualified,
      seedSimilarityGatePassed: qualified, // current engine has no gate → same as "kept"
      sharedAnchorCount: 0, // not computed by current engine
      sharedAnchorScore: 0,
      contradictionScore: 0,
      metadataConfidence: 0,
    },
    positiveContributions: {},
    negativeContributions: {},
    personalFit: c.personalScore,
    qualifiedForRanking: qualified,
    exclusionReason,
  };
}
