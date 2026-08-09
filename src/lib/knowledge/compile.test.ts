import { describe, it, expect } from 'vitest';
import { reconcile, compileSubjectFact, isDurable, COMPILER_VERSION } from './compile';
import { evaluateSubjectCentrality, type SubjectRequirement, type CandidateEvidence } from '@/lib/nlu/semanticEligibility';

const boxing: SubjectRequirement = {
  canonical: 'boxing',
  label: 'boxing',
  lexemes: ['boxing', 'boxer', 'prizefight', 'heavyweight', 'ring'],
  strict: true,
};

const ev = (over: Partial<CandidateEvidence>): CandidateEvidence => ({
  title: '',
  overview: '',
  genres: [],
  keywords: [],
  ...over,
});

describe('knowledge compiler — reconciliation rules', () => {
  it('a strong multi-mention overview compiles to CENTRAL with high confidence', () => {
    const det = evaluateSubjectCentrality(boxing, ev({ title: 'Rocky', overview: 'A boxer trains for a championship fight. The boxing match defines his life.', keywords: ['boxing'] }));
    const fact = reconcile('boxing', det);
    expect(fact.centrality).toBe('CENTRAL');
    expect(fact.confidence).toBeGreaterThanOrEqual(0.8);
    expect(fact.evidence.sources).toContain('overview');
    expect(fact.disputed).toBe(false);
    expect(fact.compilerVersion).toBe(COMPILER_VERSION);
  });

  it('RULE 1 — a lone keyword tag never compiles to CENTRAL (caps at MATERIAL)', () => {
    // Force the guard: a synthetic verdict that (wrongly) claims CENTRAL from a
    // single keyword tag with no title hit and no overview mention.
    const det = {
      status: 'PASS' as const,
      centrality: 'CENTRAL' as const,
      confidence: 95,
      evidenceSummary: '',
      rejectionReason: null,
      supportingEvidence: [],
      contraryEvidence: [],
      ambiguous: false,
      signals: { titleHit: false, keywordExactCount: 1, keywordRelated: false, mentionSentences: 0, premiseFocus: false, settingOnly: false },
    };
    const fact = reconcile('boxing', det);
    expect(fact.centrality).toBe('MATERIAL');
    expect(fact.confidence).toBeLessThanOrEqual(0.5);
    expect(fact.evidence.sources).toEqual(['keyword']);
  });

  it('a setting-only mention compiles to INCIDENTAL, not central', () => {
    const det = evaluateSubjectCentrality(
      boxing,
      ev({ title: 'Snake Eyes', overview: 'A crooked cop witnesses an assassination at a boxing match and unravels a conspiracy.', genres: ['Thriller'], keywords: ['boxing', 'conspiracy'] }),
    );
    const fact = reconcile('boxing', det);
    expect(['INCIDENTAL', 'ABSENT']).toContain(fact.centrality);
    expect(fact.centrality).not.toBe('CENTRAL');
  });

  it('RULE 3 — an adjudication arbitrates the ambiguous MATERIAL band', async () => {
    const evidence = ev({ title: 'Moneyball', overview: 'A general manager rebuilds a baseball team using statistics.', genres: ['Drama'], keywords: ['baseball'] });
    const bb: SubjectRequirement = { canonical: 'baseball', label: 'baseball', lexemes: ['baseball', 'pitcher', 'ballpark'], strict: true };
    const det = evaluateSubjectCentrality(bb, evidence);
    expect(det.ambiguous).toBe(true); // single tag + light mention → the band we escalate

    const { fact, adjudicated } = await compileSubjectFact(bb, evidence, async () => ({ centrality: 'CENTRAL', confidence: 0.9, reason: 'the film is about building a baseball team' }));
    expect(adjudicated).toBe(true);
    expect(fact.centrality).toBe('CENTRAL');
    expect(fact.decidedBy).toBe('adjudicator');
    expect(fact.confidence).toBeCloseTo(0.9, 5);
  });

  it('RULE 3 — a confident deterministic verdict that CONTRADICTS the model is marked disputed, not flipped', () => {
    // Title hit (deterministic CENTRAL) but the model judges it incidental.
    const det = evaluateSubjectCentrality(boxing, ev({ title: 'The Boxer', overview: 'A political drama in Northern Ireland; the lead once trained as a boxer.', genres: ['Drama'] }));
    const fact = reconcile('boxing', det, { centrality: 'INCIDENTAL', confidence: 0.8, reason: 'boxing is a backdrop to a political story' });
    expect(fact.disputed).toBe(true);
    expect(fact.confidence).toBeLessThanOrEqual(0.55);
    // Higher-evidence deterministic class is preserved, not silently overwritten.
    expect(fact.centrality).toBe('CENTRAL');
    expect(fact.evidence.sources).toContain('adjudicator');
  });

  it('RULE 4 — insufficient evidence stays UNKNOWN and never manufactures certainty', () => {
    // A bare tag with no overview is unverifiable.
    const det = evaluateSubjectCentrality(boxing, ev({ title: 'Untitled', overview: '', keywords: ['boxing'] }));
    const fact = reconcile('boxing', det);
    expect(fact.centrality).toBe('UNKNOWN');
    expect(fact.confidence).toBeLessThanOrEqual(0.4);
  });

  it('multiple independent sources raise confidence over a single source', () => {
    const one = reconcile('boxing', evaluateSubjectCentrality(boxing, ev({ overview: 'A boxer prepares for a fight.', keywords: [] })));
    const many = reconcile('boxing', evaluateSubjectCentrality(boxing, ev({ title: 'Boxing', overview: 'A boxer prepares for a fight. The boxing match is the climax.', keywords: ['boxing'] })));
    expect(many.sourceCount).toBeGreaterThan(one.sourceCount);
    expect(many.confidence).toBeGreaterThanOrEqual(one.confidence);
  });

  it('isDurable gates on version AND confidence', () => {
    expect(isDurable({ compilerVersion: COMPILER_VERSION, confidence: 0.8 })).toBe(true);
    expect(isDurable({ compilerVersion: COMPILER_VERSION, confidence: 0.4 })).toBe(false);
    expect(isDurable({ compilerVersion: 'kl-v0', confidence: 0.99 })).toBe(false);
  });

  it('the confident bands never spend an adjudication', async () => {
    let called = 0;
    const evidence = ev({ title: 'Rocky', overview: 'A boxer fights for the title. The boxing is relentless.', keywords: ['boxing'] });
    const { adjudicated } = await compileSubjectFact(boxing, evidence, async () => {
      called++;
      return { centrality: 'CENTRAL', confidence: 1 };
    });
    expect(called).toBe(0);
    expect(adjudicated).toBe(false);
  });
});
