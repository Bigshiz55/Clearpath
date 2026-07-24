import { describe, it, expect } from 'vitest';
import { deliberate } from './groupScore';
import type { CourtCandidate, CourtParticipant, CourtSelections } from './types';

const cand = (k: string, over: Partial<CourtCandidate> = {}): CourtCandidate => ({
  key: k, id: k.charCodeAt(0), mediaType: 'movie', title: k.toUpperCase(), year: 2020, runtime: 100,
  genreIds: [53], dimensions: null, available: true, providers: ['netflix'], ...over,
});
// No DNA profiles → neutral 0.5 base affinity, so picks/vetoes drive satisfaction.
const P: CourtParticipant[] = [{ id: 'p1', name: 'Scott' }, { id: 'p2', name: 'Amy' }, { id: 'p3', name: 'Mike' }];

describe('deliberate — consensus over majority', () => {
  const A = cand('a'); // polarizing: two first-place votes, one veto
  const B = cand('b'); // consensus: everyone's mild pick
  const C = cand('c'); // unpicked but broadly fine (discovery)
  const D = cand('d');
  const sel: CourtSelections = {
    picks: {
      p1: [{ key: 'a', rank: 1 }, { key: 'b', rank: 3 }],
      p2: [{ key: 'a', rank: 1 }, { key: 'b', rank: 3 }],
      p3: [{ key: 'b', rank: 3 }],
    },
    vetoes: { p3: [{ key: 'a', kind: 'preference' }] },
  };
  const v = deliberate([A, B, C, D], P, sel);

  it('does NOT pick the simple-majority first choice (A) — the consensus title (B) wins', () => {
    // A received 2 of 3 first-place votes (a majority) …
    const firstChoiceA = P.filter((p) => sel.picks[p.id]?.some((x) => x.key === 'a' && x.rank === 1)).length;
    expect(firstChoiceA).toBe(2);
    // … yet the verdict is B, the title everyone is happy with.
    expect(v.winner?.key).toBe('b');
  });

  it('ranks the polarizing title below the consensus title', () => {
    const sa = v.ranked.find((r) => r.key === 'a')!;
    const sb = v.ranked.find((r) => r.key === 'b')!;
    expect(sa.finalScore).toBeLessThan(sb.finalScore);
    // Fairness: A's least-satisfied juror is far unhappier than B's.
    expect(sa.lowestSatisfaction).toBeLessThan(sb.lowestSatisfaction);
    expect(sb.agreementScore).toBeGreaterThan(sa.agreementScore);
  });

  it('returns a winner, a distinct runner-up, and a distinct wildcard', () => {
    expect(v.winner).not.toBeNull();
    expect(v.runnerUp).not.toBeNull();
    expect(v.wildcard).not.toBeNull();
    const keys = [v.winner!.key, v.runnerUp!.key, v.wildcard!.key];
    expect(new Set(keys).size).toBe(3);
  });
});

describe('deliberate — negative signals and vetoes', () => {
  it('a strong (preference) veto reduces a candidate’s final score', () => {
    const X = cand('x');
    const base: CourtSelections = { picks: { p1: [{ key: 'x', rank: 3 }], p2: [{ key: 'x', rank: 3 }], p3: [{ key: 'x', rank: 3 }] } };
    const withVeto: CourtSelections = { ...base, vetoes: { p3: [{ key: 'x', kind: 'preference' }] } };
    const a = deliberate([X], P, base).ranked[0]!;
    const b = deliberate([X], P, withVeto).ranked[0]!;
    expect(b.vetoPenalty).toBeGreaterThan(0);
    expect(b.finalScore).toBeLessThan(a.finalScore);
    expect(b.lowestSatisfaction).toBeLessThan(a.lowestSatisfaction);
  });

  it('a content-restriction veto ELIMINATES a title even if it would otherwise win', () => {
    const Y = cand('y');
    const Z = cand('z');
    const sel: CourtSelections = {
      picks: { p1: [{ key: 'y', rank: 1 }], p2: [{ key: 'y', rank: 1 }], p3: [{ key: 'y', rank: 1 }, { key: 'z', rank: 2 }] },
      vetoes: { p1: [{ key: 'y', kind: 'content' }] },
    };
    const v = deliberate([Y, Z], P, sel);
    const sy = v.ranked.find((r) => r.key === 'y')!;
    expect(sy.eliminated).toBe(true);
    expect(sy.finalScore).toBe(Number.NEGATIVE_INFINITY);
    expect(v.winner?.key).toBe('z'); // the eliminated favorite cannot win
  });

  it('a hard-veto room makes even a preference veto eliminate the title', () => {
    const W = cand('w');
    const sel: CourtSelections = { picks: { p1: [{ key: 'w', rank: 1 }] }, vetoes: { p2: [{ key: 'w', kind: 'preference' }] } };
    const soft = deliberate([W], P, sel).ranked[0]!;
    const hard = deliberate([W], P, sel, { hardVetoes: true }).ranked[0]!;
    expect(soft.eliminated).toBe(false);
    expect(hard.eliminated).toBe(true);
  });
});

describe('deliberate — availability confidence', () => {
  it('an unavailable title is heavily discounted vs an available one with equal taste', () => {
    const on = cand('on', { available: true, providers: ['netflix'] });
    const off = cand('off', { available: false, providers: [] });
    const sel: CourtSelections = { picks: { p1: [{ key: 'on', rank: 2 }, { key: 'off', rank: 2 }] } };
    const v = deliberate([on, off], [P[0]!], sel);
    const son = v.ranked.find((r) => r.key === 'on')!;
    const soff = v.ranked.find((r) => r.key === 'off')!;
    expect(son.availabilityConfidence).toBeGreaterThan(soff.availabilityConfidence);
    expect(son.finalScore).toBeGreaterThan(soff.finalScore);
  });
});
