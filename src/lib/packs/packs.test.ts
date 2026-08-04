import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getPackPreview, getPackPremiereCalendar } from './packs';
import type { Pack } from './types';

/**
 * RELIABILITY SPRINT — item 5 (TV date/time logic) and item 6 (Lifetime
 * Movie Vault duplicate listings).
 *
 * Item 5: `pack_premiere_calendar` rows carry `premiere_date`, a calendar
 * DAY (the UTC date of the earliest premiere airing), NOT an instant. A
 * premiere that already aired earlier today still has today's date, so
 * picking the query's first row by date order alone can surface something
 * that's already over. `getPackPreview` must pick the soonest premiere
 * whose real `start_at_utc` instant is still in the future.
 *
 * Item 6: `pack_premiere_calendar` is a view joined through `tv_airings`,
 * so it returns one row per (programme, is_premiere airing, station) — a
 * Pack whose channel group has sister stations (Lifetime, Lifetime Movie
 * Network, Great American Family) can have more than one `is_premiere`
 * airing for the same title, which showed the same movie twice in the
 * calendar. `getPackPremiereCalendar` must dedupe to one entry per
 * programme.
 */

interface PremiereRow {
  pack_id: string;
  programme_id: string;
  title: string;
  premiere_date: string;
  airing_id: string;
  station_id: string;
  start_at_utc: string;
}

function mockClient(rows: PremiereRow[]): SupabaseClient {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  Object.assign(builder, {
    select: chain,
    eq: chain,
    gte: chain,
    lte: chain,
    order: () => Promise.resolve({ data: rows, error: null }),
  });
  return { from: () => builder } as unknown as SupabaseClient;
}

const pack = (overrides: Partial<Pack> = {}): Pack => ({
  id: 'pack-1',
  slug: 'hallmark-universe',
  displayName: 'Hallmark Universe',
  description: null,
  isPremium: false,
  sortOrder: 1,
  premiereCalendar: true,
  caseTracking: false,
  personTracking: false,
  franchiseContinuity: false,
  completionStats: false,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('getPackPreview — "next premiere" is the soonest one that has not already aired', () => {
  it('skips a same-day premiere whose real airtime has already passed', async () => {
    const now = Date.now();
    const rows: PremiereRow[] = [
      {
        pack_id: 'pack-1',
        programme_id: 'p-morning',
        title: 'This Morning’s Premiere (already aired)',
        premiere_date: '2026-08-04',
        airing_id: 'a-1',
        station_id: 's-1',
        start_at_utc: new Date(now - 6 * 3_600_000).toISOString(), // 6h ago
      },
      {
        pack_id: 'pack-1',
        programme_id: 'p-tonight',
        title: 'Tonight’s Premiere',
        premiere_date: '2026-08-04',
        airing_id: 'a-2',
        station_id: 's-1',
        start_at_utc: new Date(now + 4 * 3_600_000).toISOString(), // 4h from now
      },
    ];
    const preview = await getPackPreview(mockClient(rows), pack(), null);
    expect(preview.nextPremiere?.title).toBe('Tonight’s Premiere');
  });

  it('picks the soonest future premiere even when the query returns them out of chronological order', async () => {
    const now = Date.now();
    const rows: PremiereRow[] = [
      {
        pack_id: 'pack-1',
        programme_id: 'p-later',
        title: 'Later This Week',
        premiere_date: '2026-08-08',
        airing_id: 'a-3',
        station_id: 's-1',
        start_at_utc: new Date(now + 4 * 86_400_000).toISOString(),
      },
      {
        pack_id: 'pack-1',
        programme_id: 'p-soon',
        title: 'Sooner',
        premiere_date: '2026-08-05',
        airing_id: 'a-4',
        station_id: 's-1',
        start_at_utc: new Date(now + 1 * 86_400_000).toISOString(),
      },
    ];
    const preview = await getPackPreview(mockClient(rows), pack(), null);
    expect(preview.nextPremiere?.title).toBe('Sooner');
  });

  it('returns null (never a stale claim) when every returned premiere has already aired', async () => {
    const now = Date.now();
    const rows: PremiereRow[] = [
      {
        pack_id: 'pack-1',
        programme_id: 'p-past',
        title: 'Already Aired',
        premiere_date: '2026-08-04',
        airing_id: 'a-5',
        station_id: 's-1',
        start_at_utc: new Date(now - 3_600_000).toISOString(),
      },
    ];
    const preview = await getPackPreview(mockClient(rows), pack(), null);
    expect(preview.nextPremiere).toBeNull();
  });

  it('is a no-op for a Pack without premiereCalendar enabled', async () => {
    const preview = await getPackPreview(mockClient([]), pack({ premiereCalendar: false }), null);
    expect(preview.nextPremiere).toBeNull();
  });
});

describe('getPackPremiereCalendar — one entry per programme, even when the same title premieres on sister stations', () => {
  it('collapses duplicate rows for the same programme into a single entry', async () => {
    const rows: PremiereRow[] = [
      {
        pack_id: 'pack-1',
        programme_id: 'movie-a',
        title: 'A Very Merry Match',
        premiere_date: '2026-08-04',
        airing_id: 'a-1',
        station_id: 'lifetime',
        start_at_utc: '2026-08-04T20:00:00Z',
      },
      {
        pack_id: 'pack-1',
        programme_id: 'movie-a',
        title: 'A Very Merry Match',
        premiere_date: '2026-08-04',
        airing_id: 'a-2',
        station_id: 'great-american-family',
        start_at_utc: '2026-08-04T22:00:00Z',
      },
    ];
    const entries = await getPackPremiereCalendar(mockClient(rows), 'pack-1', '2026-08-01', '2026-09-01');
    expect(entries).toHaveLength(1);
    expect(entries[0]!.programmeId).toBe('movie-a');
  });

  it('keeps the earliest airing when collapsing duplicates', async () => {
    const rows: PremiereRow[] = [
      {
        pack_id: 'pack-1',
        programme_id: 'movie-b',
        title: 'Second Airing',
        premiere_date: '2026-08-04',
        airing_id: 'a-3',
        station_id: 'lifetime-movie-network',
        start_at_utc: '2026-08-04T23:00:00Z',
      },
      {
        pack_id: 'pack-1',
        programme_id: 'movie-b',
        title: 'First Airing',
        premiere_date: '2026-08-04',
        airing_id: 'a-4',
        station_id: 'lifetime',
        start_at_utc: '2026-08-04T18:00:00Z',
      },
    ];
    const entries = await getPackPremiereCalendar(mockClient(rows), 'pack-1', '2026-08-01', '2026-09-01');
    expect(entries).toHaveLength(1);
    expect(entries[0]!.airingId).toBe('a-4');
  });

  it('does not merge across different programmes', async () => {
    const rows: PremiereRow[] = [
      {
        pack_id: 'pack-1',
        programme_id: 'movie-c',
        title: 'Movie C',
        premiere_date: '2026-08-04',
        airing_id: 'a-5',
        station_id: 'lifetime',
        start_at_utc: '2026-08-04T18:00:00Z',
      },
      {
        pack_id: 'pack-1',
        programme_id: 'movie-d',
        title: 'Movie D',
        premiere_date: '2026-08-05',
        airing_id: 'a-6',
        station_id: 'lifetime',
        start_at_utc: '2026-08-05T18:00:00Z',
      },
    ];
    const entries = await getPackPremiereCalendar(mockClient(rows), 'pack-1', '2026-08-01', '2026-09-01');
    expect(entries).toHaveLength(2);
  });
});
