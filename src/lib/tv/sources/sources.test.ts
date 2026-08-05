import { describe, it, expect, beforeEach } from 'vitest';
import {
  FEASIBILITY_MATRIX, feasibilityFor, byVerdict, availableWithoutCredentials, blockedOn,
} from './feasibility';
import {
  cassetteKey, redactUrl, playThrough, cassetteModeFor, MemoryCassetteStore,
  type Fetcher,
} from './cassette';

describe('source feasibility matrix', () => {
  it('gives every source a verdict and a reason', () => {
    for (const row of FEASIBILITY_MATRIX) {
      expect(['go', 'conditional', 'no_go']).toContain(row.verdict);
      expect(row.reason.length, `${row.slug} needs a real reason`).toBeGreaterThan(40);
      expect(row.completeness.length).toBeGreaterThan(0);
      expect(row.fallback.length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate slugs', () => {
    const slugs = FEASIBILITY_MATRIX.map((r) => r.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('refuses search-result pages as a production source', () => {
    const row = feasibilityFor('search_result_pages')!;
    expect(row.verdict).toBe('no_go');
    expect(row.reason.toLowerCase()).toContain('excluded');
  });

  it('refuses broadcaster page scraping as a general strategy', () => {
    expect(feasibilityFor('network_schedule_pages')!.verdict).toBe('no_go');
    expect(feasibilityFor('provider_lineup_lookup')!.verdict).toBe('no_go');
    expect(feasibilityFor('xmltv_open')!.verdict).toBe('no_go');
  });

  it('keeps every metered source out of `go`', () => {
    // A metered source can never be simply "go": spending is always a
    // decision somebody has to make, so it is conditional by construction.
    for (const row of FEASIBILITY_MATRIX.filter((r) => r.costClass === 'metered')) {
      expect(row.verdict, `${row.slug}`).not.toBe('go');
    }
  });

  it('records TV Media as disabled and needing two explicit keys', () => {
    const row = feasibilityFor('tv_media')!;
    expect(row.verdict).toBe('conditional');
    expect(row.costClass).toBe('metered');
    expect(row.reason).toContain('DATA_MODE=paid_live');
    expect(row.reason).toContain('TVMEDIA_ENABLED=1');
  });

  it("records Watchmode's non-commercial restriction rather than glossing it", () => {
    expect(feasibilityFor('watchmode')!.termsSummary.toUpperCase()).toContain('NON-COMMERCIAL');
  });

  it('leaves the product usable with no credentials at all', () => {
    // The specification's "fully buildable, testable and demonstrable without
    // a paid contract" — asserted, not assumed.
    const free = availableWithoutCredentials();
    expect(free.map((r) => r.slug)).toContain('fixture');
    expect(free.map((r) => r.slug)).toContain('tvmaze');
    for (const row of free) expect(row.costClass).toBe('free');
  });

  it('names exactly what each conditional source is waiting on', () => {
    const blocked = blockedOn();
    expect(blocked.length).toBeGreaterThan(0);
    for (const b of blocked) expect(b.needs.length).toBeGreaterThan(5);
    expect(blocked.find((b) => b.slug === 'schedules_direct')?.needs).toContain('account');
    expect(blocked.find((b) => b.slug === 'watchmode')?.needs).toContain('licensing');
  });

  it('marks no source above its earned stage', () => {
    // Nothing may claim `verified` or `production_supported` from this table.
    // Those stages are earned by evidence in source_promotion_evidence, and a
    // matrix entry is a plan, not evidence.
    for (const row of FEASIBILITY_MATRIX) {
      expect(['verified', 'production_supported']).not.toContain(row.stage);
    }
  });

  it('marks the fixture source as fixture_tested, never verified', () => {
    expect(feasibilityFor('fixture')!.stage).toBe('fixture_tested');
  });

  it('records attribution obligations where they exist', () => {
    expect(feasibilityFor('tmdb')!.attributionRequired).toBe(true);
  });

  it('separates go / conditional / no_go cleanly', () => {
    const total = byVerdict('go').length + byVerdict('conditional').length + byVerdict('no_go').length;
    expect(total).toBe(FEASIBILITY_MATRIX.length);
  });
});

describe('cassette — credentials never reach storage', () => {
  it('redacts an api_key query parameter', () => {
    // TV Media authenticates with a query parameter, so a naive cassette
    // filename or log line would carry the key in plaintext.
    const url = 'https://api.tvmedia.ca/tv/v4/lineups/36617/listings?api_key=super-secret&start=1';
    const red = redactUrl(url);
    expect(red).not.toContain('super-secret');
    expect(red).toContain('api_key=REDACTED');
    expect(red).toContain('start=1');
  });

  it.each(['token', 'access_token', 'apikey', 'password', 'secret', 'key'])(
    'redacts %s', (param) => {
      expect(redactUrl(`https://x.test/a?${param}=abc123`)).not.toContain('abc123');
    });

  it('leaves a URL with no credentials untouched', () => {
    const url = 'https://api.tvmaze.com/schedule?country=US&date=2026-08-05';
    expect(redactUrl(url)).toBe(url);
  });

  it('does not throw on a malformed URL', () => {
    expect(redactUrl('not a url')).toBe('not a url');
  });
});

describe('cassette — keying', () => {
  it('is stable for the same request', () => {
    const req = { method: 'GET', url: 'https://x.test/a?b=1' };
    expect(cassetteKey(req)).toBe(cassetteKey({ ...req }));
  });

  it('differs by URL and by method', () => {
    expect(cassetteKey({ method: 'GET', url: 'https://x.test/a' }))
      .not.toBe(cassetteKey({ method: 'GET', url: 'https://x.test/b' }));
    expect(cassetteKey({ method: 'GET', url: 'https://x.test/a' }))
      .not.toBe(cassetteKey({ method: 'POST', url: 'https://x.test/a' }));
  });

  it('ignores a rotated credential — the key identifies the resource', () => {
    const a = cassetteKey({ method: 'GET', url: 'https://x.test/a?api_key=old&d=1' });
    const b = cassetteKey({ method: 'GET', url: 'https://x.test/a?api_key=new&d=1' });
    expect(a).toBe(b);
  });

  it('varies by declared vary-headers, and only those', () => {
    const base = { method: 'GET', url: 'https://x.test/a' };
    expect(cassetteKey({ ...base, varyHeaders: { accept: 'application/json' } }))
      .not.toBe(cassetteKey({ ...base, varyHeaders: { accept: 'text/xml' } }));
  });

  it('never contains a credential', () => {
    expect(cassetteKey({ method: 'GET', url: 'https://x.test/a?api_key=super-secret' }))
      .not.toContain('super-secret');
  });
});

describe('cassette — playback', () => {
  let store: MemoryCassetteStore;
  let calls: string[];
  let fetcher: Fetcher;

  beforeEach(() => {
    store = new MemoryCassetteStore();
    calls = [];
    fetcher = async (url, init) => {
      calls.push(`${init.method} ${url}`);
      return {
        status: 200,
        text: async () => '{"ok":true}',
        headers: {
          get: (n: string) => ({ etag: '"v1"', 'last-modified': 'Wed, 05 Aug 2026 00:00:00 GMT',
                                 'content-type': 'application/json' } as Record<string, string>)[n.toLowerCase()] ?? null,
        },
      };
    };
  });

  const req = { method: 'GET', url: 'https://api.tvmaze.com/schedule?country=US' };

  it('records on a miss in record mode, then replays without calling again', async () => {
    const first = await playThrough(req, { mode: 'record', store, sourceSlug: 'tvmaze', fetcher });
    expect(first?.replayed).toBe(false);
    expect(calls).toHaveLength(1);

    const second = await playThrough(req, { mode: 'replay', store, sourceSlug: 'tvmaze', fetcher });
    expect(second?.replayed).toBe(true);
    expect(second?.body).toBe('{"ok":true}');
    expect(calls, 'replay must not touch the network').toHaveLength(1);
  });

  it('THROWS on a miss in replay mode rather than falling through to a live call', async () => {
    await expect(
      playThrough(req, { mode: 'replay', store, sourceSlug: 'tvmaze', fetcher }),
    ).rejects.toThrow(/Cassette miss/);
    expect(calls).toHaveLength(0);
  });

  it('returns null on a miss in offline mode, still without calling', async () => {
    const r = await playThrough(req, { mode: 'offline', store, sourceSlug: 'tvmaze', fetcher });
    expect(r).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('sends conditional headers on a re-record and honours a 304', async () => {
    await playThrough(req, { mode: 'record', store, sourceSlug: 'tvmaze', fetcher });

    let sent: Record<string, string> = {};
    const notModified: Fetcher = async (url, init) => {
      sent = init.headers;
      calls.push(`${init.method} ${url}`);
      return { status: 304, text: async () => '', headers: { get: () => null } };
    };
    const again = await playThrough(req, { mode: 'record', store, sourceSlug: 'tvmaze', fetcher: notModified });
    expect(sent['If-None-Match']).toBe('"v1"');
    expect(sent['If-Modified-Since']).toBe('Wed, 05 Aug 2026 00:00:00 GMT');
    expect(again?.notModified).toBe(true);
    // A 304 keeps the recorded body rather than blanking it.
    expect(again?.body).toBe('{"ok":true}');
  });

  it('stores the URL redacted', async () => {
    await playThrough(
      { method: 'GET', url: 'https://api.tvmedia.ca/x?api_key=super-secret' },
      { mode: 'record', store, sourceSlug: 'tv_media', fetcher },
    );
    const stored = await store.list();
    expect(JSON.stringify(stored)).not.toContain('super-secret');
    expect(stored[0]!.url).toContain('REDACTED');
  });

  it('never stores request headers, which is where credentials live', async () => {
    await playThrough(req, {
      mode: 'record', store, sourceSlug: 'tvmaze', fetcher,
      requestHeaders: { Authorization: 'Bearer super-secret' },
    });
    expect(JSON.stringify(await store.list())).not.toContain('super-secret');
  });
});

describe('cassette mode selection — who may reach the network', () => {
  const base = { dataMode: 'free_live' as const, vercelEnv: 'production', nodeEnv: 'production', isDeliberateIngestion: true };

  it('allows recording only for a deliberate ingestion run in a live mode', () => {
    expect(cassetteModeFor(base)).toBe('record');
    expect(cassetteModeFor({ ...base, dataMode: 'paid_live' })).toBe('record');
  });

  it('never records during a page load', () => {
    expect(cassetteModeFor({ ...base, isDeliberateIngestion: false })).toBe('replay');
  });

  it('never records in a test', () => {
    expect(cassetteModeFor({ ...base, nodeEnv: 'test' })).toBe('replay');
  });

  it('never records in a preview deployment', () => {
    expect(cassetteModeFor({ ...base, vercelEnv: 'preview' })).toBe('replay');
  });

  it('never records in fixture mode', () => {
    expect(cassetteModeFor({ ...base, dataMode: 'fixture' })).toBe('offline');
  });

  it('never records on an unconfigured production deployment', () => {
    expect(cassetteModeFor({ ...base, dataMode: null })).toBe('offline');
  });

  it('puts the environment refusals ahead of the mode', () => {
    // A test in paid_live during a deliberate ingestion is still a test.
    expect(cassetteModeFor({
      dataMode: 'paid_live', vercelEnv: 'production', nodeEnv: 'test', isDeliberateIngestion: true,
    })).toBe('replay');
  });
});
