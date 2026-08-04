import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The reliability beacon fired on a failed load makes its own network call
// (sendBeacon, or a fetch fallback in a jsdom-less test env) — mocked out so
// it can't be miscounted as a second call to the ratings endpoint below.
vi.mock('@/lib/monitoringClient', () => ({ reportReliabilityEvent: vi.fn() }));

/**
 * RELIABILITY SPRINT — a network hiccup must not permanently stick a card on
 * "Availability not currently confirmed" for the rest of the session.
 *
 * Bug this guards against: `loadTileFacts` cached the FULFILLED promise from
 * a failed fetch (via `.catch(() => EMPTY)`) forever, keyed by title. A
 * transient failure — offline for a moment, a dropped connection, a
 * non-2xx/non-JSON error page — got permanently remembered as "this title
 * has no facts," and no later mount of the same card (a re-render, scrolling
 * back into view, a fresh page navigation that reuses the same JS module)
 * would ever retry it.
 */
describe('loadTileFacts — a failed fetch does not poison the cache forever', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('a rejected fetch resolves to the honest empty state but is NOT cached — the next call retries', async () => {
    let calls = 0;
    global.fetch = vi.fn(() => {
      calls += 1;
      return Promise.reject(new Error('network error'));
    }) as unknown as typeof fetch;

    const { loadTileFacts } = await import('./tileFacts');

    const first = await loadTileFacts('movie', 123);
    expect(first.availability.status).toBe('unconfirmed');
    expect(calls).toBe(1);

    // Same title, called again — a naive cache would return the same
    // memoized failed promise and calls would stay at 1.
    const second = await loadTileFacts('movie', 123);
    expect(calls).toBe(2);
    expect(second.availability.status).toBe('unconfirmed');
  });

  it('a non-ok HTTP response is treated as a failure, not a successful empty payload', async () => {
    let calls = 0;
    global.fetch = vi.fn(() => {
      calls += 1;
      return Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      }) as unknown as ReturnType<typeof fetch>;
    }) as unknown as typeof fetch;

    const { loadTileFacts } = await import('./tileFacts');
    const result = await loadTileFacts('tv', 456);
    expect(result.availability.status).toBe('unconfirmed');
    // Retries on the next call too, same as the network-error case.
    await loadTileFacts('tv', 456);
    expect(calls).toBe(2);
  });

  it('a successful fetch IS cached — a grid of cards for the same title makes one request', async () => {
    let calls = 0;
    global.fetch = vi.fn(() => {
      calls += 1;
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            ratings: { standardScore: 72 },
            overview: 'A real synopsis.',
            facts: null,
            availability: { status: 'available', sources: [], checkedAt: null },
          }),
      }) as unknown as ReturnType<typeof fetch>;
    }) as unknown as typeof fetch;

    const { loadTileFacts } = await import('./tileFacts');
    await loadTileFacts('movie', 789);
    await loadTileFacts('movie', 789);
    await loadTileFacts('movie', 789);
    expect(calls).toBe(1);
  });
});
