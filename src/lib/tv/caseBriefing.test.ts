import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BRIEFING_TZ,
  LEAD_POOL_CAP,
  airingTimeRange,
  airingTodayLine,
  dayKeyIn,
  formatClock,
  httpsUrl,
  localDayWindow,
  localHour,
  safeTimeZone,
  selectCaseBriefing,
} from './caseBriefing';
import { NEUTRAL } from './guideScoring';
import type { Airing } from '@/lib/onTv';

// 2026-08-15T18:00:00Z = 14:00 in New York, 11:00 in Los Angeles.
const NOW = Date.parse('2026-08-15T18:00:00Z');
const NY = 'America/New_York';
const LA = 'America/Los_Angeles';

let seq = 0;
const a = (over: Partial<Airing> & Pick<Airing, 'showName' | 'airstamp'>): Airing => ({
  id: ++seq,
  time: '12:00',
  minutes: 720,
  runtime: 60,
  network: `Channel ${seq}`,
  showId: 9000 + seq,
  episodeName: null,
  season: null,
  number: null,
  showType: 'Scripted',
  genres: [],
  rating: null,
  image: null,
  summary: null,
  imdb: null,
  ...over,
});

describe('safeTimeZone', () => {
  it('accepts real IANA zones and rejects junk — never a guess', () => {
    expect(safeTimeZone('America/Los_Angeles')).toBe('America/Los_Angeles');
    expect(safeTimeZone('UTC')).toBe('UTC');
    expect(safeTimeZone('Not/A_Zone')).toBeNull();
    expect(safeTimeZone('America/New_York; DROP TABLE')).toBeNull();
    expect(safeTimeZone('')).toBeNull();
    expect(safeTimeZone(null)).toBeNull();
    expect(safeTimeZone('x'.repeat(65))).toBeNull();
  });
});

describe('localDayWindow — the literal local calendar day', () => {
  it('bounds the day by the viewer zone, not a hardcoded Eastern day', () => {
    const ny = localDayWindow(NOW, NY);
    expect(ny.dayKey).toBe('2026-08-15');
    expect(new Date(ny.startMs).toISOString()).toBe('2026-08-15T04:00:00.000Z'); // EDT midnight
    expect(new Date(ny.endMs).toISOString()).toBe('2026-08-16T04:00:00.000Z');

    const la = localDayWindow(NOW, LA);
    expect(la.dayKey).toBe('2026-08-15');
    expect(new Date(la.startMs).toISOString()).toBe('2026-08-15T07:00:00.000Z'); // PDT midnight
    expect(new Date(la.endMs).toISOString()).toBe('2026-08-16T07:00:00.000Z');
  });

  it('a DST fall-back day is honestly 25 hours long', () => {
    // 2026-11-01 is the US fall-back date: EDT midnight start, EST midnight end.
    const w = localDayWindow(Date.parse('2026-11-01T18:00:00Z'), NY);
    expect(w.dayKey).toBe('2026-11-01');
    expect(new Date(w.startMs).toISOString()).toBe('2026-11-01T04:00:00.000Z');
    expect(new Date(w.endMs).toISOString()).toBe('2026-11-02T05:00:00.000Z');
    expect(w.endMs - w.startMs).toBe(25 * 3600_000);
  });

  it('a DST spring-forward day is honestly 23 hours long', () => {
    const w = localDayWindow(Date.parse('2026-03-08T18:00:00Z'), NY);
    expect(w.dayKey).toBe('2026-03-08');
    expect(new Date(w.startMs).toISOString()).toBe('2026-03-08T05:00:00.000Z');
    expect(new Date(w.endMs).toISOString()).toBe('2026-03-09T04:00:00.000Z');
    expect(w.endMs - w.startMs).toBe(23 * 3600_000);
  });
});

describe('clock/format helpers', () => {
  it('formats in the requested zone', () => {
    expect(formatClock(Date.parse('2026-08-16T00:00:00Z'), NY)).toBe('8:00 PM');
    expect(formatClock(Date.parse('2026-08-16T00:00:00Z'), LA)).toBe('5:00 PM');
    expect(localHour(Date.parse('2026-08-16T00:00:00Z'), NY)).toBe(20);
  });

  it('airing range needs a provable runtime for an end time', () => {
    const movie = a({ showName: 'Feature', airstamp: '2026-08-16T00:00:00Z', runtime: 150, network: 'TCM' });
    expect(airingTimeRange(movie, NY)).toBe('8:00 PM–10:30 PM');
    expect(airingTodayLine(movie, NY)).toBe('AIRING TODAY · TCM · 8:00 PM–10:30 PM');
    const open = a({ showName: 'No Runtime', airstamp: '2026-08-16T00:00:00Z', runtime: null });
    expect(airingTimeRange(open, NY)).toBe('8:00 PM');
  });

  it('httpsUrl withholds anything that is not https — never rewrites', () => {
    expect(httpsUrl('https://cdn.example/x.png')).toBe('https://cdn.example/x.png');
    expect(httpsUrl('http://cdn.tvpassport.com/x.png')).toBeNull();
    expect(httpsUrl(null)).toBeNull();
    expect(httpsUrl(undefined)).toBeNull();
  });
});

describe('selectCaseBriefing', () => {
  const day = (): Airing[] => [
    // Scored: lead (92), top cases, and a wildcard candidate in a foreign genre.
    a({ showName: 'Lead Feature', airstamp: '2026-08-16T00:00:00Z', runtime: 120, showType: 'Movie', network: 'TCM', match: 92, matchWhy: 'Quality base 78 · +9 Crime dramas', genres: ['Crime', 'Drama'] }),
    a({ showName: 'Second Case', airstamp: '2026-08-15T23:00:00Z', network: 'A&E', match: 84, genres: ['Crime'] }),
    a({ showName: 'Third Case', airstamp: '2026-08-15T21:00:00Z', network: 'AMC', match: 71, genres: ['Drama'] }),
    a({ showName: 'Cartoon Wild', airstamp: '2026-08-15T22:00:00Z', network: 'Toon', match: 68, genres: ['Animation'] }),
    a({ showName: 'Sub Neutral', airstamp: '2026-08-15T22:30:00Z', network: 'Basic', match: NEUTRAL - 10, genres: ['Reality'] }),
    // Unscored schedule truth.
    a({ showName: 'Evening Game', airstamp: '2026-08-16T00:30:00Z', runtime: 180, showType: 'Sports', network: 'ESPN' }),
    a({ showName: 'Fresh Premiere', airstamp: '2026-08-16T01:00:00Z', isPremiere: true, network: 'NBC' }),
    a({ showName: 'Late Movie', airstamp: '2026-08-16T03:30:00Z', runtime: 90, showType: 'Movie', network: 'TCM' }),
    a({ showName: 'Plain Rerun', airstamp: '2026-08-15T20:00:00Z', network: 'Basic' }),
    // On now in NY (started 17:30Z, 120 min) — still today, still briefable.
    a({ showName: 'Running Matinee', airstamp: '2026-08-15T17:30:00Z', runtime: 120, showType: 'Movie', network: 'AMC' }),
    // Already over (started 10:00Z, 60 min) — never briefed.
    a({ showName: 'Morning Gone', airstamp: '2026-08-15T10:00:00Z', network: 'AMC' }),
    // Started before local midnight — yesterday's briefing by the literal-day rule.
    a({ showName: 'Cross Midnight', airstamp: '2026-08-15T03:00:00Z', runtime: 20 * 60, network: 'Marathon' }),
  ];

  it('personalized sections carry only engine-scored rows, best first', () => {
    const b = selectCaseBriefing(day(), NOW, NY, { personalized: true });
    expect(b.leadCase?.showName).toBe('Lead Feature');
    expect(b.leadCase?.matchWhy).toContain('Quality base');
    expect(b.topCases.map((x) => x.showName)).toEqual(['Second Case', 'Third Case', 'Cartoon Wild', 'Sub Neutral']);
    expect(b.topCases.length).toBeLessThanOrEqual(LEAD_POOL_CAP);
    // Everything scored fit into lead+top here, so Worth Watching is overflow-empty.
    expect(b.worthWatching).toEqual([]);
  });

  it('an unpersonalized reader gets schedule truth and no personal claims', () => {
    const b = selectCaseBriefing(day(), NOW, NY, { personalized: false });
    expect(b.leadCase).toBeNull();
    expect(b.topCases).toEqual([]);
    expect(b.worthWatching).toEqual([]);
    expect(b.wildcard).toBeNull();
    expect(b.moviesOnTheDocket.length).toBeGreaterThan(0);
    expect(b.tonightsDocket.length).toBeGreaterThan(0);
  });

  it('never invents a score — unscored rows come back without a match', () => {
    const b = selectCaseBriefing(day(), NOW, NY, { personalized: true });
    const game = b.liveAndSports.find((x) => x.showName === 'Evening Game');
    expect(game).toBeDefined();
    expect(game?.match).toBeUndefined();
    for (const list of [b.tonightsDocket, b.moviesOnTheDocket, b.newAndPremieres, b.lateNightFile]) {
      for (const row of list) expect('match' in row ? row.match : undefined).not.toBeNaN();
    }
  });

  it('tonight (19:00–22:59 local) and the late-night file (23:00+) are disjoint', () => {
    const b = selectCaseBriefing(day(), NOW, NY, { personalized: true });
    const tonightNames = b.tonightsDocket.map((x) => x.showName);
    const lateNames = b.lateNightFile.map((x) => x.showName);
    expect(tonightNames).toContain('Lead Feature'); // 20:00 ET
    expect(tonightNames).toContain('Evening Game'); // 20:30 ET
    expect(tonightNames).toContain('Second Case'); // 19:00 ET
    expect(lateNames).toEqual(['Late Movie']); // 23:30 ET — the only 23:00+ start
    expect(tonightNames.filter((n) => lateNames.includes(n))).toEqual([]);
  });

  it('movies and sports are provider classifications; premieres are provider flags', () => {
    const b = selectCaseBriefing(day(), NOW, NY, { personalized: true });
    expect(b.moviesOnTheDocket.map((x) => x.showName)).toEqual(['Lead Feature', 'Running Matinee', 'Late Movie']);
    expect(b.liveAndSports.map((x) => x.showName)).toEqual(['Evening Game']);
    expect(b.newAndPremieres.map((x) => x.showName)).toEqual(['Fresh Premiere']);
  });

  it('the wildcard shares no genre with the lead/top cases and clears the neutral line', () => {
    // Push the animation title out of the top-case pool with more crime titles.
    const rows = [
      ...day(),
      a({ showName: 'Case Five', airstamp: '2026-08-15T20:30:00Z', network: 'ID', match: 80, genres: ['Crime'] }),
      a({ showName: 'Case Six', airstamp: '2026-08-15T20:45:00Z', network: 'ID', match: 79, genres: ['Crime'] }),
      a({ showName: 'Case Seven', airstamp: '2026-08-15T20:50:00Z', network: 'ID', match: 78, genres: ['Drama'] }),
      a({ showName: 'Case Eight', airstamp: '2026-08-15T20:55:00Z', network: 'ID', match: 77, genres: ['Crime'] }),
    ];
    const b = selectCaseBriefing(rows, NOW, NY, { personalized: true });
    expect(b.topCases.map((x) => x.showName)).not.toContain('Cartoon Wild');
    expect(b.wildcard?.showName).toBe('Cartoon Wild');
    // One personalized section per title: the wildcard never re-lists under
    // Worth Watching.
    expect(b.worthWatching.map((x) => x.showName)).not.toContain('Cartoon Wild');
    // Below-neutral or genre-overlapping rows never become the wildcard.
    expect(b.wildcard?.showName).not.toBe('Sub Neutral');
  });

  it('the literal-day rule: membership follows the viewer zone', () => {
    // 2026-08-16T05:00:00Z = Aug 15 22:00 in LA (today) but Aug 16 01:00 in NY.
    const rows = [a({ showName: 'West Coast Late Show', airstamp: '2026-08-16T05:00:00Z', network: 'KLA' })];
    const la = selectCaseBriefing(rows, NOW, LA, { personalized: false });
    const ny = selectCaseBriefing(rows, NOW, NY, { personalized: false });
    expect(la.poolCount).toBe(1);
    expect(la.tonightsDocket.map((x) => x.showName)).toEqual(['West Coast Late Show']);
    expect(ny.poolCount).toBe(0);
  });

  it('on-now rows are briefable; finished and cross-midnight rows are not', () => {
    const b = selectCaseBriefing(day(), NOW, NY, { personalized: true });
    expect(b.moviesOnTheDocket.map((x) => x.showName)).toContain('Running Matinee');
    const everyName = [
      ...b.tonightsDocket,
      ...b.moviesOnTheDocket,
      ...b.liveAndSports,
      ...b.newAndPremieres,
      ...b.lateNightFile,
    ].map((x) => x.showName);
    expect(everyName).not.toContain('Morning Gone');
    expect(everyName).not.toContain('Cross Midnight');
  });

  it('the rail lists every channel still carrying something, https marks only', () => {
    const rows = [
      a({ showName: 'Show A', airstamp: '2026-08-15T20:00:00Z', network: 'Alpha', networkLogoUrl: 'https://cdn.example/a.png', match: 90, matchPersonalized: true }),
      a({ showName: 'Show B', airstamp: '2026-08-15T21:00:00Z', network: 'Beta', networkLogoUrl: 'http://cdn.example/b.png' }),
      a({ showName: 'Show C', airstamp: '2026-08-15T22:00:00Z', network: 'Beta' }),
      a({ showName: 'Done Show', airstamp: '2026-08-15T10:00:00Z', network: 'Gone' }),
    ];
    const b = selectCaseBriefing(rows, NOW, NY, { personalized: true });
    expect(b.channels.map((c) => c.name)).toEqual(['Alpha', 'Beta']);
    expect(b.channels[0]).toMatchObject({ logoUrl: 'https://cdn.example/a.png', count: 1, yours: true });
    expect(b.channels[1]).toMatchObject({ logoUrl: null, count: 2, yours: false });
  });

  it('a HIGH but objective-only score never makes a channel "yours"', () => {
    /* The rail said "yours" for any channel carrying a score above neutral,
       which — like the badge — read an account-level fact as personal signal.
       A 95 that nothing about this user produced is still not theirs. */
    const rows = [
      a({ showName: 'Show A', airstamp: '2026-08-15T20:00:00Z', network: 'Alpha', match: 95, matchPersonalized: false }),
    ];
    const b = selectCaseBriefing(rows, NOW, NY, { personalized: true });
    expect(b.channels[0]).toMatchObject({ name: 'Alpha', yours: false });
  });

  it('a channel filter narrows the sections but never the rail', () => {
    const b = selectCaseBriefing(day(), NOW, NY, { channel: 'TCM', personalized: true });
    expect(b.channel).toBe('TCM');
    expect(b.poolCount).toBe(2);
    expect(b.moviesOnTheDocket.map((x) => x.showName)).toEqual(['Lead Feature', 'Late Movie']);
    expect(b.liveAndSports).toEqual([]);
    expect(b.leadCase?.showName).toBe('Lead Feature');
    expect(b.channels.length).toBeGreaterThan(2);
    // An unknown channel is an honest zero, not a silent fallback to everything.
    const empty = selectCaseBriefing(day(), NOW, NY, { channel: 'NoSuch', personalized: true });
    expect(empty.poolCount).toBe(0);
    expect(empty.leadCase).toBeNull();
    expect(empty.channels.length).toBeGreaterThan(2);
  });

  it('an East/West same-instant duplicate reads once in sections, twice on the rail', () => {
    const rows = [
      a({ showName: 'Same Movie', airstamp: '2026-08-16T00:00:00Z', runtime: 120, showType: 'Movie', network: 'FMC East' }),
      a({ showName: 'Same Movie', airstamp: '2026-08-16T00:00:00Z', runtime: 120, showType: 'Movie', network: 'FMC West' }),
    ];
    const b = selectCaseBriefing(rows, NOW, NY, { personalized: false });
    expect(b.moviesOnTheDocket).toHaveLength(1);
    expect(b.channels.map((c) => c.name).sort()).toEqual(['FMC East', 'FMC West']);
  });

  it('exports the documented fallback zone', () => {
    expect(DEFAULT_BRIEFING_TZ).toBe('America/New_York');
    expect(dayKeyIn(NOW, DEFAULT_BRIEFING_TZ)).toBe('2026-08-15');
  });
});

/**
 * THE EPISODE FLOOD — the second half of the P0.
 *
 * The briefing gave separate personalized slots to separate EPISODES of one
 * series: three Golden Girls airings became the Lead Case and two Top Cases,
 * because `dedupe` keyed on `airstamp|showName` (so the same series at
 * different times survived intact) and the used-set keyed on `a.id` (the
 * TVmaze EPISODE id, different for every episode). `applyScores` spreads one
 * title's score across every airing of it, so all three carried the same
 * number and sorted adjacently — one series occupying the whole front page.
 */
describe('personalized editorial sections hold one slot per TITLE', () => {
  const GG = { showName: 'The Golden Girls', tmdbId: 1552, mediaType: 'tv' as const, genres: ['Comedy'], match: 83, matchPersonalized: true };

  it('three episodes of one series occupy exactly one editorial slot', () => {
    const b = selectCaseBriefing(
      [
        a({ ...GG, airstamp: '2026-08-15T19:00:00Z', network: 'Hallmark' }),
        a({ ...GG, airstamp: '2026-08-15T19:30:00Z', network: 'Hallmark' }),
        a({ ...GG, airstamp: '2026-08-15T20:00:00Z', network: 'Hallmark' }),
        a({ showName: 'Matlock', airstamp: '2026-08-15T21:00:00Z', tmdbId: 900, mediaType: 'tv', match: 70, matchPersonalized: true }),
      ],
      NOW,
      NY,
      { personalized: true },
    );
    const editorial = [b.leadCase, ...b.topCases, ...b.worthWatching, b.wildcard].filter(Boolean) as Airing[];
    const golden = editorial.filter((x) => x.showName === 'The Golden Girls');
    expect(golden.length, 'one series, one personalized slot').toBe(1);
  });

  it('the representative airing is the one ON NOW when a title has one', () => {
    const b = selectCaseBriefing(
      [
        a({ ...GG, airstamp: '2026-08-15T21:00:00Z', network: 'Later' }),
        // Started 30m ago, 60m runtime → on now at 18:00Z.
        a({ ...GG, airstamp: '2026-08-15T17:30:00Z', network: 'OnNow' }),
      ],
      NOW,
      NY,
      { personalized: true },
    );
    expect(b.leadCase?.network).toBe('OnNow');
  });

  it('otherwise it is the EARLIEST still-upcoming airing', () => {
    const b = selectCaseBriefing(
      [
        a({ ...GG, airstamp: '2026-08-15T23:00:00Z', network: 'Late' }),
        a({ ...GG, airstamp: '2026-08-15T20:00:00Z', network: 'Early' }),
        a({ ...GG, airstamp: '2026-08-15T21:30:00Z', network: 'Middle' }),
      ],
      NOW,
      NY,
      { personalized: true },
    );
    expect(b.leadCase?.network).toBe('Early');
  });

  it('the deduped title keeps its title-level score unchanged', () => {
    const b = selectCaseBriefing(
      [
        a({ ...GG, airstamp: '2026-08-15T20:00:00Z' }),
        a({ ...GG, airstamp: '2026-08-15T21:00:00Z' }),
      ],
      NOW,
      NY,
      { personalized: true },
    );
    expect(b.leadCase?.match).toBe(83);
  });

  it('two DIFFERENT series still get their own slots', () => {
    const b = selectCaseBriefing(
      [
        a({ ...GG, airstamp: '2026-08-15T20:00:00Z' }),
        a({ showName: 'Matlock', airstamp: '2026-08-15T20:00:00Z', tmdbId: 900, mediaType: 'tv', match: 78, matchPersonalized: true }),
      ],
      NOW,
      NY,
      { personalized: true },
    );
    const editorial = [b.leadCase, ...b.topCases].filter(Boolean) as Airing[];
    expect(editorial.map((x) => x.showName).sort()).toEqual(['Matlock', 'The Golden Girls']);
  });

  it('unresolved titles fall back to the show name, so the flood is still capped', () => {
    // No tmdbId anywhere — the identity has to come from the name alone.
    const b = selectCaseBriefing(
      [
        a({ showName: 'The Golden Girls', airstamp: '2026-08-15T20:00:00Z', match: 83, matchPersonalized: true }),
        a({ showName: 'the golden girls', airstamp: '2026-08-15T20:30:00Z', match: 83, matchPersonalized: true }),
      ],
      NOW,
      NY,
      { personalized: true },
    );
    const editorial = [b.leadCase, ...b.topCases, ...b.worthWatching].filter(Boolean) as Airing[];
    expect(editorial.filter((x) => x.showName.toLowerCase() === 'the golden girls').length).toBe(1);
  });

  it('SCHEDULE sections still show individual airings — airing truth is useful there', () => {
    const b = selectCaseBriefing(
      [
        a({ ...GG, airstamp: '2026-08-15T23:30:00Z', network: 'A' }),
        a({ ...GG, airstamp: '2026-08-16T00:30:00Z', network: 'A' }),
      ],
      NOW,
      NY,
      { personalized: true },
    );
    // 19:30 and 20:30 local — both inside Tonight's Docket, both real broadcasts.
    expect(b.tonightsDocket.length).toBe(2);
  });
});
