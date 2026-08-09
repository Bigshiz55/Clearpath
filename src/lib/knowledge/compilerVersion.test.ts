import { describe, it, expect } from 'vitest';
import { COMPILER_VERSION } from './compile';
import { planWarm, type WarmCandidate } from './warm';

/**
 * COMPILER_VERSION gates staleness. The live proof compiled 7 title_knowledge
 * rows under kl-v1 whose tone/setting were empty (the compiler did not yet
 * produce them). Bumping to kl-v2 must make those v1 rows STALE so the warm job
 * recompiles them with real headers — this test freezes that contract.
 */

const cand = (tmdbId: number): WarmCandidate => ({
  tmdbId,
  mediaType: 'movie',
  evidence: { title: `T${tmdbId}`, overview: '', genres: [], keywords: ['boxing'] },
});

describe('COMPILER_VERSION bump (kl-v1 → kl-v2)', () => {
  it('is at kl-v2', () => {
    expect(COMPILER_VERSION).toBe('kl-v2');
  });

  it('treats the previous version’s rows as STALE so they recompile', () => {
    const candidates = [cand(1), cand(2)];
    const existing = new Map<string, string>([
      ['movie-1', 'kl-v1'], // compiled by the old (empty-header) compiler → stale
      ['movie-2', COMPILER_VERSION], // already current → skip
    ]);
    const plan = planWarm(candidates, existing, 10);
    expect(plan.toCompile.map((c) => c.tmdbId)).toEqual([1]);
    expect(plan.skipped.map((c) => c.tmdbId)).toEqual([2]);
  });
});
