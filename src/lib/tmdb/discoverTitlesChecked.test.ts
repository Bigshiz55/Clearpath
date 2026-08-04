import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * RELIABILITY SPRINT — New Releases must be able to tell "TMDB is down" apart
 * from "confirmed, there's really nothing here." `discoverTitles` (the
 * ordinary fail-open helper nearly everything else uses) swallows any fetch
 * failure into an empty array, which is indistinguishable from a genuine
 * zero-result page. `discoverTitlesChecked` is the one caller-facing escape
 * hatch that also reports whether the underlying request actually succeeded
 * — this is what servicesFeed.ts's `getReleases` uses to compute `degraded`.
 */
describe('discoverTitlesChecked — reports ok:false on a real TMDB failure instead of a silent empty result', () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.TMDB_API_KEY;

  beforeEach(() => {
    vi.resetModules();
    process.env.TMDB_API_KEY = 'test-key-not-a-jwt';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.TMDB_API_KEY = originalKey;
    vi.restoreAllMocks();
  });

  it('a network failure yields ok:false and an empty item list, not a thrown error', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('network down'))) as unknown as typeof fetch;

    const { discoverTitlesChecked } = await import('./client');
    const result = await discoverTitlesChecked('movie', { region: 'US' });

    expect(result.ok).toBe(false);
    expect(result.items).toEqual([]);
  }, 15000);

  it('a non-2xx TMDB response yields ok:false', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ status_message: 'server error' }),
      } as Response),
    ) as unknown as typeof fetch;

    const { discoverTitlesChecked } = await import('./client');
    const result = await discoverTitlesChecked('movie', { region: 'US' });

    expect(result.ok).toBe(false);
    expect(result.items).toEqual([]);
  }, 15000);

  it('a genuinely successful, genuinely empty response yields ok:true with zero items — the honest opposite case', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ page: 1, results: [] }),
      } as Response),
    ) as unknown as typeof fetch;

    const { discoverTitlesChecked } = await import('./client');
    const result = await discoverTitlesChecked('movie', { region: 'US' });

    expect(result.ok).toBe(true);
    expect(result.items).toEqual([]);
  });

  it('a successful response with results maps items and reports ok:true', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            page: 1,
            results: [
              { id: 42, title: 'Test Movie', release_date: '2026-01-01', poster_path: '/p.jpg' },
            ],
          }),
      } as Response),
    ) as unknown as typeof fetch;

    const { discoverTitlesChecked } = await import('./client');
    const result = await discoverTitlesChecked('movie', { region: 'US' });

    expect(result.ok).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.title).toBe('Test Movie');
  });

  it('discoverTitles (the fail-open wrapper) still returns [] on failure, preserving existing best-effort callers', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('network down'))) as unknown as typeof fetch;

    const { discoverTitles } = await import('./client');
    const items = await discoverTitles('movie', { region: 'US' });

    expect(items).toEqual([]);
  }, 15000);
});
