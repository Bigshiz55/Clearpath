import { describe, it, expect } from 'vitest';
import { deriveSubjectsFromEvidence, planWarm, warmTitle, type WarmCandidate } from './warm';
import { COMPILER_VERSION } from './compile';
import type { CandidateEvidence } from '@/lib/nlu/semanticEligibility';

const ev = (o: Partial<CandidateEvidence>): CandidateEvidence => ({ title: '', overview: '', genres: [], keywords: [], ...o });
const cand = (tmdbId: number, evidence: CandidateEvidence): WarmCandidate => ({ tmdbId, mediaType: 'movie', evidence });

describe('knowledge warm — subject derivation from a title\'s own tags', () => {
  it('derives bounded, de-duplicated, meaningful subjects from keyword tags', () => {
    const subs = deriveSubjectsFromEvidence(ev({ keywords: ['boxing', 'boxing', 'based on true story', 'a', 'prison escape'] }));
    const slugs = subs.map((s) => s.canonical);
    expect(slugs).toContain('boxing');
    expect(slugs).toContain('prison-escape');
    expect(slugs).not.toContain('based-on-true-story'); // production-noise tag filtered
    expect(new Set(slugs).size).toBe(slugs.length); // de-duplicated
  });

  it('caps the number of subjects per title', () => {
    const many = Array.from({ length: 30 }, (_, i) => `subject ${i}`);
    expect(deriveSubjectsFromEvidence(ev({ keywords: many }), 8)).toHaveLength(8);
  });
});

describe('knowledge warm — planning is bounded + idempotent + version-gated', () => {
  const candidates = [
    cand(1, ev({ title: 'A', keywords: ['boxing'] })),
    cand(2, ev({ title: 'B', keywords: ['chess'] })),
    cand(3, ev({ title: 'C', keywords: ['ballet'] })),
  ];

  it('compiles only titles that are missing or stale, and never exceeds maxPerRun', () => {
    const existing = new Map<string, string>([
      ['movie-1', COMPILER_VERSION], // up to date → skip
      ['movie-2', 'kl-v0'], // stale → recompile
      // movie-3 missing → compile
    ]);
    const plan = planWarm(candidates, existing, 10);
    expect(plan.toCompile.map((c) => c.tmdbId).sort()).toEqual([2, 3]);
    expect(plan.skipped.map((c) => c.tmdbId)).toEqual([1]);
  });

  it('is idempotent: once everything is at the current version, nothing recompiles', () => {
    const existing = new Map<string, string>([
      ['movie-1', COMPILER_VERSION],
      ['movie-2', COMPILER_VERSION],
      ['movie-3', COMPILER_VERSION],
    ]);
    expect(planWarm(candidates, existing, 10).toCompile).toHaveLength(0);
  });

  it('respects maxPerRun (the rest are deferred to the next run)', () => {
    const plan = planWarm(candidates, new Map(), 2);
    expect(plan.toCompile).toHaveLength(2);
    expect(plan.skipped).toHaveLength(1);
  });
});

describe('knowledge warm — warmTitle compiles a title from its own evidence', () => {
  it('produces facts for the title\'s subjects with no model call on confident bands', async () => {
    const out = await warmTitle(cand(9, ev({ title: 'Rocky', overview: 'The boxing is relentless and raw. The boxing match decides his whole life.', keywords: ['boxing'] })));
    const boxing = out.facts.find((f) => f.subject === 'boxing');
    expect(boxing?.centrality).toBe('CENTRAL');
    expect(out.adjudicatedCount).toBe(0);
    expect(['compiled', 'insufficient']).toContain(out.header.status);
  });
});
