import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { TVMAZE_CHANNELS, type TvmazeChannelGroup } from '@/lib/viewing/ingest/tvmazeChannels';
import { linkStationToPack } from './stations';
import { packForStation, GROUP_TO_PACK } from './packChannelMap';

/**
 * PACK FRESHNESS (read) AND PACK WIRING (write) — DELIBERATELY SEPARATED.
 *
 * ── THE DEFECT THIS REPLACES ──────────────────────────────────────────────
 * `lazyIngest.ensurePackIngested` ran INSIDE the customer's GET. On a cold
 * Pack request it would:
 *
 *   - take a per-PACK advisory lock, then call `runTvmazeIngest(14)`, which
 *     is a GLOBAL ingest of every TVmaze channel — so opening Hallmark,
 *     Lifetime and Crime started three concurrent full-catalogue ingests
 *     that each re-fetched the same channels and raced each other's writes;
 *   - hold the request open for the entire upstream fetch (the page carried
 *     `maxDuration = 60` precisely because it could take that long);
 *   - then issue one SELECT per TVmaze channel plus a scan of every
 *     tv_media station, sequentially, before rendering a single pixel.
 *
 * A customer GET must never do provider I/O. It is not the customer's job to
 * pay for our data freshness, and a page that renders in 60s is broken even
 * when it eventually succeeds.
 *
 * ── WHAT REPLACES IT ──────────────────────────────────────────────────────
 * `getPackFreshness` — ONE indexed read, no writes, no upstream calls. That
 * is all a render is allowed to do.
 *
 * `refreshAllPackWiring` — the write half, run from the background refresh
 * endpoint (`POST /api/tv/refresh`) for EVERY pack at once. Wiring all three
 * packs in one pass costs the same two queries as wiring one, because the
 * station tables are read once and matched in memory. There is no per-pack
 * lock any more; there is no per-pack ingest any more. Provider-level
 * gating already lives in `runGatedTvIngest` (TVmaze once per UTC day, TV
 * Media once per two hours), and that is now the ONLY path that can start an
 * ingest.
 */

const PACK_CHANNEL_GROUP: Record<string, TvmazeChannelGroup> = {
  'hallmark-universe': 'hallmark',
  'lifetime-vault': 'lifetime',
  'crime-case-files': 'crime',
};

export interface PackFreshness {
  /** Newest listings coverage we hold, across providers. */
  coverageEndUtc: string | null;
  /** True when coverage runs out inside a day — the customer is told. */
  stale: boolean;
}

/**
 * The ONLY thing a Pack render may ask about freshness. One query against
 * tv_lineups (world-readable), no writes, no provider I/O, no locks.
 */
export async function getPackFreshness(supabase: SupabaseClient): Promise<PackFreshness> {
  const { data } = await supabase
    .from('tv_lineups')
    .select('coverage_end_utc')
    .order('coverage_end_utc', { ascending: false, nullsFirst: false })
    .limit(1);
  const coverageEndUtc = (data?.[0]?.coverage_end_utc as string | undefined) ?? null;
  const stale = !coverageEndUtc || Date.parse(coverageEndUtc) < Date.now() + 86_400_000;
  return { coverageEndUtc, stale };
}

export interface WiringReport {
  packsWired: number;
  linksCreated: number;
  stationsConsidered: number;
}

/**
 * Link every Pack to every station that belongs to it, for all providers, in
 * one pass. Idempotent. Runs in the background refresh, never in a render.
 *
 * Reads both station sets ONCE and matches in memory — the old code did one
 * round trip per TVmaze channel per pack (11 channels x 3 packs = 33
 * sequential SELECTs) and re-read the full tv_media station list three times.
 */
export async function refreshAllPackWiring(): Promise<WiringReport> {
  const admin = createAdminClient();

  const [{ data: packs }, { data: stations }] = await Promise.all([
    admin.from('packs').select('id, slug'),
    admin.from('tv_stations').select('id, provider_id, provider_station_id, name'),
  ]);

  const allStations = (stations ?? []) as {
    id: string; provider_id: string; provider_station_id: string | null; name: string | null;
  }[];

  // provider_station_id -> id, for the TVmaze half (matched on the curated key).
  const tvmazeByKey = new Map<string, string>();
  for (const s of allStations) {
    if (s.provider_id === 'tvmaze' && s.provider_station_id) tvmazeByKey.set(s.provider_station_id, s.id);
  }

  let linksCreated = 0;
  let packsWired = 0;

  for (const pack of ((packs ?? []) as { id: string; slug: string }[])) {
    const group = PACK_CHANNEL_GROUP[pack.slug];
    if (!group) continue;
    packsWired++;
    const packSlug = GROUP_TO_PACK[group];

    const wanted = new Set<string>();
    for (const ch of TVMAZE_CHANNELS) {
      if (ch.group !== group) continue;
      const id = tvmazeByKey.get(ch.key);
      if (id) wanted.add(id);
    }
    for (const s of allStations) {
      if (s.provider_id === 'tvmaze') continue;
      if (packForStation(s.provider_id, s.name ?? '') === packSlug) wanted.add(s.id);
    }

    for (const stationId of wanted) {
      await linkStationToPack(admin, pack.id, stationId);
      linksCreated++;
    }
  }

  return { packsWired, linksCreated, stationsConsidered: allStations.length };
}
