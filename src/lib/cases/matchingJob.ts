import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EpisodeInput } from './extraction';
import { runExtractionBatch, type ExtractionBatchReport } from './extraction';
import { proposeMatches, type EpisodeExtraction } from './matching';
import { proposeCandidates } from './reviewQueue';
import { detectRetitle } from './retitle';

/**
 * The matching job — the batch entry point. Never called from a request
 * handler (see extraction.ts / matching.ts for why). Runs extraction over
 * the full episode set, filters out same-series near-duplicate pairs as
 * retitles (out of the Case-matching pipeline entirely — those are handled
 * by the existing case_aliases mechanism from migration 0036, not by this
 * pipeline's review queue), proposes Case-match candidates for the rest, and
 * writes them to the review queue. Approving/rejecting a candidate is a
 * separate, explicit step (reviewQueue.ts) — this job never merges anything.
 */

export interface MatchingJobReport {
  extraction: Omit<ExtractionBatchReport, 'results'>;
  episodesProcessed: number;
  retitlePairsSkipped: number;
  candidatesProposed: number;
  candidatesInserted: number;
}

export async function runMatchingJob(supabase: SupabaseClient, episodes: EpisodeInput[]): Promise<MatchingJobReport> {
  const extraction = runExtractionBatch(episodes);
  const byId = new Map(episodes.map((e) => [e.tvmazeEpisodeId, e]));
  const extractions: EpisodeExtraction[] = extraction.results.map((r) => ({
    episode: byId.get(r.tvmazeEpisodeId)!,
    identifiers: r.identifiers,
  }));

  const allCandidates = proposeMatches(extractions);

  // Same-series near-duplicate synopsis pairs are reruns under a different
  // title, not a second real-world episode — route them away from the
  // Case-matching review queue entirely.
  let retitlePairsSkipped = 0;
  const candidates = allCandidates.filter((c) => {
    const a = byId.get(c.episodeAId)!;
    const b = byId.get(c.episodeBId)!;
    if (detectRetitle(a, b).isRetitle) {
      retitlePairsSkipped++;
      return false;
    }
    return true;
  });

  const candidatesInserted = await proposeCandidates(supabase, candidates);

  const { results: _results, ...extractionSummary } = extraction;
  return {
    extraction: extractionSummary,
    episodesProcessed: episodes.length,
    retitlePairsSkipped,
    candidatesProposed: candidates.length,
    candidatesInserted,
  };
}
