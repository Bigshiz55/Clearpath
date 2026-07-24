import { describe, it, expect } from 'vitest';
import { ENV, hasTmdb } from './_env';

/**
 * REAL TMDB integration. Verifies search + watch-provider (streaming) data against
 * the live API. Mirrors the app's auth logic (src/lib/tmdb/client.ts): a v4
 * read-access token is a JWT (starts with "ey") sent as a Bearer header; a v3 key is
 * short hex sent as the `api_key` query param. Skips when the key is absent.
 */
const base = 'https://api.themoviedb.org/3';
const isV4 = ENV.tmdb.startsWith('ey');

function tmdbUrl(path: string, params: Record<string, string> = {}): string {
  const url = new URL(`${base}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  if (!isV4) url.searchParams.set('api_key', ENV.tmdb);
  return url.toString();
}
function tmdbHeaders(): Record<string, string> {
  return isV4
    ? { Authorization: `Bearer ${ENV.tmdb}`, Accept: 'application/json' }
    : { Accept: 'application/json' };
}

describe.skipIf(!hasTmdb)('TMDB (live)', () => {
  it('search returns real results for a known title', async () => {
    const r = await fetch(tmdbUrl('/search/multi', { query: 'The Matrix' }), { headers: tmdbHeaders() });
    expect(r.ok, `HTTP ${r.status}`).toBe(true);
    const d = (await r.json()) as { results?: Array<{ id: number; media_type: string; title?: string }> };
    expect(Array.isArray(d.results)).toBe(true);
    expect((d.results ?? []).length).toBeGreaterThan(0);
    expect((d.results ?? []).some((x) => (x.title ?? '').toLowerCase().includes('matrix'))).toBe(true);
  });

  it('watch/providers returns streaming availability for a movie', async () => {
    // 603 = The Matrix
    const r = await fetch(tmdbUrl('/movie/603/watch/providers'), { headers: tmdbHeaders() });
    expect(r.ok, `HTTP ${r.status}`).toBe(true);
    const d = (await r.json()) as { results?: Record<string, unknown> };
    expect(d.results && typeof d.results === 'object').toBe(true);
  });

  it('rejects an invalid key (guards against a silently-wrong secret)', async () => {
    // A clearly-bogus v3 key must be rejected; this catches a silently-wrong secret.
    const r = await fetch(`${base}/search/multi?api_key=deadbeef&query=x`);
    expect(r.status, 'invalid key should be 401').toBe(401);
  });
});
