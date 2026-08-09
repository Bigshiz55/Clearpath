import 'server-only';
import { readTitleKnowledgeVersions, writeSubjectFact, writeTitleKnowledge } from './store';
import { planWarm, warmTitle, type WarmCandidate } from './warm';
import { adjudicateSubjectCentrality } from '@/lib/nlu/subjectAdjudicator';
import type { Adjudication } from './compile';
import type { SubjectRequirement, CandidateEvidence } from '@/lib/nlu/semanticEligibility';

/**
 * The BACKGROUND WARM JOB (I/O wrapper around the pure planner).
 *
 * Bounded (maxPerRun), idempotent (skips titles already at COMPILER_VERSION),
 * and safe-absent (any store failure yields a report with what it managed, never
 * throws). Suitable for a scheduled cron: it reads which candidates are stale in
 * ONE query, compiles at most maxPerRun of them (deterministic evidence first;
 * the adjudicator is used only for the ambiguous band and is itself budget-safe),
 * then persists facts + a header per title. Never runs in a user request path.
 */

export interface WarmReport {
  considered: number;
  compiled: number;
  skipped: number;
  factsWritten: number;
  adjudicated: number;
}

export async function runKnowledgeWarmJob(
  candidates: WarmCandidate[],
  opts: {
    maxPerRun?: number;
    adjudicate?: (req: SubjectRequirement, ev: CandidateEvidence) => Promise<Adjudication | null>;
  } = {},
): Promise<WarmReport> {
  const maxPerRun = Math.max(0, Math.min(opts.maxPerRun ?? 20, 200));
  const report: WarmReport = { considered: candidates.length, compiled: 0, skipped: 0, factsWritten: 0, adjudicated: 0 };
  if (candidates.length === 0 || maxPerRun === 0) return report;

  const existing = await readTitleKnowledgeVersions(candidates.map((c) => ({ tmdbId: c.tmdbId, mediaType: c.mediaType })));
  const { toCompile, skipped } = planWarm(candidates, existing, maxPerRun);
  report.skipped = skipped.length;

  const adjudicate = opts.adjudicate ?? adjudicateSubjectCentrality;
  for (const c of toCompile) {
    try {
      const out = await warmTitle(c, adjudicate);
      for (const fact of out.facts) {
        await writeSubjectFact(c.tmdbId, c.mediaType, fact);
        report.factsWritten++;
      }
      await writeTitleKnowledge(c.tmdbId, c.mediaType, out.header);
      report.compiled++;
      report.adjudicated += out.adjudicatedCount;
    } catch {
      /* per-title isolation: one bad title never fails the run */
    }
  }
  return report;
}
