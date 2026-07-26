import 'server-only';
import { resolveSchedule } from './registry';
import { SchedulesDirectAdapter } from './adapters/schedulesDirect';
import { TvmazeAdapter } from './adapters/tvmaze';
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

function adapters() {
  return [new SchedulesDirectAdapter(), new TvmazeAdapter()];
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
      lineupId: process.env.SCHEDULES_DIRECT_LINEUP ?? null,
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

/** Whether a full-grid provider is configured on this deployment. */
export function hasFullGridProvider(): boolean {
  return new SchedulesDirectAdapter().isConfigured();
}
