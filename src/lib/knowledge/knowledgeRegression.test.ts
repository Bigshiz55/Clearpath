/**
 * NAMED REGRESSIONS (§12) for the Knowledge Layer — the specific failure classes
 * we already know about, locked with real-world-shaped cases. These are the
 * "never again" guards: they must generalize across unrelated subjects, so each
 * class is asserted for more than one domain.
 */
import { describe, it, expect } from 'vitest';
import { compileTitle } from './batch';
import { compileSubjectFact } from './compile';
import type { SubjectRequirement, CandidateEvidence } from '@/lib/nlu/semanticEligibility';

const req = (canonical: string, label: string, lexemes: string[]): SubjectRequirement => ({ canonical, label, lexemes, strict: true });
const ev = (o: Partial<CandidateEvidence>): CandidateEvidence => ({ title: '', overview: '', genres: [], keywords: [], ...o });

describe('§12 regression — subject centrality across domains', () => {
  it('boxing: a central boxing film compiles CENTRAL; an incidental one does not', async () => {
    const boxing = req('boxing', 'boxing', ['boxing', 'boxer', 'prizefight', 'ring']);
    const central = (await compileTitle(ev({ title: 'Raging Bull', overview: 'A self-destructive boxer batters his way to the championship. His boxing consumes his family and his mind.', keywords: ['boxing'] }), [boxing])).facts[0]!;
    const incidental = (await compileTitle(ev({ title: 'Snake Eyes', overview: 'A crooked cop witnesses an assassination at a boxing match and unravels a conspiracy.', genres: ['Thriller'], keywords: ['boxing', 'conspiracy'] }), [boxing])).facts[0]!;
    expect(central.centrality).toBe('CENTRAL');
    expect(incidental.centrality).not.toBe('CENTRAL');
  });

  it('baseball: the ambiguous Moneyball band is resolved by adjudication, not keyword presence', async () => {
    const baseball = req('baseball', 'baseball', ['baseball', 'pitcher', 'ballpark']);
    const evidence = ev({ title: 'Moneyball', overview: 'A general manager rebuilds a baseball team using statistics.', genres: ['Drama'], keywords: ['baseball'] });
    // Without a model, the band stays MATERIAL (never falsely CENTRAL from a tag).
    const noModel = (await compileSubjectFact(baseball, evidence)).fact;
    expect(noModel.centrality).toBe('MATERIAL');
    // With adjudication, it resolves.
    const resolved = (await compileSubjectFact(baseball, evidence, async () => ({ centrality: 'CENTRAL', confidence: 0.9 }))).fact;
    expect(resolved.centrality).toBe('CENTRAL');
    expect(resolved.decidedBy).toBe('adjudicator');
  });

  it('arbitrary subject: submarine + chess + courtroom all classify without any per-noun code', async () => {
    const cases: Array<[SubjectRequirement, CandidateEvidence, string]> = [
      [req('submarine', 'submarine', ['submarine', 'periscope', 'torpedo']), ev({ title: 'Das Boot', overview: 'A German U-boat crew endures the claustrophobia of the submarine war. The submarine is their whole world.', keywords: ['submarine'] }), 'CENTRAL'],
      [req('chess', 'chess', ['chess', 'grandmaster', 'checkmate']), ev({ title: 'A Quiet Life', overview: 'A widow reflects on her marriage. A single chess set sits untouched on a shelf.', keywords: [] }), 'not-central'],
      [req('courtroom', 'courtroom', ['courtroom', 'trial', 'verdict', 'testimony']), ev({ title: 'A Few Good Men', overview: 'Military lawyers build a courtroom defense. The trial and its testimony drive the whole film.', keywords: ['courtroom', 'trial'] }), 'CENTRAL'],
    ];
    for (const [r, evidence, expected] of cases) {
      const fact = (await compileTitle(evidence, [r])).facts[0]!;
      if (expected === 'CENTRAL') expect(fact.centrality, r.canonical).toBe('CENTRAL');
      else expect(fact.centrality, r.canonical).not.toBe('CENTRAL');
    }
  });

  it('keyword presence NEVER equals centrality (RULE 1) — holds for any subject', async () => {
    const subjects: Array<[string, string]> = [['ballet', 'ballet'], ['poker', 'poker'], ['sailing', 'sailing']];
    for (const [canonical, word] of subjects) {
      const r = req(canonical, word, [word]);
      // A bare tag with a light single mention, no title hit, no sustained overview.
      const fact = (await compileSubjectFact(r, ev({ title: 'Unrelated', overview: `The story briefly references ${word} once.`, keywords: [word] }))).fact;
      expect(fact.centrality, canonical).not.toBe('CENTRAL');
    }
  });
});
