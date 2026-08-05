import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchScheduleDay } from './tvmazeIngest';

/**
 * RELIABILITY SPRINT — item 6, Hallmark Universe must load without timing
 * out. The Pack page's own request runs a real TVmaze ingest inline (see
 * packRefresh.ts) when it wins the lazy-ingest race, and that ingest makes
 * many `fetch` calls through this module's `getJson`. Before this fix,
 * `getJson` had no timeout at all — a single hung TVmaze request could hang
 * the ingest, and therefore the visitor's own page load, indefinitely. This
 * proves a stalled request now aborts and resolves as an honest failure
 * instead of hanging forever.
 */
describe('TVmaze fetch calls are bounded — a stalled request fails fast instead of hanging forever', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('aborts a fetch that never resolves on its own, once the bounded timeout elapses', async () => {
    global.fetch = vi.fn((_url: unknown, init?: { signal?: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('The operation was aborted.');
          err.name = 'AbortError';
          reject(err);
        });
        // Deliberately never resolves on its own — simulates a hung request.
      });
    }) as unknown as typeof fetch;

    const resultPromise = fetchScheduleDay('2026-08-04');
    // Let every pending microtask/timer run, including the bounded timeout.
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.ok).toBe(false);
    expect(result.data).toBeNull();
  });

  it('a fetch that resolves well within the timeout is unaffected', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve([]),
      } as Response),
    ) as unknown as typeof fetch;

    const result = await fetchScheduleDay('2026-08-04');
    expect(result.ok).toBe(true);
    expect(result.data).toEqual([]);
  });
});
