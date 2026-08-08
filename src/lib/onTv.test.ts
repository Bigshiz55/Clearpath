import { describe, it, expect } from 'vitest';
import { usBroadcastDate, selectUpcomingAirings, type Airing } from './onTv';

/**
 * usBroadcastDate — the calendar-day key used to fetch TVmaze's US broadcast
 * schedule. Reproduces and guards the bug this pass found: the old
 * implementation used the SERVER's UTC calendar day, so every US viewer west
 * of Eastern got TOMORROW's schedule for a multi-hour window every evening
 * (from as early as ~4pm Pacific), while the page's own "Today" header
 * (correctly computed from the viewer's real local clock) never agreed with
 * the data underneath it.
 */
describe('usBroadcastDate', () => {
  it('stays on the current US evening even once it is already tomorrow in UTC', () => {
    // 11:00 PM US Eastern (EDT, UTC-4) on July 15 == 3:00 AM UTC July 16.
    // The OLD `date.getUTCDate()`-based key would have returned "2026-07-16"
    // here — tomorrow's schedule, while it is still Tuesday night on the
    // whole US mainland (Eastern *and* every zone west of it).
    const elevenPmEasternJuly15 = Date.parse('2026-07-16T03:00:00.000Z');
    expect(usBroadcastDate(elevenPmEasternJuly15)).toBe('2026-07-15');
  });

  it('matches the exact real-world failure case: 8pm Pacific reads as tomorrow in UTC', () => {
    // 8:00 PM Pacific (PDT, UTC-7) on July 15 == 3:00 AM UTC July 16 — the
    // start of PRIMETIME on the West Coast, the single most important part
    // of the day for this feature, and the old bug's failure window started
    // even earlier (~4-5pm Pacific).
    const eightPmPacificJuly15 = Date.parse('2026-07-16T03:00:00.000Z');
    expect(usBroadcastDate(eightPmPacificJuly15)).toBe('2026-07-15');
  });

  it('agrees with naive UTC on an unambiguous mid-morning instant', () => {
    // Noon UTC is early morning across the whole continental US — well
    // before any rollover ambiguity — so both the old and new
    // implementations should trivially agree here. A sanity check, not a
    // regression case.
    const noonUtcJuly15 = Date.parse('2026-07-15T12:00:00.000Z');
    expect(usBroadcastDate(noonUtcJuly15)).toBe('2026-07-15');
  });

  it('rolls over exactly at US Eastern midnight, not UTC midnight', () => {
    // 11:59 PM Eastern (EDT) July 15 is still the 15th; one minute later, at
    // 12:00 AM Eastern July 16, it must become the 16th. Both instants are
    // on the SAME UTC calendar day's early hours (July 16, 03:59 and 04:00
    // UTC) — a UTC-based key would get both right by accident here, but a
    // fixed-offset (non-DST-aware) Eastern approximation could get this
    // wrong depending on the date; Intl with a real IANA zone must not.
    const before = Date.parse('2026-07-16T03:59:00.000Z'); // 11:59 PM EDT July 15
    const after = Date.parse('2026-07-16T04:00:00.000Z'); // 12:00 AM EDT July 16
    expect(usBroadcastDate(before)).toBe('2026-07-15');
    expect(usBroadcastDate(after)).toBe('2026-07-16');
  });

  it('handles the November DST fall-back boundary correctly (real IANA zone, not a fixed offset)', () => {
    // 2026-11-01 02:00 US Eastern is when EDT (UTC-4) falls back to EST
    // (UTC-5). A fixed "always UTC-4" or "always UTC-5" offset would
    // mis-key one side of this transition; Intl.DateTimeFormat with
    // 'America/New_York' resolves DST correctly by construction.
    const beforeFallBack = Date.parse('2026-11-01T05:30:00.000Z'); // 1:30 AM EDT (still Nov 1)
    const afterFallBack = Date.parse('2026-11-01T07:30:00.000Z'); // 2:30 AM EST (still Nov 1)
    expect(usBroadcastDate(beforeFallBack)).toBe('2026-11-01');
    expect(usBroadcastDate(afterFallBack)).toBe('2026-11-01');
  });
});

/**
 * selectUpcomingAirings — the SHARED pure selector behind both `getUpcomingTv`
 * (live TVmaze fetch) and `getUpcomingTvIngested` (the canonical ingested
 * tables). These fixtures are in-memory `Airing[]` (no DB, no network), so they
 * exercise exactly the filter/rank/dedupe/order behavior the ingested-backed
 * reader inherits verbatim — genre, network, movieOnly, NOISE_TYPES exclusion,
 * showId dedupe, and final time ordering.
 */
describe('selectUpcomingAirings (shared live + ingested reader)', () => {
  const NOW = Date.parse('2026-08-04T18:00:00.000Z');
  const H = 60 * 60 * 1000;

  function airing(over: Partial<Airing>): Airing {
    return {
      id: Math.floor(Math.random() * 1e9),
      time: '20:00',
      minutes: 20 * 60,
      airstamp: new Date(NOW + 1 * H).toISOString(),
      runtime: 60,
      network: 'AMC',
      showName: 'A Show',
      showId: Math.floor(Math.random() * 1e9),
      episodeName: null,
      season: null,
      number: null,
      showType: 'Scripted',
      genres: ['Drama'],
      rating: 8,
      image: null,
      summary: null,
      imdb: null,
      ...over,
    };
  }

  it('excludes airings before now and beyond the horizon', () => {
    const past = airing({ showId: 1, airstamp: new Date(NOW - 1 * H).toISOString() });
    const soon = airing({ showId: 2, airstamp: new Date(NOW + 2 * H).toISOString() });
    const tooFar = airing({ showId: 3, airstamp: new Date(NOW + 60 * H).toISOString() }); // past the 48h cap
    const out = selectUpcomingAirings([past, soon, tooFar], NOW);
    expect(out.map((a) => a.showId)).toEqual([2]);
  });

  it('drops News / Talk Show / Variety noise types', () => {
    const news = airing({ showId: 1, showType: 'News' });
    const talk = airing({ showId: 2, showType: 'Talk Show' });
    const variety = airing({ showId: 3, showType: 'Variety' });
    const scripted = airing({ showId: 4, showType: 'Scripted' });
    const out = selectUpcomingAirings([news, talk, variety, scripted], NOW);
    expect(out.map((a) => a.showId)).toEqual([4]);
  });

  it('filters by genre (case-insensitive, exact tag match)', () => {
    const comedy = airing({ showId: 1, genres: ['Comedy'] });
    const drama = airing({ showId: 2, genres: ['Drama'] });
    const out = selectUpcomingAirings([comedy, drama], NOW, undefined, 'comedy');
    expect(out.map((a) => a.showId)).toEqual([1]);
  });

  it('filters by network (case-insensitive substring)', () => {
    const life = airing({ showId: 1, network: 'Lifetime' });
    const amc = airing({ showId: 2, network: 'AMC' });
    const out = selectUpcomingAirings([life, amc], NOW, undefined, null, 'lifetime');
    expect(out.map((a) => a.showId)).toEqual([1]);
  });

  it('filters to movies only when movieOnly is set', () => {
    const movie = airing({ showId: 1, showType: 'Movie' });
    const series = airing({ showId: 2, showType: 'Scripted' });
    const out = selectUpcomingAirings([movie, series], NOW, undefined, null, null, true);
    expect(out.map((a) => a.showId)).toEqual([1]);
  });

  it('dedupes by showId, keeping the higher-rated instance', () => {
    const lowRated = airing({ id: 100, showId: 42, rating: 5, airstamp: new Date(NOW + 1 * H).toISOString() });
    const highRated = airing({ id: 200, showId: 42, rating: 9, airstamp: new Date(NOW + 3 * H).toISOString() });
    const out = selectUpcomingAirings([lowRated, highRated], NOW);
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe(200); // the 9-rated instance survives the dedupe
  });

  it('returns the surviving set in ascending airstamp (time) order', () => {
    const later = airing({ showId: 1, rating: 9, airstamp: new Date(NOW + 5 * H).toISOString() });
    const earlier = airing({ showId: 2, rating: 6, airstamp: new Date(NOW + 1 * H).toISOString() });
    const middle = airing({ showId: 3, rating: 7, airstamp: new Date(NOW + 3 * H).toISOString() });
    const out = selectUpcomingAirings([later, earlier, middle], NOW);
    expect(out.map((a) => a.showId)).toEqual([2, 3, 1]); // time order, not rating order
  });
});
