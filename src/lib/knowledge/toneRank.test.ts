import { describe, it, expect } from 'vitest';
import {
  toneNudge,
  settingNudge,
  headerNudge,
  applyHeaderRanking,
  TONE_NUDGE_MAX,
  SETTING_NUDGE_MAX,
  HEADER_NUDGE_MAX,
  type RankableItem,
} from './toneRank';

describe('compiled tone + setting ranking nudge — bounded, reward-only, subordinate', () => {
  it('tone and setting each reward agreement, bounded to their own max', () => {
    expect(toneNudge(['dark', 'grounded', 'tense'], ['dark', 'grounded', 'tense'])).toBe(TONE_NUDGE_MAX);
    expect(settingNudge(['philadelphia'], ['philadelphia'])).toBe(SETTING_NUDGE_MAX);
    expect(toneNudge(['dark', 'warm'], ['dark', 'grounded', 'tense'])).toBeLessThan(TONE_NUDGE_MAX);
  });

  it('combined header bonus is bounded to HEADER_NUDGE_MAX', () => {
    const full = headerNudge({ tone: ['dark', 'tense'], setting: ['space'] }, ['dark', 'tense'], ['space']);
    expect(full).toBe(HEADER_NUDGE_MAX);
    expect(HEADER_NUDGE_MAX).toBe(TONE_NUDGE_MAX + SETTING_NUDGE_MAX);
  });

  it('is REWARD-ONLY: a mismatch is 0, never negative (never demotes an eligible title)', () => {
    expect(toneNudge(['warm'], ['dark'])).toBe(0);
    expect(settingNudge(['london'], ['tokyo'])).toBe(0);
    expect(headerNudge({ tone: ['warm'], setting: ['london'] }, ['dark'], ['tokyo'])).toBe(0);
  });

  it('is a NO-OP when a side is empty, and NEVER invents setting/tone', () => {
    expect(settingNudge([], ['space'])).toBe(0); // no compiled setting → nothing invented
    expect(settingNudge(['space'], [])).toBe(0);
    expect(headerNudge({ tone: [], setting: [] }, ['dark'], ['space'])).toBe(0);
  });

  it('is SUBORDINATE: the max combined bonus cannot flip a real Taste-DNA gap', () => {
    expect(HEADER_NUDGE_MAX).toBeLessThanOrEqual(10);
    const strong = 90;
    const weakWithFullBonus = 60 + headerNudge({ tone: ['dark', 'tense'], setting: ['space'] }, ['dark', 'tense'], ['space']);
    expect(weakWithFullBonus).toBeLessThan(strong);
  });
});

describe('applyHeaderRanking — reorders eligible survivors only', () => {
  const item = (id: number, matchScore: number): RankableItem => ({ id, mediaType: 'movie', matchScore, receipts: [] });

  it('NO ELIGIBILITY RESURRECTION: it never adds or removes titles, only bumps scores', () => {
    const items = [item(1, 70), item(2, 70), item(3, 70)];
    const headers = new Map([['movie-1', { tone: ['dark'], setting: [] }]]);
    const before = items.map((i) => i.id).sort();
    applyHeaderRanking(items, headers, ['dark'], []);
    expect(items.map((i) => i.id).sort()).toEqual(before); // same set, nothing resurrected/dropped
  });

  it('is a total NO-OP when nothing is requested (legacy path unaffected)', () => {
    const items = [item(1, 70)];
    applyHeaderRanking(items, new Map([['movie-1', { tone: ['dark'], setting: ['space'] }]]), [], []);
    expect(items[0]!.matchScore).toBe(70); // untouched
  });

  it('never DECREASES a score and never exceeds HEADER_NUDGE_MAX delta', () => {
    const items = [item(1, 50)];
    const headers = new Map([['movie-1', { tone: ['dark', 'tense'], setting: ['space'] }]]);
    applyHeaderRanking(items, headers, ['dark', 'tense'], ['space']);
    expect(items[0]!.matchScore).toBeGreaterThanOrEqual(50);
    expect(items[0]!.matchScore - 50).toBeLessThanOrEqual(HEADER_NUDGE_MAX);
  });

  it('BREAKS TIES toward the on-target title', () => {
    const onTarget = item(1, 70);
    const offTarget = item(2, 70);
    const headers = new Map([
      ['movie-1', { tone: ['dark', 'gritty'], setting: ['space'] }],
      ['movie-2', { tone: ['sunny'], setting: ['beach'] }],
    ]);
    applyHeaderRanking([onTarget, offTarget], headers, ['dark', 'gritty'], ['space']);
    expect(onTarget.matchScore).toBeGreaterThan(offTarget.matchScore);
  });

  it('CANNOT override a real gap: a much stronger off-target title still wins', () => {
    const strongOffTarget = item(1, 88);
    const weakOnTarget = item(2, 80);
    const headers = new Map([
      ['movie-1', { tone: ['sunny'], setting: [] }],
      ['movie-2', { tone: ['dark', 'tense'], setting: ['space'] }],
    ]);
    applyHeaderRanking([strongOffTarget, weakOnTarget], headers, ['dark', 'tense'], ['space']);
    expect(strongOffTarget.matchScore).toBeGreaterThan(weakOnTarget.matchScore); // 88 > 80+7
  });
});
