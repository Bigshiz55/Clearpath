import { describe, it, expect } from 'vitest';
import { applyScores, guideRankScore, NEUTRAL, pickScoringCandidates, scoreKeyFor } from './guideScoring';
import { rankGuideForTaste } from './channelAffinity';
import { buildChannelGuide } from './channelGuide';
import type { Airing } from '@/lib/onTv';

const NOW = Date.parse('2026-07-28T20:30:00Z');

let seq = 0;
function airing(over: Partial<Airing>): Airing {
  seq++;
  return {
    id: seq,
    time: '20:00',
    minutes: 1200,
    airstamp: '2026-07-28T20:00:00Z',
    runtime: 60,
    network: 'USA Network',
    showName: `Show ${seq}`,
    showId: seq,
    episodeName: null,
    season: null,
    number: null,
    showType: 'Series',
    genres: [],
    rating: null,
    image: null,
    summary: null,
    imdb: null,
    ...over,
  };
}

describe('who gets the scoring budget', () => {
  it('on-now first, then soonest, capped at the budget', () => {
    const onNow = airing({ showName: 'NCIS', airstamp: '2026-07-28T20:00:00Z', runtime: 120 });
    const soon = airing({ showName: 'Soon', airstamp: '2026-07-28T21:00:00Z' });
    const later = airing({ showName: 'Later', airstamp: '2026-07-28T23:00:00Z' });
    const picked = pickScoringCandidates([later, soon, onNow], NOW, 2);
    expect(picked.map((a) => a.showName)).toEqual(['NCIS', 'Soon']);
  });

  it('one spend per distinct title — a movie on two channels is one lookup', () => {
    const east = airing({ showName: 'Die Hard', showType: 'Movie', network: 'AMC', runtime: 150 });
    const west = airing({ showName: 'Die Hard', showType: 'Movie', network: 'AMC West', runtime: 150 });
    expect(pickScoringCandidates([east, west], NOW)).toHaveLength(1);
  });

  it('the same NAME as a movie and as a series are different titles', () => {
    const movie = airing({ showName: 'Fargo', showType: 'Movie', runtime: 100 });
    const series = airing({ showName: 'Fargo', showType: 'Series', runtime: 60 });
    expect(pickScoringCandidates([movie, series], NOW)).toHaveLength(2);
  });

  it('never spends on an untitled listing or one that already ended', () => {
    const untitled = airing({ showName: 'Untitled' });
    const over = airing({ showName: 'Done', airstamp: '2026-07-28T18:00:00Z', runtime: 30 });
    expect(pickScoringCandidates([untitled, over], NOW)).toHaveLength(0);
  });
});

describe('spreading the scores back', () => {
  it('every airing of a scored title gets the number — both channels earned it', () => {
    const east = airing({ showName: 'Die Hard', showType: 'Movie', network: 'AMC' });
    const west = airing({ showName: 'Die Hard', showType: 'Movie', network: 'AMC West' });
    const scores = new Map([[scoreKeyFor(east), { tmdbId: 562, mediaType: 'movie' as const, match: 84 }]]);
    const out = applyScores([east, west], scores);
    expect(out[0]!.match).toBe(84);
    expect(out[1]!.match).toBe(84);
    expect(out[0]!.tmdbId).toBe(562);
  });

  it('unscored airings pass through untouched', () => {
    const a = airing({ showName: 'Unknown Thing' });
    const out = applyScores([a], new Map());
    expect(out[0]).toEqual(a);
  });
});

describe('one rank number per row', () => {
  it('a real programme score speaks for itself', () => {
    const rows = buildChannelGuide([airing({ showName: 'NCIS', runtime: 120, match: 76 })], NOW);
    expect(guideRankScore(rows[0]!)).toBe(76);
  });

  it('affinity only nudges the neutral baseline when no programme is scored', () => {
    expect(guideRankScore({ network: 'X', onNow: null, progress: null, upNext: [], affinity: 12 })).toBe(NEUTRAL + 12);
    expect(guideRankScore({ network: 'X', onNow: null, progress: null, upNext: [], affinity: 0 })).toBe(NEUTRAL);
  });

  it('and can never counterfeit a strong real score', () => {
    expect(guideRankScore({ network: 'X', onNow: null, progress: null, upNext: [], affinity: 500 })).toBe(90);
    expect(guideRankScore({ network: 'X', onNow: null, progress: null, upNext: [], affinity: -500 })).toBe(10);
  });
});

describe('the whole blend, end to end', () => {
  it('a great programme on a neutral channel outranks a loved channel showing something unscored', () => {
    const airings = [
      airing({ network: 'CMT', showName: 'A Movie That Suits You', showType: 'Movie', runtime: 120, match: 84 }),
      airing({ network: 'Investigation Discovery', showName: 'Generic Filler', runtime: 60 }),
      airing({ network: 'ESPN', showName: 'SportsCenter', runtime: 60 }),
    ];
    const rules = [{ trait: 'grounded_crime', weight: 12 }, { trait: 'serial_killer', weight: 12 }];
    const ranked = rankGuideForTaste(buildChannelGuide(airings, NOW), rules);
    // CMT's programme (84) > ID's identity (55+24=79) > ESPN neutral (55).
    expect(ranked.map((r) => r.network)).toEqual(['CMT', 'Investigation Discovery', 'ESPN']);
  });

  it('a programme the engine dislikes sinks BELOW a merely neutral channel', () => {
    const airings = [
      airing({ network: 'Syfy', showName: 'Not Your Thing', runtime: 120, match: 31 }),
      airing({ network: 'ESPN', showName: 'SportsCenter', runtime: 60 }),
    ];
    const ranked = rankGuideForTaste(buildChannelGuide(airings, NOW), []);
    expect(ranked.map((r) => r.network)).toEqual(['ESPN', 'Syfy']);
  });

  it('no scores and no rules is EXACTLY the old alphabetical guide', () => {
    const airings = [
      airing({ network: 'B Channel', showName: 'b', runtime: 60 }),
      airing({ network: 'A Channel', showName: 'a', runtime: 60 }),
    ];
    const ranked = rankGuideForTaste(buildChannelGuide(airings, NOW), []);
    expect(ranked.map((r) => r.network)).toEqual(['A Channel', 'B Channel']);
    expect(ranked.every((r) => r.rankScore === NEUTRAL)).toBe(true);
  });
});

/**
 * THE PERSONALIZATION EVIDENCE TRAVELS WITH THE SCORE.
 *
 * The briefing decided "Your verdict" from an account-level fact and printed it
 * over objective numbers. The engine now states, per title, whether real
 * title-specific signal participated — and `applyScores` is the seam where that
 * verdict reaches every airing of the title, so it is pinned here.
 */
describe('applyScores carries the personalization verdict, not just the number', () => {
  const airing = (over: Partial<Airing> & Pick<Airing, 'showName' | 'airstamp'>): Airing =>
    ({
      id: 1, time: '20:00', minutes: 1200, runtime: 60, network: 'N', showId: 1,
      episodeName: null, season: null, number: null, showType: 'Scripted',
      genres: [], rating: null, image: null, summary: null, imdb: null, ...over,
    }) as Airing;

  it('a personalized score arrives labelled personalized', () => {
    const a = airing({ showName: 'X', airstamp: '2026-08-15T20:00:00Z' });
    const out = applyScores(
      [a],
      new Map([[scoreKeyFor(a), { tmdbId: 5, mediaType: 'tv' as const, match: 63, why: 'w', personalized: true }]]),
    );
    expect(out[0]!.match).toBe(63);
    expect(out[0]!.matchPersonalized).toBe(true);
  });

  it('an objective-only score arrives labelled NOT personalized', () => {
    const a = airing({ showName: 'X', airstamp: '2026-08-15T20:00:00Z' });
    const out = applyScores(
      [a],
      new Map([[scoreKeyFor(a), { tmdbId: 5, mediaType: 'tv' as const, match: 83, why: 'w', personalized: false }]]),
    );
    expect(out[0]!.matchPersonalized).toBe(false);
  });

  it('an omitted verdict defaults to NOT personalized — never the flattering guess', () => {
    const a = airing({ showName: 'X', airstamp: '2026-08-15T20:00:00Z' });
    const out = applyScores(
      [a],
      new Map([[scoreKeyFor(a), { tmdbId: 5, mediaType: 'tv' as const, match: 83, why: null }]]),
    );
    expect(out[0]!.matchPersonalized).toBe(false);
  });
});
