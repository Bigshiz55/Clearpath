import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mapListing, validateContract, TvMediaAdapter, TVM_API_KEY_ENV, TVM_LINEUP_ENV, TVM_ZIP_ENV } from './tvMedia';
import { __stubTransportForTest } from '@/lib/tv/egressGuard';

/** A row shaped exactly like TV Media's documented v4 listings contract. */
function row(over: Record<string, unknown> = {}) {
  return {
    stationID: 'WABC',
    callsign: 'ABC 7',
    number: '7',
    listDateTime: '2026-08-02T20:00:00', // zone-less, per contract
    duration: 60,
    showID: '1001',
    seriesID: '2001',
    showName: 'Evening News',
    episodeTitle: 'Tonight',
    seasonNumber: 1,
    episodeNumber: 12,
    showTypeID: 'N',
    new: true,
    live: true,
    starRating: 8,
    description: 'The evening news.',
    showPicture: 'https://img.tvmedia.ca/1001.jpg',
    ...over,
  };
}

describe('mapListing — documented v4 contract', () => {
  it('maps every documented field to the normalized shape', () => {
    const l = mapListing(row());
    expect(l).not.toBeNull();
    expect(l).toMatchObject({
      channelId: 'WABC',
      channelName: 'ABC 7',
      channelNumber: '7',
      title: 'Evening News',
      episodeTitle: 'Tonight',
      seasonNumber: 1,
      episodeNumber: 12,
      programId: '2001', // prefers seriesID over showID
      isNew: true,
      isLive: true,
      rating: 8,
      ratingSource: 'TV Media',
      posterUrl: 'https://img.tvmedia.ca/1001.jpg',
      summary: 'The evening news.',
    });
  });

  it('reads zone-less listDateTime as UTC, per the documented timezone=UTC contract', () => {
    const l = mapListing(row({ listDateTime: '2026-08-02T20:00:00' }));
    expect(l!.startUtc).toBe('2026-08-02T20:00:00.000Z');
  });

  it('derives endUtc from duration in minutes', () => {
    const l = mapListing(row({ listDateTime: '2026-08-02T20:00:00', duration: 30 }));
    expect(l!.endUtc).toBe('2026-08-02T20:30:00.000Z');
  });

  it('treats an implausibly large duration as seconds, not minutes', () => {
    const l = mapListing(row({ listDateTime: '2026-08-02T20:00:00', duration: 3600 }));
    expect(l!.endUtc).toBe('2026-08-02T21:00:00.000Z');
  });

  it('falls back to showID for programId when seriesID is absent', () => {
    const l = mapListing(row({ seriesID: undefined }));
    expect(l!.programId).toBe('1001');
  });

  it('classifies showTypeID "M" as a movie', () => {
    const l = mapListing(row({ showTypeID: 'M', showName: 'Some Real Movie Title', episodeTitle: null }));
    expect(l!.contentType).toBe('movie');
  });

  it('leaves an undocumented showTypeID as "other" rather than guessing', () => {
    const l = mapListing(row({ showTypeID: 'X' }));
    expect(l!.contentType).toBe('other');
  });

  it('carries no genres — the documented contract has no genre field', () => {
    const l = mapListing(row());
    expect(l!.genres).toEqual([]);
  });

  it('carries no year — the documented contract has no year field', () => {
    const l = mapListing(row());
    expect(l!.year).toBeNull();
  });

  it('is only "new" or "live" when TV Media flags it, never inferred', () => {
    const l = mapListing(row({ new: undefined, live: undefined }));
    expect(l!.isNew).toBe(false);
    expect(l!.isLive).toBe(false);
  });

  it('rejects a row with no listDateTime, no title, or no stationID', () => {
    expect(mapListing(row({ listDateTime: null }))).toBeNull();
    expect(mapListing(row({ showName: null, episodeTitle: null }))).toBeNull();
    expect(mapListing(row({ stationID: null }))).toBeNull();
  });
});

describe('mapListing — movie-slot title swap', () => {
  it('uses episodeTitle as the real title when showName is the generic "Movie" placeholder', () => {
    const l = mapListing(row({ showTypeID: 'M', showName: 'Movie', episodeTitle: 'The Great Heist' }));
    expect(l!.title).toBe('The Great Heist');
    expect(l!.episodeTitle).toBeNull();
  });

  it('does the same for the French placeholder "Cinéma"', () => {
    const l = mapListing(row({ showTypeID: 'M', showName: 'Cinéma', episodeTitle: 'Le Grand Vol' }));
    expect(l!.title).toBe('Le Grand Vol');
    expect(l!.episodeTitle).toBeNull();
  });

  it('is case-insensitive on the placeholder name', () => {
    const l = mapListing(row({ showTypeID: 'M', showName: 'MOVIE', episodeTitle: 'Loud Title' }));
    expect(l!.title).toBe('Loud Title');
  });

  it('does NOT swap when showTypeID is M but showName is a real, specific title already', () => {
    const l = mapListing(row({ showTypeID: 'M', showName: 'The Great Heist', episodeTitle: null }));
    expect(l!.title).toBe('The Great Heist');
  });

  it('does NOT swap a placeholder-looking showName when showTypeID is not M', () => {
    const l = mapListing(row({ showTypeID: 'N', showName: 'Movie', episodeTitle: 'Not Actually A Movie Title' }));
    expect(l!.title).toBe('Movie');
    expect(l!.episodeTitle).toBe('Not Actually A Movie Title');
  });
});

describe('validateContract', () => {
  it('reports every documented field as resolved against a fully-populated sample', () => {
    const report = validateContract({ listings: [row(), row({ stationID: 'WNBC' })] });
    expect(report.sampleRows).toBe(2);
    expect(report.mapped).toBe(2);
    expect(report.unmapped).toBe(0);
    expect(report.missing).toEqual([]);
    expect(report.resolved).toContain('stationID');
    expect(report.resolved).toContain('listDateTime');
  });

  it('finds the listings array under a top-level "data" wrapper too', () => {
    const report = validateContract({ data: [row()] });
    expect(report.sampleRows).toBe(1);
    expect(report.mapped).toBe(1);
  });

  it('finds a bare top-level array', () => {
    const report = validateContract([row()]);
    expect(report.sampleRows).toBe(1);
  });

  it('names which documented fields never resolved, for a payload missing them', () => {
    const sparse = { stationID: 'WABC', listDateTime: '2026-08-02T20:00:00', showName: 'X' };
    const report = validateContract({ listings: [sparse] });
    expect(report.missing).toContain('starRating');
    expect(report.missing).toContain('showPicture');
  });
});

describe('TvMediaAdapter.fetch — the documented v4 request shape', () => {
  const request = {
    region: 'US', windowStartUtc: Date.parse('2026-08-02T00:00:00Z'), windowEndUtc: Date.parse('2026-08-03T00:00:00Z'),
  };

  beforeEach(() => {
    // These cases stub `global.fetch` and assert what the adapter does with
    // the response — the transport never leaves the process. The egress guard
    // cannot see that, and would otherwise refuse before the adapter reached
    // any of the behaviour under test, so the suite declares it out loud. See
    // egressGuard.ts, and egressContract.test.ts which keeps the seam
    // unreachable from non-test source.
    __stubTransportForTest(true);
    process.env[TVM_API_KEY_ENV] = 'test-key-value';
    delete process.env[TVM_LINEUP_ENV];
    delete process.env[TVM_ZIP_ENV];
  });

  afterEach(() => {
    __stubTransportForTest(false);
    delete process.env[TVM_API_KEY_ENV];
    delete process.env[TVM_LINEUP_ENV];
    delete process.env[TVM_ZIP_ENV];
    vi.unstubAllGlobals();
  });

  it('refuses outright when the transport is NOT stubbed — the gate is real', async () => {
    // The seam above is a statement about the transport, not a disabling of
    // the guard. With it off, this adapter refuses under vitest exactly as it
    // refuses in an unauthorised production environment.
    __stubTransportForTest(false);
    process.env[TVM_LINEUP_ENV] = '36617';
    const res = await new TvMediaAdapter().fetch(request);
    expect(res.status).toBe('misconfigured');
    expect(res.errorCode).toMatch(/^EGRESS_DENIED_/);
    expect(res.listings).toEqual([]);
  });

  it('is misconfigured with no key at all', async () => {
    delete process.env[TVM_API_KEY_ENV];
    const adapter = new TvMediaAdapter();
    const res = await adapter.fetch(request);
    expect(res.status).toBe('misconfigured');
    expect(res.errorCode).toBe('NO_CREDENTIALS');
  });

  it('is misconfigured when a key exists but neither lineup nor ZIP is set', async () => {
    const adapter = new TvMediaAdapter();
    const res = await adapter.fetch(request);
    expect(res.status).toBe('misconfigured');
    expect(res.errorCode).toBe('NO_LINEUP');
  });

  it('calls /lineups/{id}/listings directly when TVMEDIA_LINEUP_ID is set, with api_key as a query param', async () => {
    process.env[TVM_LINEUP_ENV] = '12345';
    let calledUrl = '';
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calledUrl = url;
      return new Response(JSON.stringify({ listings: [row()] }), { status: 200 });
    }));
    const adapter = new TvMediaAdapter();
    const res = await adapter.fetch(request);

    expect(calledUrl).toContain('/lineups/12345/listings');
    expect(calledUrl).toContain('api_key=test-key-value');
    expect(calledUrl).toContain('timezone=UTC');
    expect(calledUrl).toContain('detail=brief');
    expect(res.status).toBe('healthy');
    expect(res.totalRaw).toBe(1);
    expect(res.totalNormalized).toBe(1);
  });

  it('resolves a lineup from /lineups when only a ZIP is set, then uses it for /listings', async () => {
    process.env[TVM_ZIP_ENV] = '10001-lineup-resolve-test';
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(url);
      if (url.includes('/lineups?')) {
        return new Response(JSON.stringify({ lineups: [{ lineupID: 'RESOLVED-LINEUP' }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ listings: [row()] }), { status: 200 });
    }));
    const adapter = new TvMediaAdapter();
    const res = await adapter.fetch(request);

    expect(calls[0]).toContain('/lineups?');
    expect(calls[0]).toContain('postalCode=10001-lineup-resolve-test');
    expect(calls[1]).toContain('/lineups/RESOLVED-LINEUP/listings');
    expect(res.status).toBe('healthy');
  });

  it('falls back to the documented Sample-plan lineup when /lineups resolves nothing', async () => {
    process.env[TVM_ZIP_ENV] = '99999-fallback-test';
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(url);
      if (url.includes('/lineups?')) return new Response('{}', { status: 200 });
      return new Response(JSON.stringify({ listings: [row()] }), { status: 200 });
    }));
    const adapter = new TvMediaAdapter();
    const res = await adapter.fetch(request);

    expect(calls[1]).toContain('/lineups/36617/listings');
    expect(res.status).toBe('healthy');
  });

  it('falls back to the Sample-plan lineup when /lineups itself errors, without failing the request', async () => {
    process.env[TVM_ZIP_ENV] = '88888-error-test';
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(url);
      if (url.includes('/lineups?')) return new Response('not json', { status: 500 });
      return new Response(JSON.stringify({ listings: [row()] }), { status: 200 });
    }));
    const adapter = new TvMediaAdapter();
    const res = await adapter.fetch(request);

    expect(calls[1]).toContain('/lineups/36617/listings');
    expect(res.status).toBe('healthy');
  });

  it('reports CONTRACT_MISMATCH when rows arrive but none map', async () => {
    process.env[TVM_LINEUP_ENV] = '12345';
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ listings: [{ someUnknownField: 'x' }] }), { status: 200 })));
    const adapter = new TvMediaAdapter();
    const res = await adapter.fetch(request);
    expect(res.status).toBe('malformed_response');
    expect(res.errorCode).toBe('CONTRACT_MISMATCH');
  });

  it('maps an HTTP 404 to a failed status without throwing', async () => {
    process.env[TVM_LINEUP_ENV] = '12345';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })));
    const adapter = new TvMediaAdapter();
    const res = await adapter.fetch(request);
    expect(res.status).not.toBe('healthy');
    expect(res.errorCode).toBe('HTTP_404');
    expect(res.listings).toEqual([]);
  });

  it('never includes the api_key value in an error message', async () => {
    process.env[TVM_LINEUP_ENV] = '12345';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('server exploded', { status: 500 })));
    const adapter = new TvMediaAdapter();
    const res = await adapter.fetch(request);
    expect(res.errorMessage).not.toContain('test-key-value');
  });
});
