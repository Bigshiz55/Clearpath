import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * RELIABILITY SPRINT — item 9. `recordReliabilityEvent` is the one write
 * path every operational failure in the app funnels through, so it must:
 * (a) never throw, even when the insert itself fails; (b) drop any prop
 * that isn't a short primitive, since a raw error message or search query
 * would otherwise leak into `analytics_events`. `getReliabilitySummary`
 * powers the /dev/reliability dashboard and must count real rows correctly
 * and flag when the row cap was hit.
 */

const insertMock = vi.fn((_payload: { user_id: string | null; name: string; props: Record<string, unknown> }) =>
  Promise.resolve({ error: null }),
);
const summaryRows: Array<{ name: string }> = [];
const selectChain = {
  in: vi.fn(() => selectChain),
  gte: vi.fn(() => selectChain),
  order: vi.fn(() => selectChain),
  limit: vi.fn(async () => ({ data: summaryRows })),
};

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (_table: string) => ({
      insert: insertMock,
      select: () => selectChain,
    }),
  }),
}));

import { recordReliabilityEvent, getReliabilitySummary } from '@/lib/monitoring';

beforeEach(() => {
  insertMock.mockClear();
  summaryRows.length = 0;
});

describe('recordReliabilityEvent', () => {
  it('writes name, userId, and sanitized props', async () => {
    await recordReliabilityEvent('not_found', { path: '/nope' }, 'user-1');
    expect(insertMock).toHaveBeenCalledWith({
      user_id: 'user-1',
      name: 'not_found',
      props: { path: '/nope' },
    });
  });

  it('drops string props over the length cap instead of truncating', async () => {
    const longString = 'x'.repeat(200);
    await recordReliabilityEvent('js_error', { name: 'TypeError', message: longString });
    const call = insertMock.mock.calls[0]![0] as { props: Record<string, unknown> };
    expect(call.props).toEqual({ name: 'TypeError' });
    expect(call.props.message).toBeUndefined();
  });

  it('keeps numbers, booleans, and null; caps at 12 props', async () => {
    const props: Record<string, string | number | boolean | null> = {};
    for (let i = 0; i < 20; i++) props[`k${i}`] = i;
    await recordReliabilityEvent('api_failure', props);
    const call = insertMock.mock.calls[0]![0] as { props: Record<string, unknown> };
    expect(Object.keys(call.props)).toHaveLength(12);
  });

  it('never throws when the insert itself rejects', async () => {
    insertMock.mockImplementationOnce(() => Promise.reject(new Error('db down')));
    await expect(recordReliabilityEvent('pack_timeout', {})).resolves.toBeUndefined();
  });
});

describe('getReliabilitySummary', () => {
  it('counts rows per event name and reports total', async () => {
    summaryRows.push({ name: 'not_found' }, { name: 'not_found' }, { name: 'js_error' });
    const summary = await getReliabilitySummary(24);
    expect(summary.total).toBe(3);
    expect(summary.byName.find((r) => r.name === 'not_found')?.count).toBe(2);
    expect(summary.byName.find((r) => r.name === 'js_error')?.count).toBe(1);
    expect(summary.byName.find((r) => r.name === 'api_failure')?.count).toBe(0);
    expect(summary.truncated).toBe(false);
  });

  it('flags truncated when the row cap is hit', async () => {
    for (let i = 0; i < 5000; i++) summaryRows.push({ name: 'api_failure' });
    const summary = await getReliabilitySummary(24);
    expect(summary.truncated).toBe(true);
  });

  it('returns all-zero counts with no rows rather than an empty list', async () => {
    const summary = await getReliabilitySummary(24);
    expect(summary.total).toBe(0);
    expect(summary.byName.length).toBeGreaterThan(0);
    expect(summary.byName.every((r) => r.count === 0)).toBe(true);
  });
});
