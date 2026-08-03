import { describe, it, expect } from 'vitest';
import {
  GUIDE_CATEGORIES,
  buildChannelGuide,
  filterGuide,
  filterGuideByCategory,
  filterGuideByMedia,
  guideSummary,
  onNowOf,
  repeatStatusFor,
  UP_NEXT,
} from './channelGuide';
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
    network: 'Hallmark',
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

describe('what is on right now', () => {
  it('finds the airing covering this minute', () => {
    const on = airing({ airstamp: '2026-07-28T20:00:00Z', runtime: 120, showName: 'A Hallmark Movie' });
    const later = airing({ airstamp: '2026-07-28T22:00:00Z' });
    expect(onNowOf([on, later], NOW)?.showName).toBe('A Hallmark Movie');
  });

  it('never claims "on now" without a runtime to prove it', () => {
    const unknown = airing({ airstamp: '2026-07-28T20:00:00Z', runtime: null });
    expect(onNowOf([unknown], NOW)).toBeNull();
  });

  it('when listings overlap, the later start wins — it is what the channel cut to', () => {
    const long = airing({ airstamp: '2026-07-28T19:00:00Z', runtime: 180, showName: 'Marathon' });
    const cut = airing({ airstamp: '2026-07-28T20:00:00Z', runtime: 60, showName: 'Breaking In' });
    expect(onNowOf([long, cut], NOW)?.showName).toBe('Breaking In');
  });
});

describe('building the guide', () => {
  const AIRINGS = [
    airing({ network: 'Hallmark', airstamp: '2026-07-28T20:00:00Z', runtime: 120, showName: 'Autumn in the City', showType: 'Movie' }),
    airing({ network: 'Hallmark', airstamp: '2026-07-28T22:00:00Z', showName: 'A Second Chance' }),
    airing({ network: 'Hallmark', airstamp: '2026-07-28T23:00:00Z', showName: 'Third Up' }),
    airing({ network: 'Hallmark', airstamp: '2026-07-29T00:00:00Z', showName: 'Fourth — beyond the cap' }),
    airing({ network: 'Lifetime', airstamp: '2026-07-28T21:00:00Z', showName: 'Upcoming Only' }),
    airing({ network: 'TCM', airstamp: '2026-07-28T19:45:00Z', runtime: 90, showName: 'Casablanca', showType: 'Movie' }),
    airing({ network: 'Dead Channel', airstamp: '2026-07-28T17:00:00Z', runtime: 30, showName: 'Already Over' }),
  ];

  it('one row per channel — now first, then what is next', () => {
    const rows = buildChannelGuide(AIRINGS, NOW);
    const hallmark = rows.find((r) => r.network === 'Hallmark')!;
    expect(hallmark.onNow?.showName).toBe('Autumn in the City');
    expect(hallmark.upNext.map((a) => a.showName)).toEqual(['A Second Chance', 'Third Up']);
    expect(hallmark.upNext.length).toBe(UP_NEXT);
  });

  it('channels showing something NOW lead, both groups alphabetical', () => {
    const rows = buildChannelGuide(AIRINGS, NOW);
    expect(rows.map((r) => r.network)).toEqual(['Hallmark', 'TCM', 'Lifetime']);
  });

  it('progress is a real fraction of the running airing', () => {
    const rows = buildChannelGuide(AIRINGS, NOW);
    const tcm = rows.find((r) => r.network === 'TCM')!;
    // Casablanca started 19:45, runs 90m; at 20:30 that is 45/90.
    expect(tcm.progress).toBeCloseTo(0.5, 2);
  });

  it('a channel with nothing on and nothing coming is dropped, not shown empty', () => {
    const rows = buildChannelGuide(AIRINGS, NOW);
    expect(rows.some((r) => r.network === 'Dead Channel')).toBe(false);
  });

  it('an empty grid builds an empty guide without throwing', () => {
    expect(buildChannelGuide([], NOW)).toEqual([]);
  });

  it('east and west feeds of the same broadcast are ONE row entry, not two', () => {
    // A&E and A&E-West both display as "A&E" — the same episode arrived twice
    // at the same minute and the guide printed it twice in up-next.
    const rows = buildChannelGuide(
      [
        airing({ network: 'A&E', airstamp: '2026-07-28T21:00:00Z', showName: 'Neighborhood Wars' }),
        airing({ network: 'A&E', airstamp: '2026-07-28T21:00:00Z', showName: 'Neighborhood Wars' }),
        airing({ network: 'A&E', airstamp: '2026-07-28T21:30:00Z', showName: 'Neighborhood Wars' }),
      ],
      NOW,
    );
    const ae = rows.find((r) => r.network === 'A&E')!;
    // The 21:00 dupe collapses; the genuinely different 21:30 showing stays.
    expect(ae.upNext.map((a) => a.airstamp)).toEqual(['2026-07-28T21:00:00Z', '2026-07-28T21:30:00Z']);
  });
});

describe('the header sentence', () => {
  it('counts channels, live airings and movies from the same rows it describes', () => {
    const rows = buildChannelGuide(
      [
        airing({ network: 'Hallmark', airstamp: '2026-07-28T20:00:00Z', runtime: 120, showType: 'Movie' }),
        airing({ network: 'Lifetime', airstamp: '2026-07-28T21:00:00Z', showType: 'Movie' }),
        airing({ network: 'CNN', airstamp: '2026-07-28T20:00:00Z', runtime: 60 }),
      ],
      NOW,
    );
    expect(guideSummary(rows)).toEqual({ channels: 3, onNow: 2, movies: 2 });
  });
});

describe('finding a channel in three hundred', () => {
  const rows = buildChannelGuide(
    [
      airing({ network: 'Hallmark', airstamp: '2026-07-28T20:00:00Z', runtime: 120, showName: 'Autumn in the City' }),
      airing({ network: 'Lifetime Movie Network', airstamp: '2026-07-28T21:00:00Z', showName: 'A Dangerous Affair' }),
      airing({ network: 'ESPN', airstamp: '2026-07-28T20:00:00Z', runtime: 180, showName: 'Monday Night Football' }),
    ],
    NOW,
  );

  it('matches by channel name', () => {
    expect(filterGuide(rows, 'lifetime').map((r) => r.network)).toEqual(['Lifetime Movie Network']);
  });

  it('matches by what is ON the channel too', () => {
    expect(filterGuide(rows, 'football').map((r) => r.network)).toEqual(['ESPN']);
    expect(filterGuide(rows, 'dangerous').map((r) => r.network)).toEqual(['Lifetime Movie Network']);
  });

  it('an empty query is the whole guide', () => {
    expect(filterGuide(rows, '  ')).toHaveLength(3);
  });
});

describe('the movie / show toggle', () => {
  const grid = buildChannelGuide(
    [
      airing({ network: 'TCM', showName: 'Casablanca', showType: 'Movie', runtime: 120 }),
      // A series on now, but a film starts next — "Movies" must keep this row.
      airing({ network: 'AMC', showName: 'A Rerun', runtime: 60 }),
      airing({ network: 'AMC', showName: 'Die Hard', showType: 'Movie', airstamp: '2026-07-28T21:00:00Z' }),
      airing({ network: 'ESPN', showName: 'SportsCenter', runtime: 120 }),
    ],
    NOW,
  );

  it('Movies keeps every channel with a movie on now OR up next', () => {
    expect(filterGuideByMedia(grid, 'movie').map((r) => r.network).sort()).toEqual(['AMC', 'TCM']);
  });

  it('Shows keeps the channels with a series in view', () => {
    expect(filterGuideByMedia(grid, 'tv').map((r) => r.network).sort()).toEqual(['AMC', 'ESPN']);
  });

  it('All is the untouched guide', () => {
    expect(filterGuideByMedia(grid, 'all')).toHaveLength(3);
  });

  it('ranked extras survive the filter — the order stays the taste order', () => {
    const ranked = grid.map((r) => ({ ...r, rankScore: 70 }));
    expect(filterGuideByMedia(ranked, 'movie').every((r) => r.rankScore === 70)).toBe(true);
  });
});

describe('one-tap channel groups', () => {
  const grid = buildChannelGuide(
    [
      airing({ network: 'TCM', showName: 'Casablanca', showType: 'Movie', runtime: 120 }),
      airing({ network: 'ESPN', showName: 'SportsCenter', runtime: 120 }),
      airing({ network: 'Hallmark', showName: 'Autumn in the City', showType: 'Movie', runtime: 120 }),
      airing({ network: 'Food Network', showName: 'Chopped', runtime: 120 }),
    ],
    NOW,
  );

  it('a channel is grouped only where its identity is defensible', () => {
    expect(filterGuideByCategory(grid, 'movies').map((r) => r.network)).toEqual(['TCM']);
    expect(filterGuideByCategory(grid, 'sports').map((r) => r.network)).toEqual(['ESPN']);
    expect(filterGuideByCategory(grid, 'feelgood').map((r) => r.network)).toEqual(['Hallmark']);
  });

  it('a channel matching no group appears only under All — never guessed into one', () => {
    for (const c of GUIDE_CATEGORIES) {
      expect(filterGuideByCategory(grid, c.key).some((r) => r.network === 'Food Network')).toBe(false);
    }
  });

  it('no group selected (or an unknown key) is the whole guide', () => {
    expect(filterGuideByCategory(grid, null)).toHaveLength(4);
    expect(filterGuideByCategory(grid, 'nope')).toHaveLength(4);
  });

  it('every group key is unique and labelled', () => {
    const keys = GUIDE_CATEGORIES.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(GUIDE_CATEGORIES.every((c) => c.label.length > 0)).toBe(true);
  });
});

describe('same show, back to back — new episode, a repeat, or unknown', () => {
  it('is null when the two airings are different shows', () => {
    const a = airing({ showId: 1, season: 1, number: 1 });
    const b = airing({ showId: 2, season: 1, number: 1 });
    expect(repeatStatusFor(a, b)).toBeNull();
  });

  it('is "repeat" when the same show has the same season and episode number', () => {
    const a = airing({ showId: 1, season: 3, number: 5, episodeName: 'The Alibi' });
    const b = airing({ showId: 1, season: 3, number: 5, episodeName: 'The Alibi' });
    expect(repeatStatusFor(a, b)).toBe('repeat');
  });

  it('is "new-episode" when the same show has a different season/number', () => {
    const a = airing({ showId: 1, season: 3, number: 5 });
    const b = airing({ showId: 1, season: 3, number: 6 });
    expect(repeatStatusFor(a, b)).toBe('new-episode');
  });

  it('is "unknown" when either side is missing season/number — never guessed', () => {
    const known = airing({ showId: 1, season: 3, number: 5 });
    const unknown = airing({ showId: 1, season: null, number: null });
    expect(repeatStatusFor(known, unknown)).toBe('unknown');
    expect(repeatStatusFor(unknown, known)).toBe('unknown');
    expect(repeatStatusFor(unknown, unknown)).toBe('unknown');
  });
});
