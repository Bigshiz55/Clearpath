import { describe, it, expect } from 'vitest';
import {
  stationsFrom, programmeKeyFor, buildProgrammeRow, toFetchedAiring,
} from './tvMediaIngest';
import type { ScheduleListing } from '../schedule';

function listing(over: Partial<ScheduleListing> = {}): ScheduleListing {
  return {
    listingId: 'tvmedia|WABC|2026-08-02T20:00:00.000Z|123',
    channelId: 'WABC',
    channelName: 'ABC 7',
    channelNumber: '7',
    startUtc: '2026-08-02T20:00:00.000Z',
    endUtc: '2026-08-02T21:00:00.000Z',
    title: 'Evening News',
    contentType: 'news',
    genres: ['News'],
    programId: '123',
    ...over,
  };
}

describe('stationsFrom', () => {
  it('discovers one station per distinct channel id, first-seen name wins', () => {
    const out = stationsFrom([
      listing(),
      listing({ listingId: 'a2', channelId: 'WABC', startUtc: '2026-08-02T21:00:00.000Z' }),
      listing({ listingId: 'b1', channelId: 'WNBC', channelName: 'NBC 4', channelNumber: '4' }),
    ]);
    expect(out).toHaveLength(2);
    expect(out.map((s) => s.key).sort()).toEqual(['WABC', 'WNBC']);
    expect(out.find((s) => s.key === 'WNBC')).toEqual({ key: 'WNBC', displayName: 'NBC 4', channelNumber: '4' });
  });

  it('returns an empty list for an empty fetch, never throwing', () => {
    expect(stationsFrom([])).toEqual([]);
  });
});

describe('programmeKeyFor', () => {
  it('uses the provider programId when present', () => {
    expect(programmeKeyFor(listing({ programId: '999' }))).toBe('999');
  });

  it('falls back to a title/season/episode composite when programId is absent, matching schedule.ts dedupeKey', () => {
    const key = programmeKeyFor(listing({
      programId: null, title: 'Mystery Hour', seasonNumber: 2, episodeNumber: 5, episodeTitle: 'The Clue',
    }));
    expect(key).toBe('mystery hour~2~5~the clue');
  });

  it('distinguishes two programmes with the same title but different episodes', () => {
    const a = programmeKeyFor(listing({ programId: null, title: 'Show', seasonNumber: 1, episodeNumber: 1 }));
    const b = programmeKeyFor(listing({ programId: null, title: 'Show', seasonNumber: 1, episodeNumber: 2 }));
    expect(a).not.toBe(b);
  });
});

describe('buildProgrammeRow', () => {
  it('maps a listing to a programme row, deriving runtime from start/end', () => {
    const row = buildProgrammeRow(listing());
    expect(row).toMatchObject({
      providerProgrammeId: '123', title: 'Evening News', programmeType: 'news',
      genres: ['News'], runtimeMinutes: 60,
    });
  });

  it('leaves runtime null rather than inventing one when there is no end time', () => {
    const row = buildProgrammeRow(listing({ endUtc: null }));
    expect(row.runtimeMinutes).toBeNull();
  });

  it('defaults programmeType to "other" when the adapter left contentType unset', () => {
    const row = buildProgrammeRow(listing({ contentType: undefined }));
    expect(row.programmeType).toBe('other');
  });
});

describe('toFetchedAiring', () => {
  it('carries the listing straight through with the listingId as providerAiringId', () => {
    const fa = toFetchedAiring(listing(), 'station-uuid', 'programme-uuid');
    expect(fa.providerAiringId).toBe('tvmedia|WABC|2026-08-02T20:00:00.000Z|123');
    expect(fa.stationId).toBe('station-uuid');
    expect(fa.programmeId).toBe('programme-uuid');
    expect(fa.startAtUtc).toBe('2026-08-02T20:00:00.000Z');
    expect(fa.endAtUtc).toBe('2026-08-02T21:00:00.000Z');
  });

  it('produces the same rawHash for an identical listing and a different one for a changed field', () => {
    const a = toFetchedAiring(listing(), 's', 'p');
    const b = toFetchedAiring(listing(), 's', 'p');
    const c = toFetchedAiring(listing({ title: 'Different Title' }), 's', 'p');
    expect(a.rawHash).toBe(b.rawHash);
    expect(a.rawHash).not.toBe(c.rawHash);
  });

  it('carries isNew/isLive through when the provider set them', () => {
    const fa = toFetchedAiring(listing({ isNew: true, isLive: true }), 's', 'p');
    expect(fa.isNew).toBe(true);
    expect(fa.isLive).toBe(true);
  });
});
