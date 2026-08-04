import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * RELIABILITY SPRINT — a title with no watchmode_fetch_state row (the common
 * case: the sync job only advances ~50 titles/day from a fixed candidate
 * pool, so most titles are never even queued) must report an honest,
 * terminal "unconfirmed" status — never a status implying an active check
 * is underway, since for most titles no such check will ever run.
 */

let fetchStateRow: unknown = null;
let availabilityRows: unknown[] = [];

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => {
    const builder: Record<string, unknown> = {};
    let currentTable = '';
    Object.assign(builder, {
      select: () => builder,
      eq: () => builder,
      maybeSingle: () => Promise.resolve({ data: fetchStateRow, error: null }),
      then: (res: (v: unknown) => void) =>
        Promise.resolve({ data: currentTable === 'watchmode_availability' ? availabilityRows : [], error: null }).then(res),
    });
    return {
      from(table: string) {
        currentTable = table;
        return builder;
      },
    };
  },
}));

describe('getCardAvailability', () => {
  beforeEach(() => {
    fetchStateRow = null;
    availabilityRows = [];
  });

  it('no fetch_state row → "unconfirmed", never a status implying an in-progress check', async () => {
    const { getCardAvailability } = await import('./cardAvailability');
    const result = await getCardAvailability('movie', 1, 'US');
    expect(result.status).toBe('unconfirmed');
    expect(result.sources).toEqual([]);
    expect(result.checkedAt).toBeNull();
  });

  it('fetch_state row exists, zero sources → "none" (a real, checked result)', async () => {
    fetchStateRow = { last_fetched_at: '2026-01-01T00:00:00Z' };
    availabilityRows = [];
    const { getCardAvailability } = await import('./cardAvailability');
    const result = await getCardAvailability('movie', 2, 'US');
    expect(result.status).toBe('none');
    expect(result.checkedAt).toBe('2026-01-01T00:00:00Z');
  });

  it('fetch_state row exists, sources present → "available"', async () => {
    fetchStateRow = { last_fetched_at: '2026-01-01T00:00:00Z' };
    availabilityRows = [{ source_name: 'Netflix', source_type: 'subscription', deeplink: null }];
    const { getCardAvailability } = await import('./cardAvailability');
    const result = await getCardAvailability('tv', 3, 'US');
    expect(result.status).toBe('available');
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]!.name).toBe('Netflix');
  });
});
