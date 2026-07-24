import { describe, it, expect } from 'vitest';
import { DIMENSION_KEYS } from '@/lib/scoring/dimensions';
import type { TitleDimensions } from '@/lib/scoring/dimensions';
import { deriveDna } from './engine';
import { openQuestions, nextMission, questionConfidence, QUESTION_CATALOG } from './openQuestions';
import { buildCaseRound, ROUND_LENGTHS, type RoundCandidate } from './caseRound';
import { caseUpdate } from './caseUpdate';
import { caseStats, levelFor, LEVELS } from './stats';
import { responseQuality, eventReliabilityWeight } from './quality';
import type { PreferenceEvent } from './types';

function dims(over: Record<string, number> = {}): TitleDimensions {
  const d: TitleDimensions = {};
  for (const k of DIMENSION_KEYS) d[k] = 50;
  return { ...d, ...over };
}
const ev = (over: Partial<PreferenceEvent>): PreferenceEvent => ({
  id: Math.random().toString(36).slice(2), at: 0, titleId: 'movie:1', action: 'skip', ...over,
});
const fastLoved = (i: number) => ev({ id: `f${i}`, titleId: `f${i}`, action: 'seen_liked', experienceGrade: 'loved', dims: dims({ pacing: 92 }) });

describe('Open Questions', () => {
  it('everything is open for a new user; nextMission is the most uncertain', () => {
    const state = deriveDna([], 0);
    const open = openQuestions(state);
    expect(open.every((q) => !q.resolved)).toBe(true);
    expect(open.length).toBe(QUESTION_CATALOG.length);
    expect(nextMission(state)).not.toBeNull();
  });

  it('resolving a trait resolves its question', () => {
    const state = deriveDna(Array.from({ length: 6 }, (_, i) => fastLoved(i)), 0);
    const pace = QUESTION_CATALOG.find((q) => q.id === 'pace')!;
    expect(questionConfidence(pace, state)).toBeGreaterThanOrEqual(0.5);
    const paceRow = openQuestions(state).find((q) => q.spec.id === 'pace')!;
    expect(paceRow.resolved).toBe(true);
    // A resolved question sinks below unresolved ones.
    const idx = openQuestions(state).findIndex((q) => q.spec.id === 'pace');
    expect(idx).toBeGreaterThan(0);
  });
});

describe('Case Round assembly', () => {
  const pace = QUESTION_CATALOG.find((q) => q.id === 'pace')!;
  const pool: RoundCandidate[] = [
    { titleId: 'slow', dims: dims({ pacing: 5 }), familiarity: 0.9 },
    { titleId: 'fast', dims: dims({ pacing: 95 }), familiarity: 0.9 },
    { titleId: 'neutral', dims: dims({ pacing: 50 }), familiarity: 0.9 },
    { titleId: 'mid', dims: dims({ pacing: 60 }), familiarity: 0.2 },
  ];

  it('standard round is 10 titles (capped by pool)', () => {
    const round = buildCaseRound(pace, pool, deriveDna([], 0), { size: 'standard' });
    expect(round.length).toBe(Math.min(ROUND_LENGTHS.standard, pool.length));
  });

  it('prefers titles that discriminate the target axis; neutral ranks last', () => {
    const round = buildCaseRound(pace, pool, deriveDna([], 0), { length: 3 });
    const ids = round.map((t) => t.titleId);
    expect(ids).not.toContain('neutral'); // teaches nothing about pacing
    expect(ids).toContain('slow');
    expect(ids).toContain('fast');
  });

  it('respects exclude and length', () => {
    const round = buildCaseRound(pace, pool, deriveDna([], 0), { length: 2, exclude: new Set(['slow']) });
    expect(round.length).toBe(2);
    expect(round.map((t) => t.titleId)).not.toContain('slow');
  });
});

describe('Case Update', () => {
  it('reports improved confidence and new evidence after a round', () => {
    const before = deriveDna([], 0);
    const after = deriveDna(Array.from({ length: 6 }, (_, i) => fastLoved(i)), 0);
    const update = caseUpdate(before, after, { movedUp: 3, movedDown: 5, ruledOut: 2 });
    const pacing = update.confidenceImproved.find((c) => c.key === 'pacing');
    expect(pacing).toBeTruthy();
    expect(pacing!.deltaPct).toBeGreaterThan(0);
    expect(update.newEvidence.some((s) => /fast pace/i.test(s))).toBe(true);
    expect(update.recs?.movedUp).toBe(3);
  });

  it('no DNA change ⇒ no improvements claimed', () => {
    const s = deriveDna([], 0);
    const update = caseUpdate(s, s);
    expect(update.confidenceImproved).toHaveLength(0);
    expect(update.newEvidence).toHaveLength(0);
  });
});

describe('Case stats + levels', () => {
  it('counts watched/interest/ruled-out/skip separately', () => {
    const events = [
      ev({ id: 'a', titleId: 'a', action: 'seen_liked' }),
      ev({ id: 'b', titleId: 'b', action: 'seen_disliked' }),
      ev({ id: 'c', titleId: 'c', action: 'unseen_interested' }),
      ev({ id: 'd', titleId: 'd', action: 'unseen_not_interested' }),
      ev({ id: 'e', titleId: 'e', action: 'skip' }),
      ev({ id: 'f', titleId: 'f', action: 'seen_liked', experienceGrade: 'dnf' }),
    ];
    const s = caseStats(events);
    expect(s.watchedLiked).toBe(1);
    expect(s.watchedDisliked).toBe(2); // seen_disliked + the dnf (experience negative)
    expect(s.caughtInterest).toBe(1);
    expect(s.ruledOut).toBe(1);
    expect(s.skipped).toBe(1);
    expect(s.dnf).toBe(1);
    expect(s.titlesExamined).toBe(5); // skip doesn't count
  });

  it('levels reflect DNA strength, not tap count', () => {
    expect(levelFor(0).n).toBe(1);
    expect(levelFor(100).name).toBe('Verdict Expert');
    expect(levelFor(65).n).toBe(4);
    expect(LEVELS).toHaveLength(6);
  });
});

describe('Response quality', () => {
  it('clean, varied answers are reliable', () => {
    const events = [
      ev({ action: 'seen_liked', dwellMs: 2200 }),
      ev({ action: 'unseen_interested', dwellMs: 1800 }),
      ev({ action: 'seen_disliked', dwellMs: 3000 }),
    ];
    expect(responseQuality(events).reliability).toBeGreaterThan(0.8);
  });

  it('rapid identical tapping erodes reliability and nudges Skip', () => {
    const events = Array.from({ length: 10 }, () => ev({ action: 'seen_liked', dwellMs: 120 }));
    const q = responseQuality(events);
    expect(q.reliability).toBeLessThan(0.7);
    expect(q.longestIdenticalRun).toBe(10);
    expect(q.suggestSkipNudge).toBe(true);
  });

  it('per-event weight down-weights a too-fast tap but never zeroes it', () => {
    expect(eventReliabilityWeight(ev({ dwellMs: 0 }))).toBeGreaterThan(0);
    expect(eventReliabilityWeight(ev({ dwellMs: 50 }))).toBeLessThan(1);
    expect(eventReliabilityWeight(ev({ dwellMs: 2000 }))).toBe(1);
  });
});
