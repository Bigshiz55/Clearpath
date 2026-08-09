import { describe, it, expect } from 'vitest';
import { GUIDE_CHANNEL_LINEUP, GUIDE_LINEUP_SIZE } from './guideLineup';
import { buildChannelGuide } from './channelGuide';
import type { Airing } from '@/lib/onTv';

/**
 * LINEUP-FIRST FULL GUIDE, PINNED.
 *
 * The channel universe is the canonical supported lineup, NOT whichever airings
 * exist. Every supported channel renders; one with no schedule data renders
 * "Schedule currently unavailable" and is NEVER deleted. These are the exact
 * representative-network guarantees the assignment requires.
 */

const NOW = Date.parse('2026-07-28T20:30:00Z');

/** The networks the assignment says must appear (or carry a diagnostic reason). */
const REPRESENTATIVE = [
  'ABC', 'CBS', 'NBC', 'FOX', 'CNN', 'ESPN', 'MTV', 'Lifetime',
  'Hallmark Channel', 'Investigation Discovery', 'Oxygen', 'USA Network', 'TNT', 'FX',
];

function airing(over: Partial<Airing>): Airing {
  return {
    id: 1, time: '20:00', minutes: 1200, airstamp: '2026-07-28T20:00:00Z', runtime: 60,
    network: 'ESPN', showName: 'SportsCenter', showId: 1, episodeName: null, season: null,
    number: null, showType: 'Series', genres: [], rating: null, image: null, summary: null, imdb: null,
    ...over,
  };
}

describe('the canonical guide lineup', () => {
  it('includes every representative network', () => {
    const names = new Set(GUIDE_CHANNEL_LINEUP.map((c) => c.name));
    for (const net of REPRESENTATIVE) expect(names, net).toContain(net);
  });

  it('is de-duplicated by slug and non-trivially sized', () => {
    const slugs = GUIDE_CHANNEL_LINEUP.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(GUIDE_LINEUP_SIZE).toBeGreaterThan(40);
  });
});

describe('every supported channel renders — never silently disappears', () => {
  it('with ZERO airings, every representative network still gets a row (schedule unavailable)', () => {
    const rows = buildChannelGuide([], NOW);
    const byName = new Map(rows.map((r) => [r.network, r]));
    for (const net of REPRESENTATIVE) {
      const row = byName.get(net);
      expect(row, net).toBeDefined();
      expect(row!.scheduleUnavailable, net).toBe(true);
      expect(row!.onNow, net).toBeNull();
      expect(row!.upNext, net).toEqual([]);
    }
  });

  it('a channel WITH an airing shows its schedule; the rest stay as placeholders', () => {
    const rows = buildChannelGuide(
      [airing({ network: 'ESPN', airstamp: '2026-07-28T20:00:00Z', runtime: 180, showName: 'Monday Night Football' })],
      NOW,
    );
    const espn = rows.find((r) => r.network === 'ESPN')!;
    expect(espn.onNow?.showName).toBe('Monday Night Football');
    expect(espn.scheduleUnavailable).toBeFalsy();
    // A different supported channel is still present, as a placeholder.
    const cnn = rows.find((r) => r.network === 'CNN')!;
    expect(cnn.scheduleUnavailable).toBe(true);
    // On-now channels sort ahead of schedule-unavailable ones.
    expect(rows.findIndex((r) => r.network === 'ESPN')).toBeLessThan(rows.findIndex((r) => r.network === 'CNN'));
  });

  it('an airing-bearing channel NOT in the lineup is still included (real data is never lost)', () => {
    const rows = buildChannelGuide(
      [airing({ network: 'Some Local Access 12', airstamp: '2026-07-28T20:00:00Z', runtime: 120, showName: 'Town Hall' })],
      NOW,
    );
    expect(rows.some((r) => r.network === 'Some Local Access 12')).toBe(true);
  });

  it('includeLineup=false preserves the legacy airing-only guide (for the search filter)', () => {
    expect(buildChannelGuide([], NOW, false)).toEqual([]);
  });
});
