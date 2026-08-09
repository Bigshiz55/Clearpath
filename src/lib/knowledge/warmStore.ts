import 'server-only';
import { readTitleKnowledgeVersions, writeSubjectFacts, writeTitleKnowledge } from './store';
import { planWarm, warmTitle, type WarmCandidate } from './warm';
import { adjudicateSubjectCentrality } from '@/lib/nlu/subjectAdjudicator';
import type { Adjudication } from './compile';
import type { CompiledTitle } from './batch';
import type { SubjectRequirement, CandidateEvidence } from '@/lib/nlu/semanticEligibility';

/**
 * The BACKGROUND WARM JOB (I/O wrapper around the pure planner).
 *
 * Bounded, idempotent (skips titles already at COMPILER_VERSION), safe-absent,
 * and — critically — TIME-BUDGETED. The live proof showed 7 titles / 56 facts
 * consuming nearly the whole 60s Vercel invocation, which then hit
 * FUNCTION_INVOCATION_TIMEOUT. So the job now stops GRACEFULLY before the
 * platform kills it:
 *
 *   • An internal deadline (default 42s, well under Vercel's 60s) is checked
 *     BEFORE starting each title, so a started title always finishes its writes
 *     (a safe persistence boundary) — work is incremental, and remaining titles
 *     wait for the next cron run.
 *   • Each title's subject facts are written in ONE batched upsert (not one
 *     round trip per fact).
 *   • No uncontrolled concurrency is introduced; compilation stays sequential.
 *
 * `now` and `compile` are injectable purely for deterministic tests.
 */

export interface WarmReport {
  considered: number;
  compiled: number;
  skipped: number;
  factsWritten: number;
  adjudicated: number;
  durationMs: number;
  stoppedForTimeBudget: boolean;
}

/** Default internal budget: comfortably under Vercel's 60s function timeout. */
export const DEFAULT_WARM_DEADLINE_MS = 42_000;

export async function runKnowledgeWarmJob(
  candidates: WarmCandidate[],
  opts: {
    maxPerRun?: number;
    /** Internal active-work budget in ms; the job stops before this is exceeded. */
    deadlineMs?: number;
    adjudicate?: (req: SubjectRequirement, ev: CandidateEvidence) => Promise<Adjudication | null>;
    /** Injectable clock (tests). Defaults to Date.now. */
    now?: () => number;
    /** Injectable compiler (tests). Defaults to warmTitle. */
    compile?: (c: WarmCandidate, adjudicate?: (req: SubjectRequirement, ev: CandidateEvidence) => Promise<Adjudication | null>) => Promise<CompiledTitle>;
  } = {},
): Promise<WarmReport> {
  const maxPerRun = Math.max(0, Math.min(opts.maxPerRun ?? 15, 200));
  const deadlineMs = Math.max(1_000, opts.deadlineMs ?? DEFAULT_WARM_DEADLINE_MS);
  const now = opts.now ?? Date.now;
  const compile = opts.compile ?? warmTitle;
  const adjudicate = opts.adjudicate ?? adjudicateSubjectCentrality;

  const start = now();
  const report: WarmReport = {
    considered: candidates.length,
    compiled: 0,
    skipped: 0,
    factsWritten: 0,
    adjudicated: 0,
    durationMs: 0,
    stoppedForTimeBudget: false,
  };
  if (candidates.length === 0 || maxPerRun === 0) {
    report.durationMs = now() - start;
    return report;
  }

  const existing = await readTitleKnowledgeVersions(candidates.map((c) => ({ tmdbId: c.tmdbId, mediaType: c.mediaType })));
  const { toCompile, skipped } = planWarm(candidates, existing, maxPerRun);
  report.skipped = skipped.length;

  for (const c of toCompile) {
    // Stop BEFORE starting a title we might not be able to finish, so every
    // started title completes its writes (safe persistence boundary).
    if (now() - start >= deadlineMs) {
      report.stoppedForTimeBudget = true;
      break;
    }
    try {
      const out = await compile(c, adjudicate);
      // Batched: all of this title's facts in one round trip, then the header.
      await writeSubjectFacts(c.tmdbId, c.mediaType, out.facts);
      await writeTitleKnowledge(c.tmdbId, c.mediaType, out.header);
      report.compiled++;
      report.factsWritten += out.facts.length;
      report.adjudicated += out.adjudicatedCount;
    } catch {
      /* per-title isolation: one bad title never fails the run */
    }
  }

  report.durationMs = now() - start;
  return report;
}
