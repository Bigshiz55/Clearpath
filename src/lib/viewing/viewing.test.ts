import { describe, it, expect } from 'vitest';
import {
  buildResultSet, emptyResultSet, emptyDueToFailure, collapseStages, traceIdFrom,
  type SourceReport,
} from './contract';
import { combineStatus, statusFromHttp, statusMessage, isFailure } from './status';
import {
  selectAvailable, rankListings, dedupeListings, dedupeKey, inWindow, isInProgress,
  parseInstant, localTime, localDayKey, pickTopIndex, type ScheduleListing,
} from './schedule';
import { resolveSchedule } from './registry';
import type { ScheduleAdapter, ScheduleResponse } from './schedule';
import { resolveProvider, canonicalProviderName, tmdbProviderIds, PROVIDERS } from './providers';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const T0 = Date.parse('2026-07-26T20:00:00Z');
const H = 3_600_000;

function listing(over: Partial<ScheduleListing> = {}): ScheduleListing {
  const start = over.startUtc ?? new Date(T0).toISOString();
  return {
    listingId: over.listingId ?? `${over.channelId ?? 'CH1'}|${start}|${over.programId ?? 'P1'}`,
    channelId: 'CH1', channelName: 'CBS',
    startUtc: start,
    endUtc: over.endUtc !== undefined ? over.endUtc : new Date(Date.parse(start) + H).toISOString(),
    title: 'A Program', programId: 'P1', contentType: 'series',
    ...over,
  };
}

/** N airings spread across the window, on M channels. */
function grid(n: number, channels = 10): ScheduleListing[] {
  return Array.from({ length: n }, (_, i) => {
    const ch = i % channels;
    const start = T0 + Math.floor(i / channels) * 1800_000;
    return listing({
      listingId: `L${i}`, channelId: `CH${ch}`, channelName: `Channel ${ch}`,
      startUtc: new Date(start).toISOString(),
      endUtc: new Date(start + H).toISOString(),
      title: `Program ${i}`, programId: `P${i}`,
    });
  });
}

function adapter(id: string, res: Partial<ScheduleResponse>, configured = true, priority = 0): ScheduleAdapter {
  return {
    providerId: id, priority,
    isConfigured: () => configured,
    fetch: async () => ({
      providerId: id, status: 'healthy', listings: [], totalRaw: 0, totalNormalized: 0,
      fetchedAt: new Date(T0).toISOString(), ...res,
    }),
  };
}

const REQ = { region: 'US', windowStartUtc: T0, windowEndUtc: T0 + 6 * H };

// ---------------------------------------------------------------------------
// 1 · the reported production failure
// ---------------------------------------------------------------------------
describe('the production regression that started this', () => {
  it('HARD: >=12 valid upstream listings must never render fewer than 12', () => {
    const raw = grid(300, 40);
    const { available, stages } = selectAvailable(raw, { windowStartMs: T0, windowEndMs: T0 + 6 * H });
    expect(available.length).toBeGreaterThanOrEqual(12);
    const rs = buildResultSet({
      queryType: 'live_schedule', available: rankListings(available, 'chronological'),
      rankingMethod: 'chronological', pageSize: 30,
      sources: [{ sourceId: 'x', status: 'healthy', rawCount: raw.length }],
      traceId: 't', stages,
    });
    expect(rs.totalReturned).toBeGreaterThanOrEqual(12);
    expect(rs.totalReturned).toBe(rs.results.length);
    expect(rs.hasMore).toBe(true);
  });

  it('HARD: if raw >=50 and returned <12, a collapsing stage is named', () => {
    const raw = grid(120, 20);
    // A pathological filter, of the kind that caused the original bug.
    const { available, stages } = selectAvailable(raw, {
      windowStartMs: T0, windowEndMs: T0 + 6 * H, channels: ['CH0'],
    });
    if (raw.length >= 50 && available.length < 12) {
      const collapsed = collapseStages(stages);
      expect(collapsed.length, 'a >80% stage must be identified').toBeGreaterThan(0);
      expect(collapsed[0]!.rule, 'the responsible rule must be named').toBeTruthy();
    }
  });

  it('a single upstream row yields a single card — and says so honestly', () => {
    const { available } = selectAvailable([listing()], { windowStartMs: T0, windowEndMs: T0 + 6 * H });
    const rs = buildResultSet({
      queryType: 'live_schedule', available, rankingMethod: 'chronological',
      sources: [{ sourceId: 'tvmaze_premieres', status: 'healthy', rawCount: 1 }], traceId: 't',
    });
    expect(rs.totalAvailable).toBe(1);
    // Honest: it is not presented as "no results", and not as a full schedule.
    expect(rs.statusMessage).toBeNull();
    expect(rs.status).toBe('healthy');
  });

  it('a provider failure is NEVER represented as zero matching titles', () => {
    const rs = emptyResultSet('live_schedule',
      [{ sourceId: 'gracenote', status: 'provider_blocked', rawCount: 0, errorCode: 'WAF' }], 't');
    expect(rs.totalAvailable).toBe(0);
    expect(emptyDueToFailure(rs)).toBe(true);
    expect(rs.statusMessage).toMatch(/could not be reached/i);
    expect(rs.statusMessage).not.toMatch(/no matching titles/i);
  });

  it('genuine emptiness reads differently from a failure', () => {
    const ok = emptyResultSet('live_schedule', [{ sourceId: 'sd', status: 'healthy', rawCount: 0 }], 't');
    expect(emptyDueToFailure(ok)).toBe(false);
    expect(ok.statusMessage).toMatch(/no matching titles/i);
  });
});

// ---------------------------------------------------------------------------
// 2 · availability never depends on enrichment
// ---------------------------------------------------------------------------
describe('missing enrichment must not remove inventory', () => {
  const bare = [
    listing({ listingId: 'a', posterUrl: null, rating: null, summary: null }),
    listing({ listingId: 'b', channelId: 'CH2', genres: undefined, contentType: undefined }),
    listing({ listingId: 'c', channelId: 'CH3', episodeTitle: null, seasonNumber: null, tmdbId: null }),
    listing({ listingId: 'd', channelId: 'CH4', year: null, programId: null }),
  ];

  it('keeps every listing that lacks poster, rating, synopsis, genre or TMDB data', () => {
    const { available } = selectAvailable(bare, { windowStartMs: T0, windowEndMs: T0 + 6 * H });
    expect(available).toHaveLength(bare.length);
  });

  it('drops only structurally invalid rows, and names that rule', () => {
    const withBad = [...bare, listing({ listingId: 'x', channelId: '', title: 'No channel' })];
    const { available, stages } = selectAvailable(withBad, { windowStartMs: T0, windowEndMs: T0 + 6 * H });
    expect(available).toHaveLength(bare.length);
    expect(stages.find((s) => s.stage === 'structural')!.rule).toMatch(/channel/i);
  });

  it('ranking by rating keeps unrated titles in the set', () => {
    const mixed = [
      listing({ listingId: '1', rating: 8.5 }),
      listing({ listingId: '2', channelId: 'C2', rating: null }),
      listing({ listingId: '3', channelId: 'C3', rating: 6.0 }),
    ];
    const ranked = rankListings(mixed, 'highest_rated');
    expect(ranked).toHaveLength(3);
    expect(ranked[ranked.length - 1]!.listingId).toBe('2'); // last, not gone
  });
});

// ---------------------------------------------------------------------------
// 3 · deduplication preserves distinct inventory
// ---------------------------------------------------------------------------
describe('deduplication', () => {
  it('keeps the same movie airing at two different times', () => {
    const a = listing({ listingId: '', title: 'Heat', programId: 'MV1', startUtc: new Date(T0).toISOString() });
    const b = listing({ listingId: '', title: 'Heat', programId: 'MV1', startUtc: new Date(T0 + 3 * H).toISOString() });
    expect(dedupeKey(a)).not.toBe(dedupeKey(b));
    expect(dedupeListings([a, b])).toHaveLength(2);
  });

  it('keeps the same movie on two different channels', () => {
    const a = listing({ listingId: '', title: 'Heat', programId: 'MV1', channelId: 'HBO' });
    const b = listing({ listingId: '', title: 'Heat', programId: 'MV1', channelId: 'HBO2' });
    expect(dedupeListings([a, b])).toHaveLength(2);
  });

  it('keeps different episodes of one series — the bug that collapsed the guide', () => {
    const eps = [1, 2, 3].map((n) => listing({
      listingId: '', title: 'The Series', programId: `EP${n}`,
      seasonNumber: 1, episodeNumber: n,
      startUtc: new Date(T0 + n * H).toISOString(),
    }));
    expect(dedupeListings(eps)).toHaveLength(3);
  });

  it('keeps HD and SD feeds as distinct channels', () => {
    const a = listing({ listingId: '', channelId: 'AMC', programId: 'MV9' });
    const b = listing({ listingId: '', channelId: 'AMC-HD', programId: 'MV9' });
    expect(dedupeListings([a, b])).toHaveLength(2);
  });

  it('removes only a true duplicate: same channel, same start, same program', () => {
    const a = listing({ listingId: '', channelId: 'CBS', programId: 'P7' });
    const b = listing({ listingId: '', channelId: 'CBS', programId: 'P7' });
    expect(dedupeKey(a)).toBe(dedupeKey(b));
    expect(dedupeListings([a, b])).toHaveLength(1);
  });

  it('never dedupes on title alone', () => {
    const many = Array.from({ length: 8 }, (_, i) => listing({
      listingId: '', title: 'Movie Marathon', programId: 'MV1',
      channelId: `CH${i}`, startUtc: new Date(T0 + i * H).toISOString(),
    }));
    expect(dedupeListings(many)).toHaveLength(8);
  });
});

// ---------------------------------------------------------------------------
// 4 · time and window correctness
// ---------------------------------------------------------------------------
describe('canonical time pipeline', () => {
  it('refuses to parse a timestamp with no zone, rather than guessing', () => {
    expect(parseInstant('2026-07-26 20:00')).toBeNull();
    expect(parseInstant('2026-07-26T20:00:00')).toBeNull();
    expect(parseInstant('2026-07-26T20:00:00Z')).toBe(T0);
    expect(parseInstant('2026-07-26T16:00:00-04:00')).toBe(T0);
  });

  it('includes a programme already in progress', () => {
    const l = listing({
      startUtc: new Date(T0 - H).toISOString(),
      endUtc: new Date(T0 + H).toISOString(),
    });
    expect(inWindow(l, T0, T0 + 6 * H)).toBe(true);
    expect(isInProgress(l, T0)).toBe(true);
  });

  it('excludes a programme that already ended', () => {
    const l = listing({
      startUtc: new Date(T0 - 3 * H).toISOString(),
      endUtc: new Date(T0 - H).toISOString(),
    });
    expect(inWindow(l, T0, T0 + 6 * H)).toBe(false);
  });

  it('includes one starting exactly at the cutoff, excludes one after', () => {
    const at = listing({ startUtc: new Date(T0 + 6 * H).toISOString(), endUtc: null });
    const after = listing({ startUtc: new Date(T0 + 6 * H + 1).toISOString(), endUtc: null });
    expect(inWindow(at, T0, T0 + 6 * H)).toBe(true);
    expect(inWindow(after, T0, T0 + 6 * H)).toBe(false);
  });

  it('includes one that starts inside but ends after the window', () => {
    const l = listing({
      startUtc: new Date(T0 + 5 * H).toISOString(),
      endUtc: new Date(T0 + 9 * H).toISOString(),
    });
    expect(inWindow(l, T0, T0 + 6 * H)).toBe(true);
  });

  it('renders the SAME instant correctly in every US zone', () => {
    const iso = '2026-07-26T20:00:00Z'; // 4pm ET, 1pm PT, 1pm MST(AZ)
    expect(localTime(iso, 'America/New_York')).toBe('4:00 PM');
    expect(localTime(iso, 'America/Chicago')).toBe('3:00 PM');
    expect(localTime(iso, 'America/Denver')).toBe('2:00 PM');
    expect(localTime(iso, 'America/Los_Angeles')).toBe('1:00 PM');
    expect(localTime(iso, 'America/Anchorage')).toBe('12:00 PM');
    expect(localTime(iso, 'Pacific/Honolulu')).toBe('10:00 AM');
  });

  it('handles Arizona, which does not observe DST', () => {
    // In July, Denver is MDT (UTC-6) and Phoenix is MST (UTC-7) — one hour apart.
    const july = '2026-07-26T20:00:00Z';
    expect(localTime(july, 'America/Denver')).toBe('2:00 PM');
    expect(localTime(july, 'America/Phoenix')).toBe('1:00 PM');
    // In January both are UTC-7 — the same wall clock.
    const jan = '2026-01-26T20:00:00Z';
    expect(localTime(jan, 'America/Denver')).toBe(localTime(jan, 'America/Phoenix'));
  });

  it('survives a DST transition without shifting the schedule', () => {
    // US DST begins 2026-03-08 02:00 local.
    const before = '2026-03-08T06:30:00Z'; // 1:30am EST
    const after = '2026-03-08T07:30:00Z';  // 3:30am EDT
    expect(localTime(before, 'America/New_York')).toBe('1:30 AM');
    expect(localTime(after, 'America/New_York')).toBe('3:30 AM');
  });

  it('assigns the correct local day across midnight rollover', () => {
    // 01:30 UTC on the 27th is still the evening of the 26th in New York.
    const iso = '2026-07-27T01:30:00Z';
    expect(localDayKey(iso, 'America/New_York')).toBe('2026-07-26');
    expect(localDayKey(iso, 'UTC')).toBe('2026-07-27');
  });

  it('a midnight-spanning window keeps both sides', () => {
    const start = Date.parse('2026-07-27T01:00:00Z');
    const rows = [
      listing({ listingId: 'pre', startUtc: '2026-07-27T01:30:00Z', endUtc: '2026-07-27T02:30:00Z' }),
      listing({ listingId: 'post', channelId: 'C2', startUtc: '2026-07-27T05:30:00Z', endUtc: '2026-07-27T06:30:00Z' }),
    ];
    const { available } = selectAvailable(rows, { windowStartMs: start, windowEndMs: start + 6 * H });
    expect(available).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// 5 · ranking reorders, never removes
// ---------------------------------------------------------------------------
describe('ranking and recommendation layers', () => {
  const set = grid(40, 8);

  it('every ranking method preserves the set exactly', () => {
    for (const m of ['chronological', 'highest_rated', 'best_match'] as const) {
      const out = rankListings(set, m);
      expect(out, m).toHaveLength(set.length);
      expect(new Set(out.map((x) => x.listingId)).size, m).toBe(set.length);
    }
  });

  it('chronological really is chronological', () => {
    const out = rankListings([...set].reverse(), 'chronological');
    const times = out.map((x) => Date.parse(x.startUtc));
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('best_match uses the score but keeps unscored titles', () => {
    const scored = rankListings(set, 'best_match', {
      matchScore: (l) => (l.listingId === 'L7' ? 99 : null),
    });
    expect(scored[0]!.listingId).toBe('L7');
    expect(scored).toHaveLength(set.length);
  });

  it('HARD: highlighting a top pick does not truncate the array', () => {
    const ranked = rankListings(set, 'chronological');
    const top = pickTopIndex(ranked, { matchScore: (l) => (l.listingId === 'L5' ? 100 : 1) });
    const rs = buildResultSet({
      queryType: 'live_schedule', available: ranked, rankingMethod: 'chronological',
      topPickIndex: top, pageSize: 30,
      sources: [{ sourceId: 's', status: 'healthy', rawCount: 40 }], traceId: 't',
    });
    expect(rs.totalAvailable).toBe(40);
    expect(rs.results).toHaveLength(30);
    expect(rs.topPickIndex).not.toBeNull();
    // The pick lives IN the array — it was not lifted out of it.
    expect(rs.results[rs.topPickIndex!]).toBeDefined();
  });

  it('a top pick beyond the current page is simply not flagged on it', () => {
    const ranked = rankListings(set, 'chronological');
    const rs = buildResultSet({
      queryType: 'live_schedule', available: ranked, rankingMethod: 'chronological',
      topPickIndex: 35, pageSize: 10,
      sources: [{ sourceId: 's', status: 'healthy', rawCount: 40 }], traceId: 't',
    });
    expect(rs.topPickIndex).toBeNull();
    expect(rs.totalAvailable).toBe(40); // still all there
  });
});

// ---------------------------------------------------------------------------
// 6 · pagination and count reconciliation
// ---------------------------------------------------------------------------
describe('pagination and counts', () => {
  it('totalReturned always equals results.length', () => {
    for (const size of [1, 5, 12, 30, 500]) {
      const rs = buildResultSet({
        queryType: 'provider_catalog', available: grid(100, 10),
        rankingMethod: 'best_match', pageSize: size,
        sources: [{ sourceId: 's', status: 'healthy', rawCount: 100 }], traceId: 't',
      });
      expect(rs.totalReturned, `size ${size}`).toBe(rs.results.length);
    }
  });

  it('paging covers the whole set exactly once', () => {
    const available = grid(95, 10);
    const seen: string[] = [];
    for (let off = 0; off < 95; off += 20) {
      const rs = buildResultSet({
        queryType: 'provider_catalog', available, rankingMethod: 'best_match',
        pageSize: 20, offset: off,
        sources: [{ sourceId: 's', status: 'healthy', rawCount: 95 }], traceId: 't',
      });
      seen.push(...rs.results.map((r) => r.listingId));
      expect(rs.hasMore).toBe(off + 20 < 95);
    }
    expect(seen).toHaveLength(95);
    expect(new Set(seen).size).toBe(95);
  });

  it('HARD: a catalog of 20+ valid titles renders at least 12 initially', () => {
    const rs = buildResultSet({
      queryType: 'provider_catalog', available: grid(20, 5), rankingMethod: 'best_match',
      pageSize: 24, sources: [{ sourceId: 'tmdb', status: 'healthy', rawCount: 20 }], traceId: 't',
    });
    expect(rs.totalReturned).toBeGreaterThanOrEqual(12);
  });

  it('HARD: a group slate with 12+ eligible titles never returns one', () => {
    for (const n of [8, 12, 16, 20]) {
      const rs = buildResultSet({
        queryType: 'group_slate', available: grid(50, 10), rankingMethod: 'group_dna',
        pageSize: n, sources: [{ sourceId: 'tmdb', status: 'healthy', rawCount: 50 }], traceId: 't',
      });
      expect(rs.totalReturned, `slate ${n}`).toBe(n);
      expect(rs.totalReturned).toBeGreaterThan(1);
    }
  });
});

// ---------------------------------------------------------------------------
// 7 · the fallback chain and silent-failure removal
// ---------------------------------------------------------------------------
describe('adapter fallback chain', () => {
  it('uses the primary when it is healthy', async () => {
    const r = await resolveSchedule({
      adapters: [adapter('primary', { listings: grid(30), totalRaw: 30 })],
      request: REQ,
    });
    expect(r.listings).toHaveLength(30);
    expect(r.fallbackUsed).toBe(false);
    expect(r.sources[0]!.status).toBe('healthy');
  });

  it('falls back to cache when the primary is blocked, and labels it stale', async () => {
    const r = await resolveSchedule({
      adapters: [adapter('primary', { status: 'provider_blocked', errorCode: 'WAF' })],
      request: REQ,
      readCache: async () => ({
        providerId: 'cache', status: 'healthy', listings: grid(18), totalRaw: 18,
        totalNormalized: 18, fetchedAt: new Date(T0).toISOString(),
        cachedAt: new Date(T0 - H).toISOString(),
      }),
      retries: 0,
    });
    expect(r.listings).toHaveLength(18);
    expect(r.fallbackUsed).toBe(true);
    expect(r.sources.some((s) => s.status === 'stale_cache')).toBe(true);
  });

  it('falls through to the secondary adapter', async () => {
    const r = await resolveSchedule({
      adapters: [
        adapter('primary', { status: 'unauthorized' }, true, 0),
        adapter('secondary', { listings: grid(14), totalRaw: 14 }, true, 1),
      ],
      request: REQ, retries: 0,
    });
    expect(r.listings).toHaveLength(14);
    expect(r.fallbackUsed).toBe(true);
  });

  it('reports misconfigured WITHOUT calling an unconfigured adapter', async () => {
    let called = false;
    const never: ScheduleAdapter = {
      providerId: 'sd', priority: 0, isConfigured: () => false,
      fetch: async () => { called = true; throw new Error('must not be called'); },
    };
    const r = await resolveSchedule({ adapters: [never], request: REQ });
    expect(called).toBe(false);
    expect(r.sources[0]!.status).toBe('misconfigured');
    expect(r.listings).toHaveLength(0);
    expect(combineStatus(r.sources.map((s) => s.status))).toBe('misconfigured');
  });

  it('HARD: an adapter that throws produces a FAILURE, never a silent empty array', async () => {
    const boom: ScheduleAdapter = {
      providerId: 'boom', priority: 0, isConfigured: () => true,
      fetch: async () => { throw new Error('socket hang up'); },
    };
    const r = await resolveSchedule({ adapters: [boom], request: REQ, retries: 0 });
    expect(r.listings).toHaveLength(0);
    expect(r.sources[0]!.errorCode).toBe('ADAPTER_THREW');
    expect(r.sources[0]!.status).not.toBe('healthy');
    expect(isFailure(r.sources[0]!.status) || r.sources[0]!.status === 'unavailable').toBe(true);
  });

  it('does not retry an unauthorized primary — the answer will not change', async () => {
    let calls = 0;
    const a: ScheduleAdapter = {
      providerId: 'sd', priority: 0, isConfigured: () => true,
      fetch: async () => {
        calls++;
        return { providerId: 'sd', status: 'unauthorized', listings: [], totalRaw: 0,
          totalNormalized: 0, fetchedAt: new Date(T0).toISOString() };
      },
    };
    await resolveSchedule({ adapters: [a], request: REQ, retries: 3 });
    expect(calls).toBe(1);
  });

  it('retries a transient failure, bounded', async () => {
    let calls = 0;
    const a: ScheduleAdapter = {
      providerId: 'sd', priority: 0, isConfigured: () => true,
      fetch: async () => {
        calls++;
        return { providerId: 'sd', status: 'timeout', listings: [], totalRaw: 0,
          totalNormalized: 0, fetchedAt: new Date(T0).toISOString() };
      },
    };
    await resolveSchedule({ adapters: [a], request: REQ, retries: 2 });
    expect(calls).toBe(3); // initial + 2, never unbounded
  });

  it('a timeout is a timeout, not an empty schedule', async () => {
    const slow: ScheduleAdapter = {
      providerId: 'slow', priority: 0, isConfigured: () => true,
      fetch: () => new Promise(() => {}), // never resolves
    };
    const r = await resolveSchedule({ adapters: [slow], request: REQ, timeoutMs: 30, retries: 0 });
    expect(r.sources[0]!.status).toBe('timeout');
  });
});

// ---------------------------------------------------------------------------
// 8 · status semantics
// ---------------------------------------------------------------------------
describe('source status', () => {
  it('detects a WAF challenge as blocked, not as a normal 403', () => {
    expect(statusFromHttp(405, '<html><title>Human Verification</title>')).toBe('provider_blocked');
    expect(statusFromHttp(403, 'awsWafCookieDomainList')).toBe('provider_blocked');
    expect(statusFromHttp(401, '{"error":"bad token"}')).toBe('unauthorized');
    expect(statusFromHttp(429, '')).toBe('rate_limited');
    expect(statusFromHttp(503, '')).toBe('unavailable');
    expect(statusFromHttp(200, '')).toBe('healthy');
  });

  it('combines a healthy and a failed source into partial', () => {
    expect(combineStatus(['healthy', 'provider_blocked'])).toBe('partial');
    expect(combineStatus(['healthy', 'healthy'])).toBe('healthy');
    expect(combineStatus(['misconfigured', 'timeout'])).toBe('misconfigured');
    expect(combineStatus([])).toBe('misconfigured');
  });

  it('never tells the user "no results" when the provider failed', () => {
    for (const s of ['rate_limited', 'unauthorized', 'misconfigured',
      'provider_blocked', 'malformed_response', 'timeout'] as const) {
      expect(statusMessage(s, 0), s).not.toMatch(/no matching titles/i);
      expect(isFailure(s)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 9 · provider normalization
// ---------------------------------------------------------------------------
describe('provider aliases', () => {
  it('maps the documented aliases to canonical names', () => {
    expect(canonicalProviderName('HBO Max')).toBe('Max');
    expect(canonicalProviderName('hbomax')).toBe('Max');
    expect(canonicalProviderName('Amazon Prime')).toBe('Prime Video');
    expect(canonicalProviderName('Paramount Plus')).toBe('Paramount+');
    expect(canonicalProviderName('Apple TV Plus')).toBe('Apple TV+');
    expect(canonicalProviderName('disney plus')).toBe('Disney+');
  });

  it('resolves a provider named inside a sentence', () => {
    expect(resolveProvider("what's on netflix tonight")?.name).toBe('Netflix');
    expect(resolveProvider('thrillers on prime video')?.name).toBe('Prime Video');
    // Longest alias wins: "hbo max" must not be beaten by "hbo".
    expect(resolveProvider('movies on hbo max tonight')?.name).toBe('Max');
  });

  it('returns null for an unknown service rather than guessing', () => {
    expect(resolveProvider('some unknown service')).toBeNull();
    expect(resolveProvider('')).toBeNull();
    expect(resolveProvider(null)).toBeNull();
  });

  it('covers every service named in the product brief', () => {
    for (const n of ['Netflix', 'Prime Video', 'Hulu', 'Max', 'Disney+', 'Peacock',
      'Paramount+', 'Apple TV+', 'BritBox', 'Acorn TV', 'Hallmark+', 'Starz', 'Showtime']) {
      expect(resolveProvider(n), n).not.toBeNull();
    }
    expect(PROVIDERS.some((p) => p.kind === 'fast')).toBe(true);
  });

  it('maps names to TMDB ids and drops only unknowns', () => {
    expect(tmdbProviderIds(['Netflix', 'HBO Max', 'nonsense'])).toEqual([8, 1899]);
  });
});

// ---------------------------------------------------------------------------
// 10 · diagnostics
// ---------------------------------------------------------------------------
describe('stage diagnostics', () => {
  it('records every stage with in/out counts', () => {
    const { stages } = selectAvailable(grid(100, 10), {
      windowStartMs: T0, windowEndMs: T0 + 6 * H,
    });
    for (const s of ['structural', 'window', 'dedupe']) {
      expect(stages.find((x) => x.stage === s), s).toBeDefined();
    }
    for (const s of stages) if (s.out < s.in) expect(s.rule, s.stage).toBeTruthy();
  });

  it('flags a stage that removes more than 80%', () => {
    const { stages } = selectAvailable(grid(100, 20), {
      windowStartMs: T0, windowEndMs: T0 + 6 * H, channels: ['CH1'],
    });
    const bad = collapseStages(stages);
    expect(bad.length).toBeGreaterThan(0);
    expect(bad[0]!.rule).toMatch(/channel/i);
  });

  it('trace ids are deterministic — a replay reproduces them', () => {
    expect(traceIdFrom('US|6h|2026-07-26')).toBe(traceIdFrom('US|6h|2026-07-26'));
    expect(traceIdFrom('a')).not.toBe(traceIdFrom('b'));
  });
});
