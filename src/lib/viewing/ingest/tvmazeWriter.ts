import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { mapPool } from '@/lib/finderPool';
import { TVMAZE_CHANNELS, type TvmazeChannelDef, type TvmazeChannelGroup } from './tvmazeChannels';
import { isMajorUsNetwork, networkSlug } from './nationalNetworks';
import {
  fetchScheduleDay, fetchShowOriginalAirdates, matchDay, matchNationalDay,
  buildProgrammeRow, buildAiringRow, toFetchedAiring,
  type MatchedAiring, type NationalMatchedAiring, type ProgrammeRow,
} from './tvmazeIngest';
import { reconcile, chunk, dedupeByAiringIdentity, type StoredAiring, type FetchedAiring } from './reconcile';

/** Rows per bulk write — see the matching constant in tvMediaWriter.ts. */
const WRITE_BATCH_SIZE = 500;

/** Concurrent /shows/{id}/episodes fetches during premiere detection. A real
 *  US-national week can carry hundreds of distinct shows; one at a time with
 *  a 100ms pause between each was what turned this stage into minutes, not
 *  seconds, and was a real contributor to a production FUNCTION_INVOCATION_TIMEOUT.
 *  Still bounded, still a reasonable citizen of a free API — just not serial. */
const PREMIERE_FETCH_CONCURRENCY = 6;

/**
 * THE WRITER — the part `tvmazeIngest.ts` deliberately has none of: talking to
 * Supabase. Everything that decides WHAT to write (matching, classification,
 * premiere detection, reconciliation) already happened in pure code; this
 * module's job is only to read what's stored, run `reconcile()`, and apply
 * the resulting plan.
 */

const PROVIDER_ID = 'tvmaze';
const LINEUP_PROVIDER_ID = 'us-national';
const MARKET_NAME = 'US National';
const MARKET_TZ = 'America/New_York';

export interface ChannelCoverage {
  key: string;
  displayName: string;
  group: TvmazeChannelGroup;
  found: boolean;
  airingsIngested: number;
}

export interface IngestRunResult {
  ok: boolean;
  lineupId: string | null;
  windowStartUtc: string;
  windowEndUtc: string;
  daysRequested: number;
  daysFetched: number;
  daysFailed: string[];
  coverage: ChannelCoverage[];
  totalAiringsMatched: number;
  inserted: number;
  updated: number;
  unchanged: number;
  expired: number;
  premiereUnreliable: { channel: string; count: number; sampleReasons: string[] }[];
  error?: string;
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Upsert a row and return its id, without relying on RETURNING semantics
 *  differing across a fresh insert vs an already-existing row. */
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

async function ensureProviderAndLineup(admin: ReturnType<typeof createAdminClient>): Promise<string> {
  await admin.from('tv_providers').upsert(
    {
      id: PROVIDER_ID, name: 'TVmaze', adapter_type: 'tvmaze', enabled: true,
      status: 'healthy', last_success_at: new Date().toISOString(),
      // TVmaze is free and unmetered; a real monthly limit does not apply.
      monthly_call_limit: 0,
    },
    { onConflict: 'id' },
  );

  const marketId = await upsertGetId(
    admin, 'tv_markets',
    { name: MARKET_NAME, country: 'US' },
    { timezone: MARKET_TZ, postal_code: null },
  );

  const lineupId = await upsertGetId(
    admin, 'tv_lineups',
    { provider_id: PROVIDER_ID, provider_lineup_id: LINEUP_PROVIDER_ID },
    {
      market_id: marketId, name: 'TVmaze US National', lineup_type: 'generic',
      timezone: MARKET_TZ, enabled: true, status: 'idle',
    },
  );
  return lineupId;
}

/** Stations and programmes, BATCHED — see the matching comment and
 *  constraint reasoning in tvMediaWriter.ts's `ensureStations`. */
async function ensureStations(
  admin: ReturnType<typeof createAdminClient>,
  lineupId: string,
): Promise<Map<string, string>> {
  const idByKey = new Map<string, string>();

  for (const batch of chunk(TVMAZE_CHANNELS, WRITE_BATCH_SIZE)) {
    const rows = batch.map((ch) => ({
      provider_id: PROVIDER_ID, provider_station_id: ch.key,
      name: ch.displayName, network: ch.displayName, call_sign: null,
    }));
    const { data, error } = await admin
      .from('tv_stations')
      .upsert(rows, { onConflict: 'provider_id,provider_station_id' })
      .select('id, provider_station_id');
    if (error || !data) throw new Error(`bulk upsert into tv_stations failed: ${error?.message ?? 'no rows returned'}`);
    for (const row of data) idByKey.set(row.provider_station_id as string, row.id as string);
  }

  for (const batch of chunk(TVMAZE_CHANNELS, WRITE_BATCH_SIZE)) {
    const rows = batch.map((ch) => ({
      lineup_id: lineupId, station_id: idByKey.get(ch.key), provider_channel_id: ch.key,
      channel_name: ch.displayName, enabled: true,
    }));
    const { error } = await admin
      .from('tv_lineup_channels')
      .upsert(rows, { onConflict: 'lineup_id,station_id,provider_channel_id' });
    if (error) throw new Error(`bulk upsert into tv_lineup_channels failed: ${error.message}`);
  }

  return idByKey;
}

async function ensureProgrammes(
  admin: ReturnType<typeof createAdminClient>,
  rows: Map<string, ProgrammeRow>,
): Promise<Map<string, string>> {
  const idByProviderId = new Map<string, string>();
  const entries = [...rows.entries()];
  if (entries.length === 0) return idByProviderId;

  const metadataUpdatedAt = new Date().toISOString();
  for (const batch of chunk(entries, WRITE_BATCH_SIZE)) {
    const insertRows = batch.map(([providerProgrammeId, row]) => ({
      provider_id: PROVIDER_ID, provider_programme_id: providerProgrammeId,
      title: row.title, episode_title: row.episodeTitle, programme_type: row.programmeType,
      season_number: row.seasonNumber, episode_number: row.episodeNumber, genres: row.genres,
      description: row.description, runtime_minutes: row.runtimeMinutes, artwork_url: row.artworkUrl,
      metadata_source: 'tvmaze', metadata_updated_at: metadataUpdatedAt,
    }));
    const { data, error } = await admin
      .from('tv_programmes')
      .upsert(insertRows, { onConflict: 'provider_id,provider_programme_id' })
      .select('id, provider_programme_id');
    if (error || !data) throw new Error(`bulk upsert into tv_programmes failed: ${error?.message ?? 'no rows returned'}`);
    for (const row of data) idByProviderId.set(row.provider_programme_id as string, row.id as string);
  }
  return idByProviderId;
}

/**
 * Run a real ingest for `days` days starting today (UTC).
 *
 * Idempotent by construction: `reconcile()` (pure, already tested) is what
 * decides insert/update/unchanged/expire — this function only executes that
 * plan. A second call with unchanged upstream data produces zero inserts and
 * zero updates, only `unchanged` touches.
 */
export async function runTvmazeIngest(days = 7, nowMs = Date.now()): Promise<IngestRunResult> {
  const admin = createAdminClient();
  const windowStartMs = Date.UTC(
    new Date(nowMs).getUTCFullYear(), new Date(nowMs).getUTCMonth(), new Date(nowMs).getUTCDate(),
  );
  const windowEndMs = windowStartMs + days * 86_400_000;

  const lineupId = await ensureProviderAndLineup(admin);
  const stationIdByKey = await ensureStations(admin, lineupId);

  // ---- fetch every requested day -------------------------------------------
  const dates = Array.from({ length: days }, (_, i) => isoDate(windowStartMs + i * 86_400_000));
  const daysFailed: string[] = [];
  const allMatched: MatchedAiring[] = [];
  for (const date of dates) {
    const res = await fetchScheduleDay(date);
    if (!res.ok || !res.data) { daysFailed.push(`${date}: ${res.error ?? 'unknown error'}`); continue; }
    allMatched.push(...matchDay(res.data));
  }
  const fetchComplete = daysFailed.length === 0;

  // ---- premiere detection: one /episodes fetch per distinct show ----------
  // Bounded concurrency, not one-at-a-time-with-a-sleep: a real US-national
  // week can carry hundreds of distinct shows, and serial-with-100ms-pause
  // was minutes of dead time that (combined with everything else this route
  // does) produced a real FUNCTION_INVOCATION_TIMEOUT in production. Still a
  // reasonable citizen of a free, unmetered API (see
  // tv_providers.monthly_call_limit=0) — just concurrent rather than serial.
  const distinctShowIds = [...new Set(allMatched.map((m) => m.show.id))];
  const originalAirdatesResults = await mapPool(
    distinctShowIds, PREMIERE_FETCH_CONCURRENCY, (showId) => fetchShowOriginalAirdates(showId),
  );
  const originalAirdatesByShow = new Map<number, Map<number, string> | null>();
  distinctShowIds.forEach((showId, i) => originalAirdatesByShow.set(showId, originalAirdatesResults[i] ?? null));

  // ---- shape rows, dedupe programmes ---------------------------------------
  const programmeRows = new Map<string, ProgrammeRow>();
  const airingRows = allMatched.map((m) => {
    const showAirdates = originalAirdatesByShow.get(m.show.id) ?? null;
    const originalAirdate = showAirdates?.get(m.episode.id) ?? null;
    programmeRows.set(String(m.show.id), buildProgrammeRow(m));
    return { m, row: buildAiringRow(m, originalAirdate) };
  });

  const programmeIdByProviderId = await ensureProgrammes(admin, programmeRows);

  const fetched: FetchedAiring[] = [];
  const premiereUnreliableByChannel = new Map<string, { count: number; reasons: Set<string> }>();
  for (const { m, row } of airingRows) {
    const stationId = stationIdByKey.get(m.channel.key);
    const programmeId = programmeIdByProviderId.get(row.programmeProviderId);
    if (!stationId || !programmeId) continue;
    const fa = toFetchedAiring(row, stationId, programmeId);
    if (fa) fetched.push(fa);
    if (row.isPremiere == null && row.premiereReason) {
      const bucket = premiereUnreliableByChannel.get(m.channel.displayName) ?? { count: 0, reasons: new Set() };
      bucket.count++;
      bucket.reasons.add(row.premiereReason);
      premiereUnreliableByChannel.set(m.channel.displayName, bucket);
    }
  }

  // ---- read what's already stored in this window ---------------------------
  // SCOPED to the curated stations only. The national ingest (see
  // runTvmazeNationalIngest) writes its own synthesized `tvmaze-net:*` stations
  // onto this same lineup; without this station filter the curated reconcile
  // would sweep those national rows into `stored`, find them absent from the
  // curated `fetched` set, and EXPIRE every one of them. Scoping the read to
  // the curated station ids keeps this reconcile's behaviour toward curated
  // rows byte-for-byte identical while making it structurally incapable of
  // deleting a national row. (The national reconcile is scoped symmetrically.)
  const curatedStationIds = [...stationIdByKey.values()];
  const { data: storedRaw } = await admin
    .from('tv_airings')
    .select('id, provider_airing_id, station_id, programme_id, start_at_utc, end_at_utc, raw_hash, last_seen_at')
    .eq('lineup_id', lineupId)
    .in('station_id', curatedStationIds)
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

  // ---- apply the plan, BATCHED (see tvMediaWriter.ts for why) ----------------
  const nowIso = new Date(nowMs).toISOString();
  // Dedupe against the DB's real identity BEFORE writing — see
  // dedupeByAiringIdentity's comment. Two fetched rows can differ only by
  // provider_airing_id and still describe the same station/slot/programme.
  const dedupedInserts = dedupeByAiringIdentity(plan.insert);
  for (const batch of chunk(dedupedInserts, WRITE_BATCH_SIZE)) {
    const rows = batch.map((f) => ({
      provider_airing_id: f.providerAiringId, lineup_id: lineupId,
      station_id: f.stationId, programme_id: f.programmeId,
      start_at_utc: f.startAtUtc, end_at_utc: f.endAtUtc,
      is_complete: f.endAtUtc != null, is_premiere: f.isNew ?? null, is_repeat: f.isRepeat ?? null,
      raw_hash: f.rawHash, source: 'provider',
      fetched_at: nowIso, last_seen_at: nowIso,
    }));
    // Upsert, not insert: even after the in-batch dedupe above, a row here
    // can still collide with one already stored.
    const { error } = await admin
      .from('tv_airings')
      .upsert(rows, { onConflict: 'lineup_id,station_id,start_at_utc,programme_id' });
    if (error) throw new Error(`bulk insert into tv_airings failed: ${error.message}`);
  }
  for (const batch of chunk(plan.update, WRITE_BATCH_SIZE)) {
    const rows = batch.map((u) => ({
      id: u.id,
      start_at_utc: u.row.startAtUtc, end_at_utc: u.row.endAtUtc,
      is_complete: u.row.endAtUtc != null, is_premiere: u.row.isNew ?? null, is_repeat: u.row.isRepeat ?? null,
      raw_hash: u.row.rawHash, last_seen_at: nowIso,
    }));
    const { error } = await admin.from('tv_airings').upsert(rows, { onConflict: 'id' });
    if (error) throw new Error(`bulk update of tv_airings failed: ${error.message}`);
  }
  for (const batch of chunk(plan.unchanged, WRITE_BATCH_SIZE)) {
    await admin.from('tv_airings').update({ last_seen_at: nowIso }).in('id', batch);
  }
  for (const batch of chunk(plan.expire, WRITE_BATCH_SIZE)) {
    await admin.from('tv_airings').delete().in('id', batch);
  }

  // ---- coverage report, per configured channel ------------------------------
  const airingsByChannelKey = new Map<string, number>();
  for (const { m } of airingRows) {
    airingsByChannelKey.set(m.channel.key, (airingsByChannelKey.get(m.channel.key) ?? 0) + 1);
  }
  const coverage: ChannelCoverage[] = TVMAZE_CHANNELS.map((ch: TvmazeChannelDef) => ({
    key: ch.key, displayName: ch.displayName, group: ch.group,
    found: (airingsByChannelKey.get(ch.key) ?? 0) > 0,
    airingsIngested: airingsByChannelKey.get(ch.key) ?? 0,
  }));
  for (const ch of coverage) {
    await admin.from('tv_lineup_channels')
      .update({ no_listings: !ch.found })
      .eq('lineup_id', lineupId).eq('station_id', stationIdByKey.get(ch.key));
  }

  await admin.from('tv_lineups').update({
    last_success_at: fetchComplete ? nowIso : null,
    status: fetchComplete ? 'healthy' : 'partial',
    last_error: daysFailed.length > 0 ? daysFailed.join('; ').slice(0, 500) : null,
    coverage_start_utc: new Date(windowStartMs).toISOString(),
    coverage_end_utc: new Date(windowEndMs).toISOString(),
  }).eq('id', lineupId);

  // The run row is the DURABLE record that this provider succeeded today; the
  // ingest gate reads it to decide "already ran today". Swallowing an insert
  // error here would make a run invisible to the gate and to /api/health/tv —
  // the pipeline would silently re-ingest every tick and health would report a
  // pipeline that just ran as stale. Surface it loudly, like every other write
  // in this file.
  const { error: runRowError } = await admin.from('tv_ingestion_runs').insert({
    provider_id: PROVIDER_ID, lineup_id: lineupId,
    started_at: nowIso, completed_at: new Date().toISOString(),
    status: fetchComplete ? 'success' : 'partial', trigger: 'cron',
    requested_start_utc: new Date(windowStartMs).toISOString(),
    requested_end_utc: new Date(windowEndMs).toISOString(),
    channels_requested: TVMAZE_CHANNELS.length,
    channels_returned: coverage.filter((c) => c.found).length,
    channels_no_listings: coverage.filter((c) => !c.found).length,
    calls_used: dates.length + distinctShowIds.length,
    records_inserted: dedupedInserts.length, records_updated: plan.stats.updated,
    records_unchanged: plan.stats.unchanged, records_expired: plan.stats.expired,
    errors: daysFailed.map((e) => ({ message: e })),
  });
  if (runRowError) throw new Error(`tv_ingestion_runs insert failed: ${runRowError.message}`);

  return {
    ok: fetchComplete,
    lineupId,
    windowStartUtc: new Date(windowStartMs).toISOString(),
    windowEndUtc: new Date(windowEndMs).toISOString(),
    daysRequested: days,
    daysFetched: dates.length - daysFailed.length,
    daysFailed,
    coverage,
    totalAiringsMatched: allMatched.length,
    inserted: dedupedInserts.length, updated: plan.stats.updated,
    unchanged: plan.stats.unchanged, expired: plan.stats.expired,
    premiereUnreliable: [...premiereUnreliableByChannel.entries()].map(([channel, v]) => ({
      channel, count: v.count, sampleReasons: [...v.reasons],
    })),
  };
}

// ===========================================================================
// NATIONAL INGEST — the broad, allowlist-driven sibling of the curated run.
//
// Same provider, same `us-national` lineup, same reconcile/idempotency
// machinery — but a BROADER filter (`isMajorUsNetwork`, ~80 networks) instead
// of `matchChannel` (~11 curated Pack channels), synthesized stations
// (`tvmaze-net:<slug>`), and NO per-show premiere fan-out (which would explode
// call volume across a national day). It runs ALONGSIDE the curated ingest and
// never touches the curated stations' rows — reconciliation is scoped to the
// national station-set on both sides, so neither run can expire the other's
// airings. This only BROADENS ingest; no read path changes here.
// ===========================================================================

/** The `tv_stations.provider_station_id` prefix that marks a synthesized
 *  national station, distinguishing it from every curated channel key. Used to
 *  scope the national reconcile's stored-read to national rows only. */
const NATIONAL_STATION_PREFIX = 'tvmaze-net:';

export interface NationalIngestRunResult {
  ok: boolean;
  lineupId: string | null;
  windowStartUtc: string;
  windowEndUtc: string;
  daysRequested: number;
  daysFetched: number;
  daysFailed: string[];
  networksIngested: number;
  totalAiringsMatched: number;
  inserted: number;
  updated: number;
  unchanged: number;
  expired: number;
  error?: string;
}

/** Synthesized national stations, BATCHED — mirrors `ensureStations`, but the
 *  station set is discovered from the day's networks rather than a fixed
 *  config. One station per distinct network, keyed `tvmaze-net:<slug>`. */
async function ensureNationalStations(
  admin: ReturnType<typeof createAdminClient>,
  lineupId: string,
  channels: { key: string; displayName: string }[],
): Promise<Map<string, string>> {
  const idByKey = new Map<string, string>();
  if (channels.length === 0) return idByKey;

  for (const batch of chunk(channels, WRITE_BATCH_SIZE)) {
    const rows = batch.map((ch) => ({
      provider_id: PROVIDER_ID, provider_station_id: ch.key,
      name: ch.displayName, network: ch.displayName, call_sign: null,
    }));
    const { data, error } = await admin
      .from('tv_stations')
      .upsert(rows, { onConflict: 'provider_id,provider_station_id' })
      .select('id, provider_station_id');
    if (error || !data) throw new Error(`bulk upsert into tv_stations (national) failed: ${error?.message ?? 'no rows returned'}`);
    for (const row of data) idByKey.set(row.provider_station_id as string, row.id as string);
  }

  for (const batch of chunk(channels, WRITE_BATCH_SIZE)) {
    const rows = batch.map((ch) => ({
      lineup_id: lineupId, station_id: idByKey.get(ch.key), provider_channel_id: ch.key,
      channel_name: ch.displayName, enabled: true,
    }));
    const { error } = await admin
      .from('tv_lineup_channels')
      .upsert(rows, { onConflict: 'lineup_id,station_id,provider_channel_id' });
    if (error) throw new Error(`bulk upsert into tv_lineup_channels (national) failed: ${error.message}`);
  }

  return idByKey;
}

/**
 * Run the NATIONAL ingest for `days` days starting today (UTC).
 *
 * Idempotent by the same construction as `runTvmazeIngest`: `reconcile()`
 * decides insert/update/unchanged/expire; a second run over unchanged upstream
 * data nets zero inserts. Premiere/repeat are left null for every national row
 * (honest unknown) — the per-show original-airdate fan-out is deliberately
 * skipped here because a national day carries far more distinct shows than the
 * curated set, and that fan-out is a curated-path nicety, not a correctness
 * requirement.
 */
export async function runTvmazeNationalIngest(days = 3, nowMs = Date.now()): Promise<NationalIngestRunResult> {
  const admin = createAdminClient();
  const windowStartMs = Date.UTC(
    new Date(nowMs).getUTCFullYear(), new Date(nowMs).getUTCMonth(), new Date(nowMs).getUTCDate(),
  );
  const windowEndMs = windowStartMs + days * 86_400_000;

  const lineupId = await ensureProviderAndLineup(admin);

  // ---- fetch every requested day (the SAME national feed as the curated run) -
  const dates = Array.from({ length: days }, (_, i) => isoDate(windowStartMs + i * 86_400_000));
  const daysFailed: string[] = [];
  const allMatched: NationalMatchedAiring[] = [];
  for (const date of dates) {
    const res = await fetchScheduleDay(date, 'US');
    if (!res.ok || !res.data) { daysFailed.push(`${date}: ${res.error ?? 'unknown error'}`); continue; }
    // BROADER than matchChannel: keep every airing on a major US network.
    allMatched.push(...matchNationalDay(res.data, isMajorUsNetwork, networkSlug));
  }
  const fetchComplete = daysFailed.length === 0;

  // ---- synthesize one station per distinct network -------------------------
  const channelByKey = new Map<string, { key: string; displayName: string }>();
  for (const m of allMatched) if (!channelByKey.has(m.channel.key)) channelByKey.set(m.channel.key, m.channel);
  const stationIdByKey = await ensureNationalStations(admin, lineupId, [...channelByKey.values()]);

  // ---- shape rows, dedupe programmes (NO premiere fan-out) ------------------
  const programmeRows = new Map<string, ProgrammeRow>();
  const airingRows = allMatched.map((m) => {
    programmeRows.set(String(m.show.id), buildProgrammeRow(m));
    // originalAirdate = null → isPremiere/isRepeat null (honest unknown).
    // stationScopedId: the national airing id folds in the station key so the
    // same syndicated episode on two networks the same day stays two distinct
    // rows and never collides on tv_airings (lineup_id, provider_airing_id).
    return { m, row: buildAiringRow(m, null, { stationScopedId: true }) };
  });
  const programmeIdByProviderId = await ensureProgrammes(admin, programmeRows);

  const fetched: FetchedAiring[] = [];
  for (const { m, row } of airingRows) {
    const stationId = stationIdByKey.get(m.channel.key);
    const programmeId = programmeIdByProviderId.get(row.programmeProviderId);
    if (!stationId || !programmeId) continue;
    const fa = toFetchedAiring(row, stationId, programmeId);
    if (fa) fetched.push(fa);
  }

  // ---- read stored, SCOPED to national stations only -----------------------
  // The scoping that makes cross-deletion impossible: we read only rows on the
  // synthesized `tvmaze-net:*` stations, so the curated stations' airings never
  // enter this reconcile's `stored` and can never be expired by it. We resolve
  // the FULL national station-set from tv_stations (not just this run's
  // networks) so a network that has dropped off the schedule still has its
  // now-stale rows reconciled/expired correctly.
  const { data: nationalStationRows } = await admin
    .from('tv_stations')
    .select('id, provider_station_id')
    .eq('provider_id', PROVIDER_ID)
    .like('provider_station_id', `${NATIONAL_STATION_PREFIX}%`);
  const nationalStationIds = (nationalStationRows ?? []).map((r) => r.id as string);

  const stored: StoredAiring[] = [];
  if (nationalStationIds.length > 0) {
    const { data: storedRaw } = await admin
      .from('tv_airings')
      .select('id, provider_airing_id, station_id, programme_id, start_at_utc, end_at_utc, raw_hash, last_seen_at')
      .eq('lineup_id', lineupId)
      .in('station_id', nationalStationIds)
      .gte('start_at_utc', new Date(windowStartMs).toISOString())
      .lt('start_at_utc', new Date(windowEndMs).toISOString());
    for (const r of storedRaw ?? []) {
      stored.push({
        id: r.id as string,
        providerAiringId: r.provider_airing_id as string | null,
        stationId: r.station_id as string,
        programmeId: r.programme_id as string,
        startAtUtc: r.start_at_utc as string,
        endAtUtc: r.end_at_utc as string | null,
        rawHash: r.raw_hash as string,
        lastSeenAt: r.last_seen_at as string,
      });
    }
  }

  const plan = reconcile({
    lineupId, fetched, stored,
    windowStartUtcMs: windowStartMs, windowEndUtcMs: windowEndMs,
    fetchComplete, nowMs,
  });

  // ---- apply the plan, BATCHED (identical machinery to the curated run) -----
  const nowIso = new Date(nowMs).toISOString();
  const dedupedInserts = dedupeByAiringIdentity(plan.insert);
  for (const batch of chunk(dedupedInserts, WRITE_BATCH_SIZE)) {
    const rows = batch.map((f) => ({
      provider_airing_id: f.providerAiringId, lineup_id: lineupId,
      station_id: f.stationId, programme_id: f.programmeId,
      start_at_utc: f.startAtUtc, end_at_utc: f.endAtUtc,
      is_complete: f.endAtUtc != null, is_premiere: f.isNew ?? null, is_repeat: f.isRepeat ?? null,
      raw_hash: f.rawHash, source: 'provider',
      fetched_at: nowIso, last_seen_at: nowIso,
    }));
    const { error } = await admin
      .from('tv_airings')
      .upsert(rows, { onConflict: 'lineup_id,station_id,start_at_utc,programme_id' });
    if (error) throw new Error(`bulk insert into tv_airings (national) failed: ${error.message}`);
  }
  for (const batch of chunk(plan.update, WRITE_BATCH_SIZE)) {
    const rows = batch.map((u) => ({
      id: u.id,
      start_at_utc: u.row.startAtUtc, end_at_utc: u.row.endAtUtc,
      is_complete: u.row.endAtUtc != null, is_premiere: u.row.isNew ?? null, is_repeat: u.row.isRepeat ?? null,
      raw_hash: u.row.rawHash, last_seen_at: nowIso,
    }));
    const { error } = await admin.from('tv_airings').upsert(rows, { onConflict: 'id' });
    if (error) throw new Error(`bulk update of tv_airings (national) failed: ${error.message}`);
  }
  for (const batch of chunk(plan.unchanged, WRITE_BATCH_SIZE)) {
    await admin.from('tv_airings').update({ last_seen_at: nowIso }).in('id', batch);
  }
  for (const batch of chunk(plan.expire, WRITE_BATCH_SIZE)) {
    await admin.from('tv_airings').delete().in('id', batch);
  }

  // The durable run record. `trigger: 'national'` is the distinct marker that
  // separates a national run from the curated 'cron' run in tv_ingestion_runs,
  // so the two are individually observable. Surface an insert failure loudly,
  // exactly like the curated run does.
  const { error: runRowError } = await admin.from('tv_ingestion_runs').insert({
    provider_id: PROVIDER_ID, lineup_id: lineupId,
    started_at: nowIso, completed_at: new Date().toISOString(),
    status: fetchComplete ? 'success' : 'partial', trigger: 'national',
    requested_start_utc: new Date(windowStartMs).toISOString(),
    requested_end_utc: new Date(windowEndMs).toISOString(),
    channels_requested: channelByKey.size,
    channels_returned: channelByKey.size,
    channels_no_listings: 0,
    calls_used: dates.length,
    records_inserted: dedupedInserts.length, records_updated: plan.stats.updated,
    records_unchanged: plan.stats.unchanged, records_expired: plan.stats.expired,
    errors: daysFailed.map((e) => ({ message: e })),
  });
  if (runRowError) throw new Error(`tv_ingestion_runs insert (national) failed: ${runRowError.message}`);

  return {
    ok: fetchComplete,
    lineupId,
    windowStartUtc: new Date(windowStartMs).toISOString(),
    windowEndUtc: new Date(windowEndMs).toISOString(),
    daysRequested: days,
    daysFetched: dates.length - daysFailed.length,
    daysFailed,
    networksIngested: channelByKey.size,
    totalAiringsMatched: allMatched.length,
    inserted: dedupedInserts.length, updated: plan.stats.updated,
    unchanged: plan.stats.unchanged, expired: plan.stats.expired,
  };
}
