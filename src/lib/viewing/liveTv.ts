import 'server-only';
import { resolveSchedule } from './registry';
import { TvMediaAdapter, TVMEDIA_CAPABILITIES } from './adapters/tvMedia';
import { SchedulesDirectAdapter } from './adapters/schedulesDirect';
import { TvmazeAdapter } from './adapters/tvmaze';
import { MockScheduleAdapter } from './adapters/mock';
import {
  selectAvailable, rankListings, pickTopIndex,
  type ScheduleListing, type ContentType,
} from './schedule';
import { buildResultSet, traceIdFrom, type ResultSet, type RankingMethod } from './contract';

/**
 * The Live TV entry point. Everything above this is provider-agnostic; this is
 * where the registered adapters are assembled and the three layers are run in
 * order — availability, then ranking, then the highlighted pick.
 *
 * It always returns a `ResultSet`, never a bare array, so a caller cannot
 * mistake "the provider is down" for "nothing is on".
 */

export const LIVE_TV_PAGE_SIZE = 30;
export const MIN_USEFUL_RESULTS = 12;

/**
 * The registered chain, in priority order. Business logic never names a
 * provider — it asks this module for a schedule and gets whichever source is
 * configured, with the status attached.
 *
 *   0  TV Media          licensed primary, full national grid
 *  10  Schedules Direct  licensed alternate, kept registered so a second
 *                        contract is a config change, not a code change
 *  50  TVmaze            premiere feed — supplement only, never a grid
 *  90  Mock              MOCK_SCHEDULE=1 only; never active in production
 */
function adapters() {
  return [
    new TvMediaAdapter(),
    new SchedulesDirectAdapter(),
    new TvmazeAdapter(),
    new MockScheduleAdapter(),
  ];
}

/** Which providers are registered, configured, and what they can do. */
export function providerCapabilities() {
  const tvm = new TvMediaAdapter();
  const sd = new SchedulesDirectAdapter();
  const maze = new TvmazeAdapter();
  const mock = new MockScheduleAdapter();
  return [
    {
      providerId: tvm.providerId, priority: tvm.priority, configured: tvm.isConfigured(),
      isFullGrid: true, capabilities: TVMEDIA_CAPABILITIES, role: 'primary' as const,
    },
    {
      providerId: sd.providerId, priority: sd.priority, configured: sd.isConfigured(),
      isFullGrid: true, role: 'alternate' as const,
    },
    {
      providerId: maze.providerId, priority: maze.priority, configured: maze.isConfigured(),
      isFullGrid: false, role: 'supplement' as const,
    },
    {
      providerId: mock.providerId, priority: mock.priority, configured: mock.isConfigured(),
      isFullGrid: true, role: 'mock' as const,
    },
  ];
}

export interface LiveTvQuery {
  region?: string;
  /** Window length in hours. */
  hours?: number;
  nowMs?: number;
  channels?: string[] | null;
  contentTypes?: ContentType[] | null;
  ranking?: RankingMethod;
  pageSize?: number;
  offset?: number;
  /** IANA zone, used only for display downstream. */
  timeZone?: string;
  matchScore?: (l: ScheduleListing) => number | null;
}

export async function getLiveSchedule(q: LiveTvQuery = {}): Promise<ResultSet<ScheduleListing>> {
  const region = q.region ?? 'US';
  const hours = Math.max(1, Math.min(q.hours ?? 6, 48));
  const nowMs = q.nowMs ?? Date.now();
  const endMs = nowMs + hours * 3_600_000;
  const traceId = traceIdFrom(`${region}|${hours}|${Math.floor(nowMs / 300_000)}|${(q.channels ?? []).join(',')}`);

  const resolved = await resolveSchedule({
    adapters: adapters(),
    request: {
      region,
      windowStartUtc: nowMs,
      windowEndUtc: endMs,
      channels: q.channels ?? null,
      lineupId: process.env.TVMEDIA_LINEUP_ID ?? process.env.SCHEDULES_DIRECT_LINEUP ?? null,
      postalCode: process.env.TVMEDIA_DEFAULT_ZIP ?? null,
    },
  });

  // LAYER 1 — availability. Never consults enrichment.
  const { available, stages } = selectAvailable(resolved.listings, {
    windowStartMs: nowMs,
    windowEndMs: endMs,
    channels: q.channels ?? null,
    contentTypes: q.contentTypes ?? null,
  });

  // LAYER 2 — ranking. Reorders; never removes.
  const method: RankingMethod = q.ranking ?? 'chronological';
  const ranked = rankListings(available, method, { matchScore: q.matchScore });

  // LAYER 3 — recommendation. An index into the list, never a replacement for it.
  const topPickIndex = pickTopIndex(ranked, { matchScore: q.matchScore });

  return buildResultSet({
    queryType: q.channels && q.channels.length > 0 ? 'channel_schedule' : 'live_schedule',
    available: ranked,
    rankingMethod: method,
    pageSize: q.pageSize ?? LIVE_TV_PAGE_SIZE,
    offset: q.offset ?? 0,
    topPickIndex,
    sources: resolved.sources,
    fallbackUsed: resolved.fallbackUsed,
    traceId,
    // Stage counts are diagnostics; withheld from production payloads.
    stages: process.env.NODE_ENV === 'production' ? undefined : stages,
    region,
    channel: q.channels?.[0] ?? null,
    windowStartUtc: new Date(nowMs).toISOString(),
    windowEndUtc: new Date(endMs).toISOString(),
  });
}

/**
 * Whether a COMPLETE schedule is available on this deployment.
 *
 * True only for a licensed full-grid provider — never for the TVmaze premiere
 * feed, which is why the coverage banner stays up until a real contract is
 * wired. The mock counts only when explicitly enabled for a harness run.
 */
export function hasFullGridProvider(): boolean {
  return new TvMediaAdapter().isConfigured()
    || new SchedulesDirectAdapter().isConfigured()
    || new MockScheduleAdapter().isConfigured();
}

/** The active primary's id, for display. Null when none is configured. */
export function activeProviderId(): string | null {
  return providerCapabilities().find((p) => p.configured && p.role !== 'supplement')?.providerId ?? null;
}

/** Whether TV Media specifically is configured — drives its attribution
 *  credit, which their terms require only while their data is actually in
 *  use (CHANGES §5). */
export function isTvMediaConfigured(): boolean {
  return new TvMediaAdapter().isConfigured();
}

/**
 * A fresh TV Media adapter instance for the ingest writer
 * (`ingest/tvMediaWriter.ts`), which needs THIS provider specifically — it
 * writes rows tagged `provider_id='tv_media'` — not "whichever is
 * configured" the way query-time resolution does. Keeping construction here
 * rather than in the writer itself is what `independence.test.ts` enforces:
 * this file and `registry.ts` are the only places any `*Adapter` is `new`'d.
 */
export function tvMediaAdapterForIngest(): TvMediaAdapter {
  return new TvMediaAdapter();
}
