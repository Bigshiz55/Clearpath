import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { TVM_LINEUP_ENV, TVM_ZIP_ENV } from '../adapters/tvMedia';
import { tvMediaAdapterForIngest } from '../liveTv';
import type { ScheduleListing } from '../schedule';
import {
  stationsFrom, programmeKeyFor, buildProgrammeRow, toFetchedAiring, type ProgrammeRow,
} from './tvMediaIngest';
import { reconcile, type StoredAiring, type FetchedAiring } from './reconcile';
import { evaluateBudget, type BudgetState } from './budget';

/**
 * THE TV MEDIA WRITER — talks to Supabase; `tvMediaIngest.ts` stays pure.
 * Mirrors `tvmazeWriter.ts`'s shape (ensure provider/lineup, ensure stations,
 * ensure programmes, reconcile, apply) but with two real differences:
 *
 *  1. Stations are DISCOVERED from the fetch, not matched against a hand-kept
 *     list — TV Media returns whichever channels the lineup carries.
 *  2. The fetch is per-day (one `TvMediaAdapter.fetch()` call per calendar
 *     day of the window) rather than one call for the whole window. The
 *     adapter's contract accepts an arbitrary-length window in one call, but
 *     nothing about real TV Media pagination is verified yet (see the caveat
 *     in tvMedia.ts) — per-day is the conservative assumption a real EPG API
 *     is likely to require, and it keeps a single day's failure from voiding
 *     the whole run. See docs/SCHEDULE_PROVIDERS.md for the resulting cost
 *     model; correcting this assumption against real API docs is a change to
 *     this one loop, nothing downstream.
 *
 * Cost control (CHANGES §6): every call this function makes is logged to
 * `tv_call_ledger`, and when `TVMEDIA_MONTHLY_CALL_LIMIT` is set the run stops
 * — mid-run if necessary — rather than exceed it. Left at 0 (default), the
 * plan's real limit is not yet known and no budget is enforced, matching how
 * `tv_providers.monthly_call_limit = 0` already means "unmetered" for TVmaze.
 */

const PROVIDER_ID = 'tv_media';
const DEFAULT_MARKET_TZ = 'America/New_York';

export interface TvMediaIngestResult {
  ok: boolean;
  ran: boolean;
  reason?: string;
  lineupId: string | null;
  windowStartUtc: string | null;
  windowEndUtc: string | null;
  daysRequested: number;
  daysFetched: number;
  daysFailed: string[];
  callsUsed: number;
  stationsDiscovered: number;
  totalListingsFetched: number;
  inserted: number;
  updated: number;
  unchanged: number;
  expired: number;
}

function noRun(reason: string): TvMediaIngestResult {
  return {
    ok: false, ran: false, reason, lineupId: null, windowStartUtc: null, windowEndUtc: null,
    daysRequested: 0, daysFetched: 0, daysFailed: [], callsUsed: 0, stationsDiscovered: 0,
    totalListingsFetched: 0, inserted: 0, updated: 0, unchanged: 0, expired: 0,
  };
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

async function upsertGetId(
  admin: ReturnType<typeof createAdminClient>,
  table: string,
  match: Record<string, unknown>,
  values: Record<string, unknown>,
): Promise<string> {
  const { data: existing } = await admin.from(table).select('id').match(match).maybeSingle();
  if (existing?.id) {
    await admin.from(table).update(values).eq('id', existing.id);
    return existing.id as string;
  }
  const { data: inserted, error } = await admin.from(table).insert({ ...match, ...values }).select('id').single();
  if (error || !inserted) throw new Error(`upsert into ${table} failed: ${error?.message ?? 'no row returned'}`);
  return inserted.id as string;
}

async function monthlyCallsUsed(admin: ReturnType<typeof createAdminClient>, nowMs: number): Promise<number> {
  const monthStart = new Date(Date.UTC(new Date(nowMs).getUTCFullYear(), new Date(nowMs).getUTCMonth(), 1)).toISOString();
  const { count } = await admin
    .from('tv_call_ledger')
    .select('id', { count: 'exact', head: true })
    .eq('provider_id', PROVIDER_ID)
    .eq('counts_against_allowance', true)
    .gte('requested_at', monthStart);
  return count ?? 0;
}

async function ensureProviderAndLineup(
  admin: ReturnType<typeof createAdminClient>,
  lineupProviderId: string,
  configured: boolean,
): Promise<string> {
  const monthlyLimit = Number(process.env.TVMEDIA_MONTHLY_CALL_LIMIT ?? 0) || 0;
  await admin.from('tv_providers').upsert(
    {
      id: PROVIDER_ID, name: 'TV Media', adapter_type: 'tv_media', enabled: configured,
      status: configured ? 'healthy' : 'unconfigured', monthly_call_limit: monthlyLimit,
    },
    { onConflict: 'id' },
  );

  const marketId = await upsertGetId(
    admin, 'tv_markets',
    { name: 'TV Media National', country: 'US' },
    { timezone: DEFAULT_MARKET_TZ, postal_code: process.env[TVM_ZIP_ENV] ?? null },
  );

  return upsertGetId(
    admin, 'tv_lineups',
    { provider_id: PROVIDER_ID, provider_lineup_id: lineupProviderId },
    {
      market_id: marketId, name: `TV Media (${lineupProviderId})`, lineup_type: 'generic',
      timezone: DEFAULT_MARKET_TZ, enabled: true, status: 'idle',
    },
  );
}

async function ensureStations(
  admin: ReturnType<typeof createAdminClient>,
  lineupId: string,
  listings: ScheduleListing[],
): Promise<Map<string, string>> {
  const idByKey = new Map<string, string>();
  for (const st of stationsFrom(listings)) {
    const stationId = await upsertGetId(
      admin, 'tv_stations',
      { provider_id: PROVIDER_ID, provider_station_id: st.key },
      { name: st.displayName, network: st.displayName, call_sign: null },
    );
    idByKey.set(st.key, stationId);
    await upsertGetId(
      admin, 'tv_lineup_channels',
      { lineup_id: lineupId, station_id: stationId, provider_channel_id: st.key },
      { channel_name: st.displayName, channel_number: st.channelNumber, enabled: true },
    );
  }
  return idByKey;
}

async function ensureProgrammes(
  admin: ReturnType<typeof createAdminClient>,
  rows: Map<string, ProgrammeRow>,
): Promise<Map<string, string>> {
  const idByProviderId = new Map<string, string>();
  for (const [providerProgrammeId, row] of rows) {
    const id = await upsertGetId(
      admin, 'tv_programmes',
      { provider_id: PROVIDER_ID, provider_programme_id: providerProgrammeId },
      {
        title: row.title, episode_title: row.episodeTitle, programme_type: row.programmeType,
        season_number: row.seasonNumber, episode_number: row.episodeNumber, genres: row.genres,
        description: row.description, runtime_minutes: row.runtimeMinutes, artwork_url: row.artworkUrl,
        metadata_source: 'tv_media', metadata_updated_at: new Date().toISOString(),
      },
    );
    idByProviderId.set(providerProgrammeId, id);
  }
  return idByProviderId;
}

/**
 * Run a real TV Media ingest for `days` days starting today (UTC).
 *
 * A no-op — no DB writes at all — when no API key is configured or no
 * lineup/ZIP is set, so this is cheap to call on every cron tick while the
 * account is still being set up (CHANGES §7).
 */
export async function runTvMediaIngest(days = 14, nowMs = Date.now()): Promise<TvMediaIngestResult> {
  const adapter = tvMediaAdapterForIngest();
  if (!adapter.isConfigured()) return noRun(`No ${PROVIDER_ID} credentials configured (TVMEDIA_API_KEY unset).`);

  const lineupProviderId = process.env[TVM_LINEUP_ENV] ?? (process.env[TVM_ZIP_ENV] ? `zip:${process.env[TVM_ZIP_ENV]}` : null);
  if (!lineupProviderId) return noRun('TVMEDIA_API_KEY is set but neither TVMEDIA_LINEUP_ID nor TVMEDIA_DEFAULT_ZIP is — nothing to request.');

  const admin = createAdminClient();
  const lineupId = await ensureProviderAndLineup(admin, lineupProviderId, true);

  const monthlyLimit = Number(process.env.TVMEDIA_MONTHLY_CALL_LIMIT ?? 0) || 0;
  let budgetState: BudgetState | null = null;
  if (monthlyLimit > 0) {
    const used = await monthlyCallsUsed(admin, nowMs);
    const dayOfMonth = new Date(nowMs).getUTCDate();
    const daysInMonth = new Date(Date.UTC(new Date(nowMs).getUTCFullYear(), new Date(nowMs).getUTCMonth() + 1, 0)).getUTCDate();
    budgetState = { monthlyLimit, safetyPercent: 0.9, used, dayOfMonth, daysInMonth };
    const verdict = evaluateBudget(budgetState, days);
    if (!verdict.allowed) return noRun(`Call budget: ${verdict.reason}`);
  }

  const windowStartMs = Date.UTC(
    new Date(nowMs).getUTCFullYear(), new Date(nowMs).getUTCMonth(), new Date(nowMs).getUTCDate(),
  );
  const windowEndMs = windowStartMs + days * 86_400_000;
  const dates = Array.from({ length: days }, (_, i) => windowStartMs + i * 86_400_000);

  const daysFailed: string[] = [];
  const allListings: ScheduleListing[] = [];
  let callsUsed = 0;
  for (const dayStartMs of dates) {
    if (budgetState && !evaluateBudget({ ...budgetState, used: budgetState.used + callsUsed }, 1).allowed) {
      daysFailed.push(`${isoDate(dayStartMs)}: skipped — call budget reached`);
      continue;
    }
    const res = await adapter.fetch({
      region: 'US',
      windowStartUtc: dayStartMs,
      windowEndUtc: dayStartMs + 86_400_000,
      lineupId: process.env[TVM_LINEUP_ENV] ?? null,
      postalCode: process.env[TVM_ZIP_ENV] ?? null,
    });
    callsUsed++;
    await admin.from('tv_call_ledger').insert({
      provider_id: PROVIDER_ID, lineup_id: lineupId, endpoint: '/v1/listings',
      response_status: res.status === 'healthy' || res.status === 'unavailable' ? 200 : null,
      records_returned: res.totalNormalized, counts_against_allowance: true,
    });
    if (res.status !== 'healthy' && res.status !== 'unavailable') {
      daysFailed.push(`${isoDate(dayStartMs)}: ${res.errorCode ?? res.status} ${res.errorMessage ?? ''}`.trim());
      continue;
    }
    allListings.push(...res.listings);
  }
  const fetchComplete = daysFailed.length === 0;

  const programmeRows = new Map<string, ProgrammeRow>();
  for (const l of allListings) programmeRows.set(programmeKeyFor(l), buildProgrammeRow(l));

  const stationIdByKey = await ensureStations(admin, lineupId, allListings);
  const programmeIdByProviderId = await ensureProgrammes(admin, programmeRows);

  const fetched: FetchedAiring[] = [];
  for (const l of allListings) {
    const stationId = stationIdByKey.get(l.channelId);
    const programmeId = programmeIdByProviderId.get(programmeKeyFor(l));
    if (!stationId || !programmeId) continue;
    fetched.push(toFetchedAiring(l, stationId, programmeId));
  }

  const { data: storedRaw } = await admin
    .from('tv_airings')
    .select('id, provider_airing_id, station_id, programme_id, start_at_utc, end_at_utc, raw_hash, last_seen_at')
    .eq('lineup_id', lineupId)
    .gte('start_at_utc', new Date(windowStartMs).toISOString())
    .lt('start_at_utc', new Date(windowEndMs).toISOString());

  const stored: StoredAiring[] = (storedRaw ?? []).map((r) => ({
    id: r.id as string,
    providerAiringId: r.provider_airing_id as string | null,
    stationId: r.station_id as string,
    programmeId: r.programme_id as string,
    startAtUtc: r.start_at_utc as string,
    endAtUtc: r.end_at_utc as string | null,
    rawHash: r.raw_hash as string,
    lastSeenAt: r.last_seen_at as string,
  }));

  const plan = reconcile({
    lineupId, fetched, stored,
    windowStartUtcMs: windowStartMs, windowEndUtcMs: windowEndMs,
    fetchComplete, nowMs,
  });

  const nowIso = new Date(nowMs).toISOString();
  for (const f of plan.insert) {
    await admin.from('tv_airings').insert({
      provider_airing_id: f.providerAiringId, lineup_id: lineupId,
      station_id: f.stationId, programme_id: f.programmeId,
      start_at_utc: f.startAtUtc, end_at_utc: f.endAtUtc,
      is_complete: f.endAtUtc != null, is_live: f.isLive ?? null, is_premiere: f.isNew ?? null,
      raw_hash: f.rawHash, source: 'provider',
      fetched_at: nowIso, last_seen_at: nowIso,
    });
  }
  for (const u of plan.update) {
    await admin.from('tv_airings').update({
      start_at_utc: u.row.startAtUtc, end_at_utc: u.row.endAtUtc,
      is_complete: u.row.endAtUtc != null, is_live: u.row.isLive ?? null, is_premiere: u.row.isNew ?? null,
      raw_hash: u.row.rawHash, last_seen_at: nowIso,
    }).eq('id', u.id);
  }
  if (plan.unchanged.length > 0) {
    await admin.from('tv_airings').update({ last_seen_at: nowIso }).in('id', plan.unchanged);
  }
  if (plan.expire.length > 0) {
    await admin.from('tv_airings').delete().in('id', plan.expire);
  }

  await admin.from('tv_lineups').update({
    last_success_at: fetchComplete ? nowIso : null,
    status: fetchComplete ? 'healthy' : 'partial',
    last_error: daysFailed.length > 0 ? daysFailed.join('; ').slice(0, 500) : null,
    coverage_start_utc: new Date(windowStartMs).toISOString(),
    coverage_end_utc: new Date(windowEndMs).toISOString(),
    lifetime_call_count: callsUsed,
  }).eq('id', lineupId);

  await admin.from('tv_providers').update({
    last_success_at: fetchComplete ? nowIso : undefined,
    status: fetchComplete ? 'healthy' : 'partial',
  }).eq('id', PROVIDER_ID);

  await admin.from('tv_ingestion_runs').insert({
    provider_id: PROVIDER_ID, lineup_id: lineupId,
    started_at: nowIso, completed_at: new Date().toISOString(),
    status: fetchComplete ? 'success' : (allListings.length > 0 ? 'partial' : 'failed'), trigger: 'cron',
    requested_start_utc: new Date(windowStartMs).toISOString(),
    requested_end_utc: new Date(windowEndMs).toISOString(),
    channels_requested: stationIdByKey.size, channels_returned: stationIdByKey.size,
    calls_used: callsUsed,
    records_inserted: plan.stats.inserted, records_updated: plan.stats.updated,
    records_unchanged: plan.stats.unchanged, records_expired: plan.stats.expired,
    errors: daysFailed.map((e) => ({ message: e })),
  });

  return {
    ok: fetchComplete, ran: true,
    lineupId, windowStartUtc: new Date(windowStartMs).toISOString(), windowEndUtc: new Date(windowEndMs).toISOString(),
    daysRequested: days, daysFetched: dates.length - daysFailed.length, daysFailed,
    callsUsed, stationsDiscovered: stationIdByKey.size, totalListingsFetched: allListings.length,
    inserted: plan.stats.inserted, updated: plan.stats.updated, unchanged: plan.stats.unchanged, expired: plan.stats.expired,
  };
}
