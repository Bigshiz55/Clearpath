import { describe, it, expect } from 'vitest';
import { ingestedRowToAiring, selectTodayAirings, INGESTED_MIN, type IngestedAiringRow } from './ingestedGuide';
import type { Airing } from '@/lib/onTv';

function row(over: Partial<IngestedAiringRow>): IngestedAiringRow {
  return {
    startAtUtc: '2026-08-04T21:00:00.000Z', // 5:00 PM Eastern
    providerAiringId: 'tvmaze:123:2026-08-04',
    stationName: 'Lifetime',
    programmeProviderId: '456',
    title: 'Dr. Pimple Popper: Breaking Out',
    episodeTitle: null,
    programmeType: 'series',
    seasonNumber: 3,
    episodeNumber: 5,
    genres: ['Reality'],
    description: 'A dermatologist treats patients.',
    runtimeMinutes: 60,
    artworkUrl: 'https://static.tvmaze.com/uploads/images/original_untouched/x.jpg',
    ...over,
  };
}

describe('ingestedRowToAiring', () => {
  it('maps a real ingested row to the same Airing shape the live TVmaze fetch produces', () => {
    const a = ingestedRowToAiring(row({}));
    expect(a.network).toBe('Lifetime');
    expect(a.showName).toBe('Dr. Pimple Popper: Breaking Out');
    expect(a.season).toBe(3);
    expect(a.number).toBe(5);
    expect(a.genres).toEqual(['Reality']);
    expect(a.runtime).toBe(60);
    expect(a.summary).toBe('A dermatologist treats patients.');
    expect(a.image).toContain('tvmaze.com');
    expect(a.airstamp).toBe('2026-08-04T21:00:00.000Z');
  });

  it('never fabricates fields the ingest schema does not capture', () => {
    const a = ingestedRowToAiring(row({}));
    expect(a.rating).toBeNull();
    expect(a.imdb).toBeNull();
  });

  it('converts UTC to a network-local (Eastern) HH:MM and minutes-past-midnight', () => {
    // 21:00 UTC in August (EDT, UTC-4) is 17:00 Eastern.
    const a = ingestedRowToAiring(row({ startAtUtc: '2026-08-04T21:00:00.000Z' }));
    expect(a.time).toBe('17:00');
    expect(a.minutes).toBe(17 * 60);
  });

  it('maps the ingest programme_type vocabulary to the live-fetch showType vocabulary', () => {
    expect(ingestedRowToAiring(row({ programmeType: 'movie' })).showType).toBe('Movie');
    expect(ingestedRowToAiring(row({ programmeType: 'series' })).showType).toBe('Scripted');
    expect(ingestedRowToAiring(row({ programmeType: 'news' })).showType).toBe('News');
    expect(ingestedRowToAiring(row({ programmeType: 'sports' })).showType).toBe('Sports');
    expect(ingestedRowToAiring(row({ programmeType: 'kids' })).showType).toBe('Kids');
    // An unrecognized value degrades to a safe label rather than throwing.
    expect(ingestedRowToAiring(row({ programmeType: 'made_up' })).showType).toBe('Special');
  });

  it('derives a stable numeric id from provider_airing_id, so the same broadcast always gets the same id', () => {
    const a1 = ingestedRowToAiring(row({ providerAiringId: 'tvmaze:123:2026-08-04' }));
    const a2 = ingestedRowToAiring(row({ providerAiringId: 'tvmaze:123:2026-08-04' }));
    expect(a1.id).toBe(a2.id);
    expect(Number.isInteger(a1.id)).toBe(true);
    expect(a1.id).toBeGreaterThanOrEqual(0);
  });

  it('gives two different broadcast instances (a rerun of the same episode) different ids', () => {
    const first = ingestedRowToAiring(row({ providerAiringId: 'tvmaze:123:2026-08-04' }));
    const rerun = ingestedRowToAiring(row({ providerAiringId: 'tvmaze:123:2026-09-01' }));
    expect(first.id).not.toBe(rerun.id);
  });

  it('uses the real TVmaze show id (provider_programme_id) as showId when it parses as a number', () => {
    const a = ingestedRowToAiring(row({ programmeProviderId: '456' }));
    expect(a.showId).toBe(456);
  });

  it('falls back to a stable id when provider_airing_id is missing, without throwing', () => {
    const a = ingestedRowToAiring(row({ providerAiringId: null }));
    expect(Number.isInteger(a.id)).toBe(true);
  });
});

// selectTodayAirings is the pure core of `getOnTvTodayIngested` — it keeps only
// the airings on the SAME US-Eastern calendar day as `now` and orders them by
// time of day, exactly matching the live `getOnTvToday` contract that OnTvGuide
// (with its `{count} airings` total and now-&-next curation) depends on.
function airing(over: Partial<Airing> = {}): Airing {
  return {
    id: 1, time: '20:00', minutes: 1200, airstamp: '2026-08-07T20:00:00-04:00',
    runtime: 60, network: 'AMC', showName: 'Show', showId: 100, episodeName: null,
    season: null, number: null, showType: 'Scripted', genres: [], rating: null,
    image: null, summary: null, imdb: null,
    ...over,
  };
}

describe('selectTodayAirings — matches getOnTvToday (Eastern calendar day, all airings, time-ordered)', () => {
  // 2026-08-07 18:00 US-Eastern (EDT, -04:00) → "today" is 2026-08-07.
  const now = Date.parse('2026-08-07T18:00:00-04:00');

  it('keeps every airing on the Eastern day and drops the next day’s early-morning airings', () => {
    const rows = [
      airing({ id: 1, airstamp: '2026-08-07T20:00:00-04:00', minutes: 1200 }), // 8pm ET today
      airing({ id: 2, airstamp: '2026-08-07T01:00:00-04:00', minutes: 60 }),   // 1am ET today
      airing({ id: 3, airstamp: '2026-08-08T02:00:00-04:00', minutes: 120 }),  // 2am ET tomorrow → drop
    ];
    const out = selectTodayAirings(rows, now);
    expect(out.map((a) => a.id)).toEqual([2, 1]); // today only, time-ordered (1am before 8pm)
  });

  it('does NOT curate — it keeps news/talk and duplicate shows (unlike the upcoming selector)', () => {
    const rows = [
      airing({ id: 1, showType: 'News', airstamp: '2026-08-07T22:00:00-04:00', minutes: 1320 }),
      airing({ id: 2, showId: 100, airstamp: '2026-08-07T21:00:00-04:00', minutes: 1260 }),
      airing({ id: 3, showId: 100, airstamp: '2026-08-07T09:00:00-04:00', minutes: 540 }), // same show, kept
    ];
    const out = selectTodayAirings(rows, now);
    expect(out.map((a) => a.id)).toEqual([3, 2, 1]); // all three, time-ordered — no dedupe, no noise filter
  });

  it('is empty-safe and drops an airing whose airstamp is unparseable', () => {
    expect(selectTodayAirings([], now)).toEqual([]);
    const out = selectTodayAirings([airing({ id: 9, airstamp: 'not-a-date' })], now);
    expect(out).toEqual([]); // a NaN Eastern date never equals today's date string
  });
});

describe('INGESTED_MIN', () => {
  it('is the single shared fallback threshold both guide surfaces use', () => {
    expect(INGESTED_MIN).toBe(3);
  });
});
