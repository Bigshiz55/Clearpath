/**
 * THE GUIDE READ MUST NOT TRUNCATE AWAY THE FORWARD AIRINGS IT EXISTS TO SHOW.
 *
 * Production rendered an EMPTY grid over a full database (2026-08-22): the
 * reader used a single `.limit(1000)` ascending, so on a lineup with >1000
 * airings in the window it returned the OLDEST 1000 — all in the past — and
 * buildChannelGuide's on-now/up-next rule dropped every channel. These pin the
 * paged read (all forward airings come back) and the never-empty fallback
 * (real upcoming programming when the immediate window is bare), against a
 * mock Supabase that reproduces the >1000-row shape.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/monitoring', () => ({ recordReliabilityEvent: vi.fn() }));

import { getIngestedGuideAirings, getGuideAiringsWithFallback } from './ingestedGuide';
import { recordReliabilityEvent } from '@/lib/monitoring';

type Row = { station_id: string; programme_id: string; start_at_utc: string; last_seen_at: string | null };

/**
 * A fake tv_airings the query builder pages through. `rows` is the whole
 * table; the builder applies gte/lt/range exactly like PostgREST (range is a
 * hard per-request slice, capped at 1000 like the real cap).
 */
function fakeSupabase(rows: Row[], stations: Record<string, string>, programmes: Record<string, string>) {
  return {
    from(table: string) {
      if (table === 'tv_airings') {
        let lo = -Infinity;
        let hi = Infinity;
        const b: any = {
          select() { return b; },
          gte(_c: string, v: string) { lo = Date.parse(v); return b; },
          lt(_c: string, v: string) { hi = Date.parse(v); return b; },
          order() { return b; },
          range(from: number, to: number) {
            const inWindow = rows
              .filter((r) => { const t = Date.parse(r.start_at_utc); return t >= lo && t < hi; })
              .sort((a, c) => a.start_at_utc.localeCompare(c.start_at_utc));
            const span = Math.min(to - from + 1, 1000); // PostgREST 1000-row cap
            return Promise.resolve({ data: inWindow.slice(from, from + span), error: null });
          },
        };
        return b;
      }
      // tv_stations / tv_programmes hydration: .select().in('id', ids)
      const map = table === 'tv_stations' ? stations : programmes;
      return {
        select() { return this; },
        in(_c: string, ids: string[]) {
          const data =
            table === 'tv_stations'
              ? ids.filter((id) => map[id]).map((id) => ({ id, name: map[id], logo_url: null }))
              : ids.filter((id) => map[id]).map((id) => ({
                  id, provider_id: id, title: map[id], episode_title: null, programme_type: 'series',
                  season_number: null, episode_number: null, genres: [], description: null,
                  runtime_minutes: 60, artwork_url: null,
                }));
          return Promise.resolve({ data, error: null });
        },
      };
    },
  } as any;
}

const NOW = Date.parse('2026-08-22T18:00:00.000Z');

/** N airings evenly spread from `startOffsetH` to `endOffsetH` hours from NOW. */
function spread(n: number, startOffsetH: number, endOffsetH: number): Row[] {
  const out: Row[] = [];
  for (let i = 0; i < n; i++) {
    const frac = n === 1 ? 0 : i / (n - 1);
    const ms = NOW + (startOffsetH + frac * (endOffsetH - startOffsetH)) * 3600_000;
    out.push({
      station_id: `st${i % 40}`,
      programme_id: `pr${i}`,
      start_at_utc: new Date(ms).toISOString(),
      last_seen_at: '2026-08-22T12:00:00.000Z',
    });
  }
  return out;
}

const stationNames = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`st${i}`, `Channel ${i}`]));

describe('getIngestedGuideAirings pages past the 1000-row cap', () => {
  it('returns FORWARD airings that a single .limit(1000) would have truncated away', async () => {
    // 1500 past airings (now-6h..now) BEFORE 300 forward ones — a single
    // ascending page of 1000 is entirely past; the forward 300 need paging.
    const rows = [...spread(1500, -6, -0.01), ...spread(300, 0.1, 5.5)];
    const progNames = Object.fromEntries(rows.map((r) => [r.programme_id, `Show ${r.programme_id}`]));
    const supabase = fakeSupabase(rows, stationNames, progNames);
    const airings = await getIngestedGuideAirings(supabase, NOW, 6 * 3600_000);
    const forward = airings.filter((a) => Date.parse(a.airstamp!) > NOW);
    expect(airings.length).toBe(1800);
    expect(forward.length).toBe(300); // every forward airing survived
  });

  it('records guide_empty when the window genuinely has no rows', async () => {
    vi.mocked(recordReliabilityEvent).mockClear();
    const supabase = fakeSupabase([], stationNames, {});
    const airings = await getIngestedGuideAirings(supabase, NOW, 6 * 3600_000);
    expect(airings).toEqual([]);
    expect(recordReliabilityEvent).toHaveBeenCalledWith('guide_empty', expect.anything());
  });
});

describe('getGuideAiringsWithFallback never returns empty while real data exists', () => {
  it('source=fresh when the immediate window has airings', async () => {
    const rows = spread(50, -1, 5);
    const progNames = Object.fromEntries(rows.map((r) => [r.programme_id, `Show ${r.programme_id}`]));
    const r = await getGuideAiringsWithFallback(fakeSupabase(rows, stationNames, progNames), NOW, 6 * 3600_000);
    expect(r.source).toBe('fresh');
    expect(r.airings.length).toBe(50);
    expect(r.asOfMs).toBe(Date.parse('2026-08-22T12:00:00.000Z'));
  });

  it('source=widened using REAL upcoming airings when the immediate window is empty', async () => {
    // Nothing in the next 6h; real programming 20–40h out.
    const rows = spread(30, 20, 40);
    const progNames = Object.fromEntries(rows.map((r) => [r.programme_id, `Show ${r.programme_id}`]));
    const r = await getGuideAiringsWithFallback(fakeSupabase(rows, stationNames, progNames), NOW, 6 * 3600_000);
    expect(r.source).toBe('widened');
    expect(r.airings.length).toBe(30);
  });

  it('source=none only when the database truly has no stored airings (no fabrication)', async () => {
    const r = await getGuideAiringsWithFallback(fakeSupabase([], stationNames, {}), NOW, 6 * 3600_000);
    expect(r).toEqual({ airings: [], source: 'none', asOfMs: null });
  });
});
