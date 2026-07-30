import { describe, it, expect } from 'vitest';
import { groupRank, winnerOf, appeal, roomReady, shortlistReady, verdictReady, nextActionLabel, participantStatus, partialNote } from './courtRoom';
import type { CandidateInput } from './courtRoom';

const cand = (key: string, scores: number[], over: Partial<CandidateInput> = {}): CandidateInput => ({
  key,
  title: key,
  fits: scores.map((s, i) => ({ name: ['Scott', 'Heather', 'Amy'][i] ?? `P${i}`, score: s })),
  reactions: [],
  ...over,
});

describe('group ranking — never a plain average (mission TEST 6)', () => {
  it('96/93/38 must NOT beat 88/87/85, even though its mean is higher', () => {
    const ranked = groupRank([cand('split', [96, 93, 38]), cand('shared', [88, 87, 85])]);
    expect(ranked[0]!.key).toBe('shared');
    expect(ranked[0]!.groupScore).toBeGreaterThan(ranked[1]!.groupScore);
  });

  it('FOR reactions lift a candidate; PASS drags it (within the credibility ceiling)', () => {
    // 90/60 leaves headroom under the ceiling (90), so the lift is observable.
    const base = groupRank([cand('x', [90, 60])])[0]!.groupScore;
    const lifted = groupRank([
      cand('x', [90, 60], { reactions: [{ name: 'Scott', reaction: 'for' }, { name: 'Heather', reaction: 'for' }] }),
    ])[0]!.groupScore;
    const dragged = groupRank([
      cand('x', [90, 60], { reactions: [{ name: 'Scott', reaction: 'pass' }, { name: 'Heather', reaction: 'pass' }] }),
    ])[0]!.groupScore;
    expect(lifted).toBeGreaterThan(base);
    expect(dragged).toBeLessThan(base);
    // A unanimous room already at its ceiling cannot be lifted past it.
    const atCeiling = groupRank([
      cand('y', [70, 70], { reactions: [{ name: 'Scott', reaction: 'for' }, { name: 'Heather', reaction: 'for' }] }),
    ])[0]!.groupScore;
    expect(atCeiling).toBe(70);
  });

  it('unavailability is a real penalty with a stated reason', () => {
    const r = groupRank([cand('x', [80, 80], { available: false })])[0]!;
    expect(r.groupScore).toBeLessThan(70);
    expect(r.reasons).toContain('Not on a shared service');
  });
});

describe('veto — a strong objection is protected (mission TEST 5)', () => {
  it('a vetoed title can NEVER win, regardless of score', () => {
    const ranked = groupRank([
      cand('loved-but-vetoed', [98, 97], { reactions: [{ name: 'Heather', reaction: 'veto', reason: 'too violent' }] }),
      cand('modest', [72, 70]),
    ]);
    expect(ranked[0]!.key).toBe('modest');
    expect(winnerOf(ranked)!.key).toBe('modest');
    expect(ranked[1]!.vetoed).toBe(true);
    expect(ranked[1]!.reasons.join(' ')).toContain('Vetoed by Heather');
  });

  it('everything vetoed → no winner (the room must resolve, not fake it)', () => {
    const ranked = groupRank([cand('a', [90, 90], { reactions: [{ name: 'Scott', reaction: 'veto' }] })]);
    expect(winnerOf(ranked)).toBeNull();
  });
});

describe('appeal — recalculate without restarting (mission TEST 9)', () => {
  it('excludes the winner, keeps reactions, promotes the next strongest', () => {
    const pool = [
      cand('first', [90, 88]),
      cand('second', [82, 80], { reactions: [{ name: 'Scott', reaction: 'for' }] }),
      cand('third', [60, 58]),
    ];
    const w1 = winnerOf(groupRank(pool))!;
    expect(w1.key).toBe('first');
    const w2 = appeal(pool, [w1.key])!;
    expect(w2.key).toBe('second');
    expect(w2.forCount).toBe(1); // reactions preserved
    const w3 = appeal(pool, [w1.key, w2.key])!;
    expect(w3.key).toBe('third');
    expect(appeal(pool, ['first', 'second', 'third'])).toBeNull();
  });
});

describe('staged readiness — no rigid gate on every action', () => {
  it('room / shortlist / verdict readiness are independent stages', () => {
    expect(roomReady({ participantCount: 1, candidateCount: 0, reactedCount: 0, stage: 'open' })).toBe(false);
    expect(roomReady({ participantCount: 2, candidateCount: 0, reactedCount: 0, stage: 'open' })).toBe(true);
    expect(shortlistReady({ participantCount: 2, candidateCount: 2, reactedCount: 0, stage: 'open' })).toBe(false);
    expect(shortlistReady({ participantCount: 2, candidateCount: 3, reactedCount: 0, stage: 'open' })).toBe(true);
    expect(verdictReady({ participantCount: 3, candidateCount: 4, reactedCount: 2, stage: 'reacting' })).toBe(false);
    expect(verdictReady({ participantCount: 3, candidateCount: 4, reactedCount: 3, stage: 'reacting' })).toBe(true);
  });

  it('the primary label always explains the next action — never a mystery', () => {
    // STAGE 2: a solo host builds and previews freely — the open stage never
    // demands an invite. Only the final Verd1ct waits for a second juror, and
    // the reacting-stage label says exactly what unlocks it.
    expect(nextActionLabel({ participantCount: 1, candidateCount: 0, reactedCount: 0, stage: 'open' })).toBe('Add titles or build our shortlist');
    expect(nextActionLabel({ participantCount: 1, candidateCount: 4, reactedCount: 1, stage: 'reacting' })).toBe('Invite one more juror to unlock the Verd1ct');
    expect(nextActionLabel({ participantCount: 2, candidateCount: 1, reactedCount: 0, stage: 'open' })).toBe('Add titles or build our shortlist');
    expect(nextActionLabel({ participantCount: 2, candidateCount: 4, reactedCount: 0, stage: 'open' })).toBe('4 titles ready — start choosing');
    expect(nextActionLabel({ participantCount: 3, candidateCount: 4, reactedCount: 1, stage: 'reacting' })).toBe('1 of 3 have reacted');
    expect(nextActionLabel({ participantCount: 3, candidateCount: 4, reactedCount: 3, stage: 'reacting' })).toBe('Everyone has reacted — reveal the Verd1ct');
  });

  it('participant status is explicit — never a bare number badge', () => {
    expect(participantStatus({ ready: true })).toBe('Ready');
    expect(participantStatus({ pickCount: 2 })).toBe('2 picks added');
    expect(participantStatus({ pickCount: 1 })).toBe('1 pick added');
    expect(participantStatus({})).toBe('Still choosing');
  });

  it('incomplete participation is disclosed, never silently pretended complete', () => {
    expect(partialNote({ participantCount: 4, candidateCount: 5, reactedCount: 3, stage: 'verdict' })).toBe('Verd1ct based on 3 of 4 participants');
    expect(partialNote({ participantCount: 3, candidateCount: 5, reactedCount: 3, stage: 'verdict' })).toBe('');
  });
});

describe('score credibility — no fabricated precision', () => {
  it('the group score never exceeds the best individual fit (the "100" defect)', () => {
    // Both members react FOR: the lift must not invent a score nobody gave.
    const r = groupRank([
      cand('knives', [94, 88], { reactions: [{ name: 'Scott', reaction: 'for' }, { name: 'Heather', reaction: 'for' }] }),
    ])[0]!;
    expect(r.groupScore).toBeLessThanOrEqual(94);
    expect(r.groupScore).toBeLessThan(100);
  });

  it('holds for a unanimous room of identical scores', () => {
    const r = groupRank([
      cand('x', [80, 80, 80], { reactions: [{ name: 'Scott', reaction: 'for' }, { name: 'Heather', reaction: 'for' }, { name: 'Amy', reaction: 'for' }] }),
    ])[0]!;
    expect(r.groupScore).toBeLessThanOrEqual(80);
  });
});
