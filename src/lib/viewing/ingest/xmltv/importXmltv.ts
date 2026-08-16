/**
 * XMLTV FILE IMPORT — TV Media's file delivery into the canonical TV tables.
 *
 * ── THE ARCHITECTURE THIS IMPLEMENTS ──────────────────────────────────────
 *
 *   TV MEDIA XMLTV FILE (bytes/stream — transport-neutral)
 *     → parseXmltvStream (bounded memory, no DTD/entity/network resolution)
 *       → normalized import batch
 *         → reconciliation against the EXISTING canonical tables
 *           (tv_providers / tv_lineups / tv_stations / tv_lineup_channels /
 *            tv_programmes / tv_airings / tv_ingestion_runs — migration 0032)
 *             → every user reads the stored truth
 *
 * The provider delivers the grid once; WatchVerd1ct imports it once; filters
 * and personalization never cost another provider call. This module performs
 * ZERO HTTP requests by construction — it imports no fetch, no adapter, no
 * egress helper; its only I/O is the injected database client and the byte
 * stream the caller hands it.
 *
 * ── SOURCE IDENTITY (the Phase-3 decision, recorded) ──────────────────────
 * The data's SOURCE is TV Media — licensing, attribution and retention follow
 * the licensor, so provider stays `tv_media` and `Where did this airing come
 * from?` has one answer at every level:
 *
 *   provider            tv_media                      (the licensor)
 *   transport           tv_airings.source = 'xmltv_file'
 *                       tv_ingestion_runs.trigger = 'xmltv_file'
 *   delivery/feed       tv_lineups.provider_lineup_id = 'xmltv:<feedId>'
 *   row provenance      provider_airing_id = 'xmltv:<feedId>:<stationSrc>:<startIso>'
 *   metadata            tv_programmes.metadata_source = 'tv_media_xmltv'
 *
 * What this deliberately does NOT do: touch the TV Media API adapter, its
 * key, its egress gate, or `hasLiveFullGridProvider()`'s API-path logic. The
 * metered API remains a separate, disabled transport; file-fed coverage
 * carries its own evidence (see xmltvCoverage.ts).
 *
 * ── IDEMPOTENCY / RECONCILIATION ──────────────────────────────────────────
 * The slot identity is `provider_airing_id` (feed + station + start): the
 * same file imported twice updates in place; a later file that changes a
 * slot's programme/timing/metadata reconciles that row rather than
 * duplicating it; in-file duplicate rows (measured in the real corpus:
 * 98/380/106 exact repeats) collapse into one. Rows the new file no longer
 * carries inside its own coverage window are pruned ONLY after a fully
 * successful import (`last_seen_at < run start`), so a bad file can never
 * destroy a previously valid guide. Lineup membership is preserved: the same
 * station/programme/time on two lineups is two airing rows on purpose.
 */
import { createHash } from 'node:crypto';
import {
  parseXmltvStream,
  type XmltvChannel,
  type XmltvHeader,
  type XmltvMalformation,
  type XmltvProgramme,
} from './parseXmltv';

export const PROVIDER_ID = 'tv_media';
export const TRANSPORT = 'xmltv_file';
export const METADATA_SOURCE = 'tv_media_xmltv';

/** Bulk-write batch size — one PostgREST round trip per batch. */
export const WRITE_BATCH = 500;

/** Reject a file whose malformed-row ratio exceeds this before writing —
 *  the gate exists to catch a SYSTEMATICALLY broken delivery, so a small
 *  absolute number of bad rows (reported, never imported) does not fail the
 *  whole file: rejection requires BOTH the ratio and the floor. */
export const MAX_MALFORMED_RATIO = 0.05;
export const MALFORMED_GRACE_COUNT = 25;

/* ── minimal structural client — the importer depends on the SHAPE it uses,
   so tests can prove the whole write path with an in-memory implementation
   and the CLI can pass the real service-role client. */
export interface DbResult<T = unknown> {
  data: T | null;
  error: { message: string } | null;
  count?: number | null;
}
export interface DbFilterChain<T = unknown> extends PromiseLike<DbResult<T>> {
  eq(col: string, v: unknown): DbFilterChain<T>;
  lt(col: string, v: unknown): DbFilterChain<T>;
  gte(col: string, v: unknown): DbFilterChain<T>;
  lte(col: string, v: unknown): DbFilterChain<T>;
  in(col: string, values: readonly unknown[]): DbFilterChain<T>;
  select(cols: string, opts?: { count?: 'exact'; head?: boolean }): DbFilterChain<T>;
}
export interface DbTable {
  upsert(rows: unknown, opts?: { onConflict?: string; ignoreDuplicates?: boolean }): DbFilterChain;
  insert(rows: unknown): DbFilterChain;
  update(values: unknown): DbFilterChain;
  delete(): DbFilterChain;
  select(cols: string, opts?: { count?: 'exact'; head?: boolean }): DbFilterChain;
}
export interface DbClient {
  from(table: string): DbTable;
}

/** A reopenable byte source: pass 1 validates and collects identities, pass 2
 *  streams airings — two bounded passes instead of one unbounded buffer. */
export type StreamFactory = () => AsyncIterable<Buffer | string>;

export interface XmltvImportOptions {
  feedId: string;
  streamFactory: StreamFactory;
  db?: DbClient;
  dryRun: boolean;
  nowMs?: number;
  /** Human name for the lineup; defaults to the feed id. */
  lineupName?: string;
}

export interface XmltvImportResult {
  ok: boolean;
  dryRun: boolean;
  feedId: string;
  sourceInfoName: string | null;
  channelsSeen: number;
  channelsAccepted: number;
  channelsRejected: number;
  programmesSeen: number;
  distinctProgrammes: number;
  airingsSeen: number;
  airingsAccepted: number;
  inFileDuplicates: number;
  movieAirings: number;
  malformed: number;
  malformedSample: XmltvMalformation[];
  coverageStartUtc: string | null;
  coverageEndUtc: string | null;
  parseMs: number;
  writeMs: number;
  dbRoundTrips: number;
  recordsInserted: number;
  recordsUpdated: number;
  recordsExpired: number;
  error: string | null;
}

/* ── normalization ──────────────────────────────────────────────────────── */

const NUMERIC_NAME = /^[\d-]+$/;

/** The display-name convention, validated against the real corpus (320 of
 *  321 channels carry exactly three names; one carries two):
 *    [0] full station name        "A&E US - Eastern Feed"
 *    [1] short name / callsign    "A&E" | "WRIC-TV"
 *    last, when purely numeric    the LINEUP-scoped channel number — the same
 *                                 station is "10" in one file and "1" in
 *                                 another, so the number belongs to
 *                                 tv_lineup_channels, never to the station. */
export function channelFacts(c: XmltvChannel): {
  name: string;
  callSign: string | null;
  channelNumber: string | null;
  iconUrl: string | null;
} {
  const name = c.displayNames[0] ?? c.id;
  const last = c.displayNames[c.displayNames.length - 1];
  const channelNumber = c.displayNames.length > 1 && last && NUMERIC_NAME.test(last) ? last : null;
  const second = c.displayNames[1] ?? null;
  const callSign = second && !NUMERIC_NAME.test(second) ? second : null;
  return { name, callSign, channelNumber, iconUrl: c.iconUrls[0] ?? null };
}

/** Render-safe artwork only: https URLs pass through; anything else is kept
 *  as source metadata by the caller and never handed to a browser. */
export function httpsOnly(url: string | null): string | null {
  return url && /^https:\/\//i.test(url) ? url : null;
}

/** Category → the canonical `programme_type` vocabulary (0032). The provider
 *  declaration is the classification: `Movie` and only `Movie` becomes a
 *  movie. Everything else maps to the closest documented type or stays null
 *  (an honest unknown) when the row carries no category at all. */
export function programmeTypeFor(categories: readonly string[]): string | null {
  if (categories.length === 0) return null;
  if (categories.includes('Movie')) return 'movie';
  if (categories.some((c) => /^sports?$/i.test(c))) return 'sports';
  if (categories.some((c) => /^news$/i.test(c))) return 'news';
  if (categories.some((c) => /^children$/i.test(c))) return 'kids';
  if (categories.some((c) => /^(specials?|paid program)$/i.test(c))) return 'special';
  return 'series';
}

/** Deterministic programme identity: the same film or episode arriving on
 *  three channels and in three lineups is ONE programme row. Title alone is
 *  not identity (two films share names across years), so the year and the
 *  episode facts participate. */
export function programmeKey(p: XmltvProgramme): string {
  const ep = p.episodeNums.map((e) => `${e.system ?? ''}=${e.value}`).sort().join(',');
  const raw = [p.title, p.subTitle ?? '', p.date ?? '', ep].join(' ');
  return `xmltv:${createHash('sha1').update(raw).digest('hex')}`;
}

export function releaseYearFrom(date: string | null): number | null {
  const m = /^((?:19|20)\d{2})/.exec(date ?? '');
  return m ? Number(m[1]) : null;
}

const seasonEpisodeFrom = (p: XmltvProgramme): { season: number | null; episode: number | null } => {
  // xmltv_ns: "season.episode.part", zero-based. onscreen: "S8/E10" etc.
  for (const e of p.episodeNums) {
    if (e.system === 'xmltv_ns') {
      const m = /^\s*(\d+)?\s*\.\s*(\d+)?/.exec(e.value);
      if (m && (m[1] != null || m[2] != null)) {
        return { season: m[1] != null ? Number(m[1]) + 1 : null, episode: m[2] != null ? Number(m[2]) + 1 : null };
      }
    }
  }
  for (const e of p.episodeNums) {
    const m = /S(\d+)\s*\/?\s*E(\d+)/i.exec(e.value);
    if (m) return { season: Number(m[1]), episode: Number(m[2]) };
  }
  return { season: null, episode: null };
};

interface ProgrammeUpsert {
  provider_id: string;
  provider_programme_id: string;
  title: string;
  episode_title: string | null;
  programme_type: string | null;
  release_year: number | null;
  season_number: number | null;
  episode_number: number | null;
  genres: string[];
  description: string | null;
  runtime_minutes: number | null;
  content_rating: string | null;
  artwork_url: string | null;
  metadata_source: string;
  metadata_updated_at: string;
}

export function programmeUpsertFor(p: XmltvProgramme, key: string, nowIso: string): ProgrammeUpsert {
  const { season, episode } = seasonEpisodeFrom(p);
  const runtime = p.stop ? Math.round((p.stop.utcMs - p.start.utcMs) / 60_000) : null;
  return {
    provider_id: PROVIDER_ID,
    provider_programme_id: key,
    title: p.title,
    episode_title: p.subTitle,
    programme_type: programmeTypeFor(p.categories),
    release_year: releaseYearFrom(p.date),
    season_number: season,
    episode_number: episode,
    genres: p.categories,
    description: p.desc,
    // Slot length is arithmetic on the provider's own start/stop — never a guess.
    runtime_minutes: runtime != null && runtime > 0 ? runtime : null,
    content_rating: p.rating,
    // Render-safe artwork only; the raw provider URL stays in the batch
    // report as source metadata (see the images policy in the PR).
    artwork_url: httpsOnly(p.iconUrls[0] ?? null),
    metadata_source: METADATA_SOURCE,
    metadata_updated_at: nowIso,
  };
}

export function airingIdFor(feedId: string, stationSrcId: string, startUtcIso: string): string {
  return `xmltv:${feedId}:${stationSrcId}:${startUtcIso}`;
}

/* ── the import ─────────────────────────────────────────────────────────── */

interface PassOne {
  header: XmltvHeader | null;
  channels: XmltvChannel[];
  programmeRows: Map<string, ProgrammeUpsert>;
  airingsSeen: number;
  movieAirings: number;
  earliestMs: number;
  latestMs: number;
  malformed: XmltvMalformation[];
  malformedCount: number;
  parseMs: number;
}

async function passOne(opts: XmltvImportOptions, nowIso: string): Promise<PassOne> {
  const t0 = Date.now();
  const channels: XmltvChannel[] = [];
  const programmeRows = new Map<string, ProgrammeUpsert>();
  const malformed: XmltvMalformation[] = [];
  let malformedCount = 0;
  let header: XmltvHeader | null = null;
  let airingsSeen = 0;
  let movieAirings = 0;
  let earliestMs = Number.POSITIVE_INFINITY;
  let latestMs = Number.NEGATIVE_INFINITY;

  await parseXmltvStream(opts.streamFactory(), {
    onHeader: (h) => { header = h; },
    onChannel: (c) => { channels.push(c); },
    onProgramme: (p) => {
      airingsSeen++;
      if (p.categories.includes('Movie')) movieAirings++;
      if (p.start.utcMs < earliestMs) earliestMs = p.start.utcMs;
      const end = p.stop?.utcMs ?? p.start.utcMs;
      if (end > latestMs) latestMs = end;
      const key = programmeKey(p);
      if (!programmeRows.has(key)) programmeRows.set(key, programmeUpsertFor(p, key, nowIso));
    },
    onMalformed: (m) => {
      malformedCount++;
      if (malformed.length < 25) malformed.push(m);
    },
  });

  return {
    header, channels, programmeRows, airingsSeen, movieAirings,
    earliestMs, latestMs, malformed, malformedCount, parseMs: Date.now() - t0,
  };
}

export async function importXmltv(opts: XmltvImportOptions): Promise<XmltvImportResult> {
  const nowMs = opts.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  let dbRoundTrips = 0;
  const result: XmltvImportResult = {
    ok: false, dryRun: opts.dryRun, feedId: opts.feedId, sourceInfoName: null,
    channelsSeen: 0, channelsAccepted: 0, channelsRejected: 0,
    programmesSeen: 0, distinctProgrammes: 0, airingsSeen: 0, airingsAccepted: 0,
    inFileDuplicates: 0, movieAirings: 0, malformed: 0, malformedSample: [],
    coverageStartUtc: null, coverageEndUtc: null,
    parseMs: 0, writeMs: 0, dbRoundTrips: 0,
    recordsInserted: 0, recordsUpdated: 0, recordsExpired: 0, error: null,
  };

  const one = await passOne(opts, nowIso);
  result.sourceInfoName = one.header?.sourceInfoName ?? null;
  result.channelsSeen = one.channels.length;
  result.programmesSeen = one.airingsSeen;
  result.airingsSeen = one.airingsSeen;
  result.distinctProgrammes = one.programmeRows.size;
  result.movieAirings = one.movieAirings;
  result.malformed = one.malformedCount;
  result.malformedSample = one.malformed;
  result.parseMs = one.parseMs;
  result.coverageStartUtc = Number.isFinite(one.earliestMs) ? new Date(one.earliestMs).toISOString() : null;
  result.coverageEndUtc = Number.isFinite(one.latestMs) ? new Date(one.latestMs).toISOString() : null;

  /* ── STRUCTURAL VALIDATION before any write. A file that fails here never
     touches the database, so the previous good guide stays intact. */
  const total = one.airingsSeen + one.malformedCount;
  if (one.header?.sourceInfoName == null) {
    result.error = 'not accepted: file carries no source-info-name (is this XMLTV?)';
    return result;
  }
  if (one.channels.length === 0 || one.airingsSeen === 0) {
    result.error = 'not accepted: no channels or no programmes parsed';
    return result;
  }
  if (total > 0 && one.malformedCount > MALFORMED_GRACE_COUNT && one.malformedCount / total > MAX_MALFORMED_RATIO) {
    result.error = `not accepted: ${one.malformedCount} malformed of ${total} rows exceeds ${MAX_MALFORMED_RATIO * 100}% (grace ${MALFORMED_GRACE_COUNT})`;
    return result;
  }

  const accepted = one.channels.filter((c) => c.id && c.displayNames.length > 0);
  result.channelsAccepted = accepted.length;
  result.channelsRejected = one.channels.length - accepted.length;

  if (opts.dryRun) {
    result.ok = true;
    return result;
  }
  const db = opts.db;
  if (!db) {
    result.error = 'no database client supplied for a non-dry-run import';
    return result;
  }

  const tw0 = Date.now();
  const call = async <T,>(p: PromiseLike<DbResult<T>>, what: string): Promise<DbResult<T>> => {
    dbRoundTrips++;
    const r = await p;
    if (r.error) throw new Error(`${what}: ${r.error.message}`);
    return r;
  };
  const chunks = <T,>(arr: T[], n: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
  };

  const runStartIso = nowIso;
  let runId: string | null = null;
  try {
    /* provider — insert-if-missing ONLY. The API transport owns this row's
       enabled/status lifecycle; a file import must never flip the API on. */
    await call(db.from('tv_providers').upsert(
      { id: PROVIDER_ID, name: 'TV Media', adapter_type: 'tv_media', enabled: false, status: 'unconfigured' },
      { onConflict: 'id', ignoreDuplicates: true },
    ), 'tv_providers insert-if-missing');

    /* run record — opened first so a failure is visible even if we die early. */
    const run = await call<{ id: string }[]>(
      db.from('tv_ingestion_runs').insert({
        provider_id: PROVIDER_ID, status: 'running', trigger: TRANSPORT,
        requested_start_utc: result.coverageStartUtc, requested_end_utc: result.coverageEndUtc,
        channels_requested: accepted.length,
      }).select('id') as unknown as PromiseLike<DbResult<{ id: string }[]>>,
      'tv_ingestion_runs insert',
    );
    runId = run.data?.[0]?.id ?? null;

    /* lineup — one per feed. */
    const lineupRes = await call<{ id: string }[]>(
      db.from('tv_lineups').upsert({
        provider_id: PROVIDER_ID, provider_lineup_id: `xmltv:${opts.feedId}`,
        name: opts.lineupName ?? `TV Media XMLTV feed ${opts.feedId}`,
        lineup_type: 'generic',
        // The feed's own clock: every timestamp in the corpus is +0000.
        timezone: 'UTC', enabled: true, status: 'refreshing',
      }, { onConflict: 'provider_id,provider_lineup_id' }).select('id') as unknown as PromiseLike<DbResult<{ id: string }[]>>,
      'tv_lineups upsert',
    );
    const lineupId = lineupRes.data?.[0]?.id;
    if (!lineupId) throw new Error('tv_lineups upsert returned no id');

    /* ── STATION IDENTITY ≠ LINEUP-CHANNEL IDENTITY ─────────────────────
       Measured on the real 10737 feed: 543 channel elements over 519
       station ids — 20 stations are declared at MULTIPLE lineup positions
       (QVC at 70, 275 AND 317) with identical metadata, 15 of them inside
       a single 500-row batch. One INSERT..ON CONFLICT statement may not
       affect the same row twice, so writing one row per ELEMENT failed the
       whole station batch (Postgres 21000) — and `provider_channel_id =
       station id` would additionally have collapsed the three positions
       into one. So:

         STATION          one row per (provider_id, provider_station_id) —
                          deduped BEFORE the batch, first declaration wins.
         LINEUP POSITION  one row per distinct (station, channel number):
                          provider_channel_id = 'xmltv:<station>:<number>'
                          ('xmltv:<station>' when the feed carries no
                          number) — deterministic from source facts, so the
                          same file reimports onto the same identities and
                          a MOVED number reconciles instead of piling up. */
    const stationIdBySrc = new Map<string, string>();
    const uniqueStations = [...new Map(accepted.map((c) => [c.id, c])).values()];
    for (const batch of chunks(uniqueStations, WRITE_BATCH)) {
      const rows = batch.map((c) => {
        const f = channelFacts(c);
        return {
          provider_id: PROVIDER_ID, provider_station_id: c.id,
          name: f.name, call_sign: f.callSign, network: f.callSign ?? f.name,
          logo_url: httpsOnly(f.iconUrl),
        };
      });
      const r = await call<{ id: string; provider_station_id: string }[]>(
        db.from('tv_stations').upsert(rows, { onConflict: 'provider_id,provider_station_id' })
          .select('id, provider_station_id') as unknown as PromiseLike<DbResult<{ id: string; provider_station_id: string }[]>>,
        'tv_stations upsert',
      );
      for (const row of r.data ?? []) stationIdBySrc.set(row.provider_station_id, row.id);
    }
    // Every distinct carried position survives; verbatim re-declarations of
    // the SAME (station, number) collapse to one row.
    const positionRows = new Map<string, Record<string, unknown>>();
    for (const c of accepted) {
      const sid = stationIdBySrc.get(c.id);
      if (!sid) continue;
      const f = channelFacts(c);
      const providerChannelId = f.channelNumber ? `xmltv:${c.id}:${f.channelNumber}` : `xmltv:${c.id}`;
      positionRows.set(providerChannelId, {
        lineup_id: lineupId, station_id: sid, provider_channel_id: providerChannelId,
        channel_number: f.channelNumber, channel_name: f.name, enabled: true,
      });
    }
    for (const batch of chunks([...positionRows.values()], WRITE_BATCH)) {
      await call(db.from('tv_lineup_channels').upsert(batch, { onConflict: 'lineup_id,station_id,provider_channel_id' }), 'tv_lineup_channels upsert');
    }

    /* programmes, batched. */
    const programmeIdByKey = new Map<string, string>();
    for (const batch of chunks([...one.programmeRows.values()], WRITE_BATCH)) {
      const r = await call<{ id: string; provider_programme_id: string }[]>(
        db.from('tv_programmes').upsert(batch, { onConflict: 'provider_id,provider_programme_id' })
          .select('id, provider_programme_id') as unknown as PromiseLike<DbResult<{ id: string; provider_programme_id: string }[]>>,
        'tv_programmes upsert',
      );
      for (const row of r.data ?? []) programmeIdByKey.set(row.provider_programme_id, row.id);
    }

    /* pass 2 — stream the file again and write airings in bounded batches.
       In-file duplicates (identical rows the provider repeats) collapse via
       a per-batch map keyed on the slot identity. */
    let pending = new Map<string, Record<string, unknown>>();
    let accepted2 = 0;
    let duplicates = 0;
    const flush = async () => {
      if (pending.size === 0) return;
      const rows = [...pending.values()];
      pending = new Map();
      await call(db.from('tv_airings').upsert(rows, { onConflict: 'lineup_id,provider_airing_id' }), 'tv_airings upsert');
    };
    await parseXmltvStream(opts.streamFactory(), {
      onProgramme: async (p) => {
        const sid = stationIdBySrc.get(p.channelId);
        const pid = programmeIdByKey.get(programmeKey(p));
        if (!sid || !pid) return; // channel-less or unknown-programme rows never invent rows
        const startIso = new Date(p.start.utcMs).toISOString();
        const providerAiringId = airingIdFor(opts.feedId, p.channelId, startIso);
        if (pending.has(providerAiringId)) duplicates++;
        pending.set(providerAiringId, {
          provider_airing_id: providerAiringId,
          lineup_id: lineupId, station_id: sid, programme_id: pid,
          start_at_utc: startIso,
          end_at_utc: p.stop ? new Date(p.stop.utcMs).toISOString() : null,
          is_complete: p.stop != null,
          provider_timezone: `utcOffsetMinutes:${p.start.offsetMinutes}`,
          lineup_timezone: 'UTC',
          is_live: p.isLive || null,
          // <premiere> and <new> both assert a first showing; <previously-shown>
          // asserts a repeat. Provider flags only — never inferred.
          is_premiere: p.isPremiere || p.isNew || null,
          is_repeat: p.previouslyShown || null,
          start_confidence: 'provider',
          fetched_at: nowIso, last_seen_at: nowIso,
          raw_hash: programmeKey(p),
          source: TRANSPORT,
        });
        accepted2++;
        if (pending.size >= WRITE_BATCH) await flush();
      },
    });
    await flush();
    result.airingsAccepted = accepted2;
    result.inFileDuplicates = duplicates;

    /* prune — ONLY after full success, ONLY this lineup, ONLY inside the
       window this file claims to cover, ONLY rows this run did not re-see. */
    const stale = await call(
      db.from('tv_airings')
        .select('id', { count: 'exact', head: true })
        .eq('lineup_id', lineupId)
        .gte('start_at_utc', result.coverageStartUtc)
        .lte('start_at_utc', result.coverageEndUtc)
        .lt('last_seen_at', runStartIso),
      'stale airing count',
    );
    result.recordsExpired = stale.count ?? 0;
    if (result.recordsExpired > 0) {
      await call(
        db.from('tv_airings').delete()
          .eq('lineup_id', lineupId)
          .gte('start_at_utc', result.coverageStartUtc)
          .lte('start_at_utc', result.coverageEndUtc)
          .lt('last_seen_at', runStartIso),
        'stale airing prune',
      );
    }

    /* lineup-position reconcile — ALSO only after full success, THIS lineup
       only, xmltv-derived rows only: a station moved from channel 275 to 280
       drops its stale 275 row while its other positions — and every other
       station's — survive untouched. Diff-based (one read, chunked deletes),
       never a blanket wipe. */
    const existingPositions = await call<{ id: string; provider_channel_id: string | null }[]>(
      db.from('tv_lineup_channels').select('id, provider_channel_id').eq('lineup_id', lineupId) as unknown as PromiseLike<DbResult<{ id: string; provider_channel_id: string | null }[]>>,
      'lineup positions read',
    );
    const stalePositionIds = (existingPositions.data ?? [])
      .filter((r) => r.provider_channel_id?.startsWith('xmltv:') && !positionRows.has(r.provider_channel_id))
      .map((r) => r.id);
    for (const batch of chunks(stalePositionIds, WRITE_BATCH)) {
      await call(db.from('tv_lineup_channels').delete().in('id', batch), 'stale lineup position prune');
    }

    /* coverage + bookkeeping — the honest window is what the file proved. */
    await call(
      db.from('tv_lineups').update({
        coverage_start_utc: result.coverageStartUtc, coverage_end_utc: result.coverageEndUtc,
        last_success_at: nowIso, status: 'idle', last_error: null,
      }).eq('id', lineupId),
      'tv_lineups coverage update',
    );
    if (runId) {
      await call(
        db.from('tv_ingestion_runs').update({
          completed_at: new Date().toISOString(), status: 'success',
          actual_start_utc: result.coverageStartUtc, actual_end_utc: result.coverageEndUtc,
          channels_returned: stationIdBySrc.size,
          records_inserted: accepted2, records_expired: result.recordsExpired,
          duration_ms: Date.now() - nowMs,
          warnings: one.malformedCount > 0 ? [{ malformed: one.malformedCount }] : [],
        }).eq('id', runId),
        'tv_ingestion_runs close',
      );
    }
    result.recordsInserted = accepted2;
    result.ok = true;
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
    if (runId) {
      try {
        dbRoundTrips++;
        await db.from('tv_ingestion_runs').update({
          completed_at: new Date().toISOString(), status: 'failed',
          errors: [{ message: result.error }],
        }).eq('id', runId);
      } catch {
        /* the failure record is best-effort; the import error stands */
      }
    }
  }
  result.writeMs = Date.now() - tw0;
  result.dbRoundTrips = dbRoundTrips;
  return result;
}
