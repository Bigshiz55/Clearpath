import { describe, it, expect } from 'vitest';
import { toneNudge, TONE_NUDGE_MAX } from './toneRank';

describe('compiled tone ranking nudge — bounded, reward-only, subordinate', () => {
  it('rewards tone agreement, bounded to TONE_NUDGE_MAX', () => {
    const full = toneNudge(['dark', 'grounded', 'tense'], ['dark', 'grounded', 'tense']);
    expect(full).toBe(TONE_NUDGE_MAX);
    const partial = toneNudge(['dark', 'warm'], ['dark', 'grounded', 'tense']);
    expect(partial).toBeGreaterThan(0);
    expect(partial).toBeLessThan(TONE_NUDGE_MAX);
  });

  it('is REWARD-ONLY: a tone mismatch is 0, never negative (never demotes an eligible title)', () => {
    expect(toneNudge(['warm', 'cozy'], ['dark', 'bleak'])).toBe(0);
  });

  it('is a NO-OP when either side is empty (safe on missing compiled data)', () => {
    expect(toneNudge([], ['dark'])).toBe(0);
    expect(toneNudge(['dark'], [])).toBe(0);
  });

  it('matches by containment either direction ("dark" ↔ "dark comedy")', () => {
    expect(toneNudge(['dark comedy'], ['dark'])).toBeGreaterThan(0);
    expect(toneNudge(['dark'], ['dark comedy'])).toBeGreaterThan(0);
  });

  it('is SUBORDINATE: the max bonus cannot flip a real Taste-DNA gap', () => {
    // TONE_NUDGE_MAX is small relative to the 0..100 Taste DNA scale, so a
    // strongly-preferred title (90) still outranks a weaker one (60) even when
    // the weaker one gets the full tone bonus.
    expect(TONE_NUDGE_MAX).toBeLessThanOrEqual(5);
    const strong = 90;
    const weakWithFullBonus = 60 + toneNudge(['dark', 'tense', 'grounded'], ['dark', 'tense', 'grounded']);
    expect(weakWithFullBonus).toBeLessThan(strong);
  });

  it('breaks TIES toward the on-tone title (its intended effect)', () => {
    const a = 70 + toneNudge(['dark', 'gritty'], ['dark', 'gritty']); // on tone
    const b = 70 + toneNudge(['sunny'], ['dark', 'gritty']); // off tone
    expect(a).toBeGreaterThan(b);
  });
});
