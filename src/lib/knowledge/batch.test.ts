import { describe, it, expect } from 'vitest';
import { compileTitle, explainCandidate } from './batch';
import type { SubjectRequirement, CandidateEvidence } from '@/lib/nlu/semanticEligibility';

const boxing: SubjectRequirement = { canonical: 'boxing', label: 'boxing', lexemes: ['boxing', 'boxer', 'prizefight', 'heavyweight', 'ring'], strict: true };

describe('knowledge batch compiler', () => {
  it('compiles a title across subjects, marks insufficient when no subject is real', async () => {
    const ev: CandidateEvidence = { title: 'Some Doc', overview: 'A quiet meditation on nothing in particular.', genres: ['Documentary'], keywords: [] };
    const out = await compileTitle(ev, [boxing]);
    expect(out.header.status).toBe('insufficient');
    expect(out.facts).toHaveLength(1);
    expect(out.adjudicatedCount).toBe(0);
  });

  it('records anti-evidence for a subject that is provably absent', async () => {
    const ev: CandidateEvidence = { title: 'Rocky', overview: 'A boxer trains for a championship fight. The boxing match is the climax.', genres: ['Drama'], keywords: ['boxing'] };
    // Ask about chess too — a subject with real evidence for boxing but none for chess.
    const chess: SubjectRequirement = { canonical: 'chess', label: 'chess', lexemes: ['chess', 'grandmaster', 'checkmate'], strict: true };
    const out = await compileTitle(ev, [boxing, chess]);
    expect(out.header.status).toBe('compiled'); // boxing is real
    const chessFact = out.facts.find((f) => f.subject === 'chess');
    expect(['ABSENT', 'UNKNOWN']).toContain(chessFact?.centrality);
  });

  it('is idempotent — same evidence compiles to the same facts', async () => {
    const ev: CandidateEvidence = { title: 'Rocky', overview: 'A boxer trains for a fight. The boxing defines him.', genres: ['Drama'], keywords: ['boxing'] };
    const a = await compileTitle(ev, [boxing]);
    const b = await compileTitle(ev, [boxing]);
    expect(a.facts[0]).toEqual(b.facts[0]);
  });
});

describe('observability trace (§13)', () => {
  it('shows WHY a central title is eligible', () => {
    const trace = explainCandidate({
      title: 'Rocky',
      subject: boxing,
      evidence: { title: 'Rocky', overview: 'A boxer trains for a championship fight. The boxing match is the climax.', genres: ['Drama'], keywords: ['boxing'] },
      hardConstraints: [{ label: 'year < 1980', pass: true }],
      tasteScore: 83,
      provider: 'Prime Video',
    });
    expect(trace).toContain('Candidate: Rocky');
    expect(trace).toContain('final: eligible');
    expect(trace).toMatch(/centrality: CENTRAL/);
  });

  it('shows WHY an incidental title is excluded BEFORE Taste DNA', () => {
    const trace = explainCandidate({
      title: 'Goodfellas',
      subject: boxing,
      evidence: { title: 'Goodfellas', overview: 'The rise and fall of a mob associate across three decades of organized crime.', genres: ['Crime', 'Drama'], keywords: ['mafia', 'gangster'] },
      tasteScore: 90,
    });
    expect(trace).toContain('Candidate: Goodfellas');
    expect(trace).toContain('final: excluded');
    expect(trace).toContain('never ranked — excluded before Taste DNA');
  });
});
