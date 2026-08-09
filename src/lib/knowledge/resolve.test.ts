import { describe, it, expect, vi } from 'vitest';
import { resolveAmbiguousSubject, type StoredFactLike } from './resolve';
import { COMPILER_VERSION } from './compile';
import type { SubjectRequirement, CandidateEvidence } from '@/lib/nlu/semanticEligibility';

const req: SubjectRequirement = { canonical: 'baseball', label: 'baseball', lexemes: ['baseball', 'pitcher', 'ballpark'], strict: true };
const ev: CandidateEvidence = { title: 'Moneyball', overview: 'A GM rebuilds a baseball team with statistics.', genres: ['Drama'], keywords: ['baseball'] };

describe('Knowledge Layer — ambiguous-band resolution', () => {
  it('REUSES a durable compiled fact with NO model call (works offline)', async () => {
    const known: StoredFactLike = { centrality: 'CENTRAL', confidence: 0.9, disputed: false, compilerVersion: COMPILER_VERSION };
    const adjudicate = vi.fn(async () => null); // no key / offline
    const res = await resolveAmbiguousSubject(req, ev, known, adjudicate);
    expect(adjudicate).not.toHaveBeenCalled();
    expect(res.decidedVia).toBe('knowledge');
    expect(res.verdict?.centrality).toBe('CENTRAL');
    expect(res.persist).toBeNull();
  });

  it('a stored ABSENT fact is reused as a non-promoting UNSUPPORTED verdict, still no model call', async () => {
    const known: StoredFactLike = { centrality: 'ABSENT', confidence: 0.88, disputed: false, compilerVersion: COMPILER_VERSION };
    const adjudicate = vi.fn(async () => ({ centrality: 'CENTRAL' as const, confidence: 1 }));
    const res = await resolveAmbiguousSubject(req, ev, known, adjudicate);
    expect(adjudicate).not.toHaveBeenCalled();
    expect(res.decidedVia).toBe('knowledge');
    expect(res.verdict?.centrality).toBe('UNSUPPORTED'); // will NOT be promoted
  });

  it('a STALE compiler version is NOT reused — it falls through to adjudication', async () => {
    const known: StoredFactLike = { centrality: 'CENTRAL', confidence: 0.99, disputed: false, compilerVersion: 'kl-v0' };
    const adjudicate = vi.fn(async () => ({ centrality: 'CENTRAL' as const, confidence: 0.8, reason: 'about baseball' }));
    const res = await resolveAmbiguousSubject(req, ev, known, adjudicate);
    expect(adjudicate).toHaveBeenCalledOnce();
    expect(res.decidedVia).toBe('adjudicator');
    expect(res.persist).not.toBeNull();
    expect(res.persist?.compilerVersion).toBe(COMPILER_VERSION);
  });

  it('a low-confidence stored fact is NOT reused (isDurable gate)', async () => {
    const known: StoredFactLike = { centrality: 'MATERIAL', confidence: 0.4, disputed: false, compilerVersion: COMPILER_VERSION };
    const adjudicate = vi.fn(async () => ({ centrality: 'MATERIAL' as const, confidence: 0.7 }));
    const res = await resolveAmbiguousSubject(req, ev, known, adjudicate);
    expect(adjudicate).toHaveBeenCalledOnce();
    expect(res.decidedVia).toBe('adjudicator');
  });

  it('on a miss, adjudicates once and returns a fact to COMPILE-ON-DEMAND', async () => {
    const adjudicate = vi.fn(async () => ({ centrality: 'CENTRAL' as const, confidence: 0.92, reason: 'the film is about a baseball team' }));
    const res = await resolveAmbiguousSubject(req, ev, null, adjudicate);
    expect(adjudicate).toHaveBeenCalledOnce();
    expect(res.decidedVia).toBe('adjudicator');
    expect(res.verdict?.centrality).toBe('CENTRAL');
    expect(res.persist?.subject).toBe('baseball');
    expect(res.persist?.decidedBy).toBe('adjudicator');
  });

  it('REJECTS ON UNCERTAINTY when the adjudicator is unavailable (no key, offline, no compiled fact)', async () => {
    const adjudicate = vi.fn(async () => null);
    const res = await resolveAmbiguousSubject(req, ev, null, adjudicate);
    expect(res.verdict).toBeNull(); // caller leaves it ineligible — precision preserved
    expect(res.persist).toBeNull();
  });
});
