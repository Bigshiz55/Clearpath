import { describe, it, expect } from 'vitest';
import { ingestedRowToAiring, type IngestedAiringRow } from './ingestedGuide';

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
