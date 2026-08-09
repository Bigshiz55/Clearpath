import { describe, it, expect } from 'vitest';
import { runKnowledgeWarmJob, DEFAULT_WARM_DEADLINE_MS, type WarmReport } from './warmStore';
import type { WarmCandidate } from './warm';
import type { CompiledTitle } from './batch';

/**
 * The warm job runs on Vercel with a 60s FUNCTION_INVOCATION_TIMEOUT. These
 * tests inject a deterministic clock and a stub compiler so we can prove the job
 * STOPS GRACEFULLY at its own internal deadline (well before the platform kills
 * it) rather than running until it is force-terminated. The store reads/writes
 * are safe-absent with no Supabase env, so they no-op here.
 */

const cand = (tmdbId: number): WarmCandidate => ({
  tmdbId,
  mediaType: 'movie',
  evidence: { title: `T${tmdbId}`, overview: 'x', genres: [], keywords: ['boxing'] },
});

// A compiled title with one fact, so factsWritten/adjudicated telemetry moves.
const stubCompiled: CompiledTitle = {
  facts: [
    {
      subject: 'boxing',
      centrality: 'CENTRAL',
      confidence: 0.9,
      sourceCount: 2,
      disputed: false,
      decidedBy: 'deterministic',
      evidence: { supporting: [], contrary: [], sources: ['title', 'overview'] },
      compilerVersion: 'kl-v2',
    },
  ],
  header: { status: 'compiled', tone: ['gritty'], setting: [], antiEvidence: [], evidenceSources: ['title'] },
  adjudicatedCount: 1,
};

/** A clock that advances a fixed step on every call (deterministic elapsed time). */
function steppingClock(stepMs: number): () => number {
  let t = 0;
  return () => {
    const v = t;
    t += stepMs;
    return v;
  };
}

describe('runKnowledgeWarmJob — time budget + telemetry', () => {
  it('stops GRACEFULLY at its internal deadline when work is artificially slow', async () => {
    const candidates = [1, 2, 3, 4, 5].map(cand);
    // Each now() call advances 15s; with a 30s deadline only the first title can
    // start before the pre-title deadline check trips.
    const now = steppingClock(15_000);
    const report: WarmReport = await runKnowledgeWarmJob(candidates, {
      maxPerRun: 10,
      deadlineMs: 30_000,
      now,
      compile: async () => stubCompiled,
    });

    expect(report.stoppedForTimeBudget).toBe(true);
    // A started title always finishes its writes (safe persistence boundary),
    // and the job stops before compiling the whole set.
    expect(report.compiled).toBeGreaterThanOrEqual(1);
    expect(report.compiled).toBeLessThan(candidates.length);
    expect(report.considered).toBe(candidates.length);
    // Telemetry is fully populated.
    expect(report).toMatchObject({
      considered: expect.any(Number),
      compiled: expect.any(Number),
      skipped: expect.any(Number),
      factsWritten: expect.any(Number),
      adjudicated: expect.any(Number),
      durationMs: expect.any(Number),
      stoppedForTimeBudget: true,
    });
    // Facts + adjudications accumulate only for titles that actually compiled.
    expect(report.factsWritten).toBe(report.compiled * stubCompiled.facts.length);
    expect(report.adjudicated).toBe(report.compiled * stubCompiled.adjudicatedCount);
  });

  it('compiles the whole set and does NOT trip the budget when there is ample time', async () => {
    const candidates = [1, 2, 3].map(cand);
    const now = steppingClock(1_000); // 1s per call, far under the deadline
    const report = await runKnowledgeWarmJob(candidates, {
      maxPerRun: 10,
      deadlineMs: DEFAULT_WARM_DEADLINE_MS,
      now,
      compile: async () => stubCompiled,
    });
    expect(report.stoppedForTimeBudget).toBe(false);
    expect(report.compiled).toBe(3);
    expect(report.factsWritten).toBe(3);
  });

  it('is bounded by maxPerRun regardless of the candidate pool size', async () => {
    const candidates = Array.from({ length: 50 }, (_, i) => cand(i + 1));
    const report = await runKnowledgeWarmJob(candidates, {
      maxPerRun: 4,
      deadlineMs: DEFAULT_WARM_DEADLINE_MS,
      now: steppingClock(10),
      compile: async () => stubCompiled,
    });
    expect(report.compiled).toBeLessThanOrEqual(4);
    expect(report.considered).toBe(50);
  });

  it('is a safe no-op for an empty candidate set (still reports telemetry)', async () => {
    const report = await runKnowledgeWarmJob([], { compile: async () => stubCompiled });
    expect(report.compiled).toBe(0);
    expect(report.considered).toBe(0);
    expect(report.stoppedForTimeBudget).toBe(false);
    expect(report.durationMs).toBeGreaterThanOrEqual(0);
  });
});
