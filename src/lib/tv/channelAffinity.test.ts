import { describe, it, expect } from 'vitest';
import { channelAffinity, channelTraits, rankGuideForTaste } from './channelAffinity';
import type { ChannelRow } from './channelGuide';

// A profile shaped like the engine's real rules: loves detective/true-crime,
// avoids the supernatural and sci-fi.
const RULES = [
  { trait: 'grounded_crime', weight: 12 },
  { trait: 'serial_killer', weight: 12 },
  { trait: 'domestic_thriller', weight: 6 },
  { trait: 'supernatural', weight: -20 },
  { trait: 'science_fiction', weight: -20 },
];

function row(network: string, live = true): ChannelRow {
  return {
    network,
    onNow: live
      ? ({ id: 1, airstamp: '2026-07-28T20:00:00Z', showName: 'x', runtime: 60 } as ChannelRow['onNow'])
      : null,
    progress: live ? 0.5 : null,
    upNext: [],
  };
}

describe('what a channel is', () => {
  it('tags only the channels whose programming identity is defensible', () => {
    expect(channelTraits('Investigation Discovery')).toContain('serial_killer');
    expect(channelTraits('Lifetime')).toEqual(['domestic_thriller']);
    expect(channelTraits('Syfy')).toContain('science_fiction');
  });

  it('claims NOTHING about channels it does not know', () => {
    for (const net of ['Hallmark', 'ESPN', 'CNN', 'HBO', 'Some Local Affiliate']) {
      expect(channelTraits(net), net).toEqual([]);
    }
  });
});

describe('the score is the user’s own rule weights', () => {
  it('sums matching weights — the same numbers the title engine uses', () => {
    expect(channelAffinity('Investigation Discovery', RULES)).toBe(24); // crime 12 + serial 12
    expect(channelAffinity('Lifetime', RULES)).toBe(6);
  });

  it('negative rules push a channel DOWN, not just favourites up', () => {
    expect(channelAffinity('Syfy', RULES)).toBeLessThan(0);
  });

  it('no rules, or an unknown channel, scores exactly zero', () => {
    expect(channelAffinity('Investigation Discovery', [])).toBe(0);
    expect(channelAffinity('Hallmark', RULES)).toBe(0);
  });
});

describe('ordering the guide', () => {
  const ROWS = [row('A&E'), row('ESPN'), row('Investigation Discovery'), row('Syfy'), row('CNN'), row('Lifetime', false)];

  it('taste leads inside the live group; zero-affinity stays alphabetical', () => {
    const ranked = rankGuideForTaste(ROWS, RULES);
    expect(ranked.map((r) => r.network)).toEqual([
      'Investigation Discovery', // +24
      'A&E', // +12
      'CNN', // 0, alphabetical…
      'ESPN', // 0
      'Syfy', // −60, actively avoided → last of the live group
      'Lifetime', // +6 but not live — live channels still lead
    ]);
  });

  it('live-first survives taste — a loved channel with nothing on does not jump the queue', () => {
    const ranked = rankGuideForTaste(ROWS, RULES);
    expect(ranked.at(-1)!.network).toBe('Lifetime');
  });

  it('flags only genuinely favoured channels as for-you', () => {
    const ranked = rankGuideForTaste(ROWS, RULES);
    const flags = Object.fromEntries(ranked.map((r) => [r.network, r.forYou]));
    expect(flags['Investigation Discovery']).toBe(true);
    expect(flags['Lifetime']).toBe(true);
    expect(flags['ESPN']).toBe(false);
    expect(flags['Syfy']).toBe(false); // negative is not "for you"
  });

  it('with no rules the guide is EXACTLY the old order', () => {
    const ranked = rankGuideForTaste(ROWS, []);
    expect(ranked.map((r) => r.network)).toEqual(['A&E', 'CNN', 'ESPN', 'Investigation Discovery', 'Syfy', 'Lifetime']);
    expect(ranked.every((r) => !r.forYou)).toBe(true);
  });
});
