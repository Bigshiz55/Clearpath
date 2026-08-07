/**
 * PER-CHANNEL TV COVERAGE AUDIT (pure).
 *
 * The existing health surface reports per-PROVIDER totals (channelsRequested /
 * channelsReturned) and per-PACK head-counts, but nothing said, for a single
 * configured channel, "is it dark, and why." `getTvHealth` even reads
 * `tv_stations` and then throws it away (`void stations; // reserved for future
 * per-provider channel detail`). This is that missing surface: it enumerates
 * the configured lineup and classifies every channel with a NAMED reason, so a
 * dark channel is never collapsed into a silent "No listings."
 *
 * It is deliberately pure — it takes already-fetched rows and a clock and
 * returns the matrix + summary. The route (src/app/api/tv/coverage/channels)
 * does the I/O; the classification and the counting live here where they can be
 * unit- and property-tested without a database.
 *
 * A channel counts as FUNCTIONING (HEALTHY) only when the whole chain holds:
 * it is configured, its source ran, a station row exists for it, and that
 * station has at least one future airing. A logo or a display name is NOT
 * support — see `status` below for every way the chain can break, each with
 * its own code rather than a shared "empty".
 */

/** Every distinct reason a configured channel is or is not showing programming. */
export type CoverageStatus =
  | 'HEALTHY' // configured, ingested, has future airings
  | 'SOURCE_EMPTY' // station row exists, but zero future airings in the horizon
  | 'NO_SOURCE' // configured, source ran, but returned no station for it
  | 'STALE' // has airings, but the source has not refreshed within the freshness window
  | 'INGEST_FAILED' // the source's most recent run failed
  | 'INGEST_DISABLED' // ingestion is turned off (e.g. DATA_MODE unset) — not the channel's fault
  | 'UNMAPPED'; // a station ingested that maps to no configured channel/pack

export interface ConfiguredChannel {
  /** Stable id — TVmaze `provider_station_id` (the config key) or TV Media call sign. */
  id: string;
  displayName: string;
  /** Which adapter is expected to supply this channel's schedule. */
  sourceAdapter: 'tvmaze' | 'tv_media';
  /** Free-form grouping (pack / family) for reporting. */
  group: string;
}

/** A station row as stored by an ingest writer (tv_stations). */
export interface IngestedStation {
  providerId: string;
  providerStationId: string;
  name: string;
}

/** Minimal airing shape the audit needs (tv_airings). */
export interface AuditAiring {
  providerId: string;
  stationProviderId: string; // the station's provider_station_id this airing belongs to
  startAtUtcMs: number;
}

/** The latest ingestion run per provider (tv_ingestion_runs). */
export interface ProviderRun {
  providerId: string;
  status: 'success' | 'partial' | 'failed' | 'skipped';
  startedAtMs: number | null;
}

export interface CoverageRow {
  channelId: string;
  displayName: string;
  group: string;
  sourceAdapter: string;
  /** Did a station row actually ingest for this channel? */
  stationIngested: boolean;
  lastIngestUtcMs: number | null;
  nextAiringUtcMs: number | null;
  airings12h: number;
  airings24h: number;
  airings48h: number;
  status: CoverageStatus;
  /** One human-readable sentence naming exactly why the status is what it is. */
  reason: string;
}

export interface CoverageSummary {
  totalConfigured: number;
  healthy: number;
  sourceEmpty: number;
  noSource: number;
  stale: number;
  ingestFailed: number;
  ingestDisabled: number;
  unmapped: number;
  /** HEALTHY as a percentage of configured channels (0–100, integer). */
  healthyPct: number;
}

export interface CoverageMatrix {
  generatedAtUtcMs: number;
  ingestionDisabled: boolean;
  summary: CoverageSummary;
  rows: CoverageRow[];
}

const HOUR = 3_600_000;
/** A source that has not produced a run this recently is treated as STALE. */
export const FRESHNESS_WINDOW_MS = 26 * HOUR; // a daily source plus a 2h grace

export interface CoverageInput {
  configured: ConfiguredChannel[];
  stations: IngestedStation[];
  airings: AuditAiring[];
  runs: ProviderRun[];
  nowMs: number;
  /** When true (DATA_MODE unset etc.), every dark channel is INGEST_DISABLED, not its own fault. */
  ingestionDisabled: boolean;
}

/**
 * Classify the whole configured lineup. Deterministic and total: every
 * configured channel gets exactly one row, and every ingested station that maps
 * to no configured channel is reported as an extra UNMAPPED row so nothing that
 * physically ingested is invisible.
 */
export function buildCoverageMatrix(input: CoverageInput): CoverageMatrix {
  const { configured, stations, airings, runs, nowMs, ingestionDisabled } = input;

  const latestRunByProvider = new Map<string, ProviderRun>();
  for (const r of runs) {
    const prev = latestRunByProvider.get(r.providerId);
    if (!prev || (r.startedAtMs ?? 0) > (prev.startedAtMs ?? 0)) latestRunByProvider.set(r.providerId, r);
  }

  // Index airings by (provider, stationProviderId) once.
  const airingsByStation = new Map<string, number[]>();
  for (const a of airings) {
    const key = `${a.providerId}|${a.stationProviderId}`;
    const arr = airingsByStation.get(key);
    if (arr) arr.push(a.startAtUtcMs);
    else airingsByStation.set(key, [a.startAtUtcMs]);
  }
  const stationExists = new Set(stations.map((s) => `${s.providerId}|${s.providerStationId}`));

  const rows: CoverageRow[] = configured.map((ch) => {
    const key = `${ch.sourceAdapter}|${ch.id}`;
    const run = latestRunByProvider.get(ch.sourceAdapter) ?? null;
    const starts = (airingsByStation.get(key) ?? []).filter((ms) => ms >= nowMs).sort((a, b) => a - b);
    const within = (h: number) => starts.filter((ms) => ms < nowMs + h * HOUR).length;
    const row: Omit<CoverageRow, 'status' | 'reason'> = {
      channelId: ch.id,
      displayName: ch.displayName,
      group: ch.group,
      sourceAdapter: ch.sourceAdapter,
      stationIngested: stationExists.has(key),
      lastIngestUtcMs: run?.startedAtMs ?? null,
      nextAiringUtcMs: starts[0] ?? null,
      airings12h: within(12),
      airings24h: within(24),
      airings48h: within(48),
    };
    const { status, reason } = classify(row, run, ingestionDisabled, nowMs);
    return { ...row, status, reason };
  });

  // Extra rows for stations that ingested but map to no configured channel.
  const configuredKeys = new Set(configured.map((c) => `${c.sourceAdapter}|${c.id}`));
  for (const s of stations) {
    const key = `${s.providerId}|${s.providerStationId}`;
    if (configuredKeys.has(key)) continue;
    const starts = (airingsByStation.get(key) ?? []).filter((ms) => ms >= nowMs).sort((a, b) => a - b);
    const within = (h: number) => starts.filter((ms) => ms < nowMs + h * HOUR).length;
    rows.push({
      channelId: s.providerStationId,
      displayName: s.name,
      group: 'unmapped',
      sourceAdapter: s.providerId,
      stationIngested: true,
      lastIngestUtcMs: latestRunByProvider.get(s.providerId)?.startedAtMs ?? null,
      nextAiringUtcMs: starts[0] ?? null,
      airings12h: within(12),
      airings24h: within(24),
      airings48h: within(48),
      status: 'UNMAPPED',
      reason: `Ingested from ${s.providerId} but maps to no configured channel — it will not appear in a pack, though it can still show in the full guide.`,
    });
  }

  const count = (s: CoverageStatus) => rows.filter((r) => r.status === s).length;
  const healthy = count('HEALTHY');
  const summary: CoverageSummary = {
    totalConfigured: configured.length,
    healthy,
    sourceEmpty: count('SOURCE_EMPTY'),
    noSource: count('NO_SOURCE'),
    stale: count('STALE'),
    ingestFailed: count('INGEST_FAILED'),
    ingestDisabled: count('INGEST_DISABLED'),
    unmapped: count('UNMAPPED'),
    healthyPct: configured.length === 0 ? 0 : Math.round((healthy / configured.length) * 100),
  };

  return { generatedAtUtcMs: nowMs, ingestionDisabled, summary, rows };
}

function classify(
  row: Omit<CoverageRow, 'status' | 'reason'>,
  run: ProviderRun | null,
  ingestionDisabled: boolean,
  nowMs: number,
): { status: CoverageStatus; reason: string } {
  const hasFuture = row.airings48h > 0 || row.nextAiringUtcMs != null;

  // A channel already carrying future airings is HEALTHY regardless of the
  // ingest switch — the data is there to render. Only decide "why is it dark"
  // for channels that have nothing.
  if (hasFuture) {
    const fresh = row.lastIngestUtcMs != null && nowMs - row.lastIngestUtcMs <= FRESHNESS_WINDOW_MS;
    if (fresh) {
      return { status: 'HEALTHY', reason: `${row.airings48h} airing(s) in the next 48h from a fresh ${row.sourceAdapter} ingest.` };
    }
    return {
      status: 'STALE',
      reason: row.lastIngestUtcMs == null
        ? `Has airings but no recorded ${row.sourceAdapter} run — freshness unknown.`
        : `Has airings, but the last ${row.sourceAdapter} ingest was over ${Math.round((nowMs - row.lastIngestUtcMs) / HOUR)}h ago.`,
    };
  }

  // From here down the channel is dark. Attribute it precisely.
  if (ingestionDisabled) {
    return {
      status: 'INGEST_DISABLED',
      reason: `Ingestion is disabled on this deployment (e.g. DATA_MODE unset), so no fresh ${row.sourceAdapter} data can arrive — not a channel or mapping fault.`,
    };
  }
  if (run && run.status === 'failed') {
    return { status: 'INGEST_FAILED', reason: `The most recent ${row.sourceAdapter} ingest run FAILED; no airings could be stored.` };
  }
  if (!row.stationIngested) {
    return {
      status: 'NO_SOURCE',
      reason: `${row.sourceAdapter} ran but returned no station for this channel — the source does not carry it for this lineup/region.`,
    };
  }
  return {
    status: 'SOURCE_EMPTY',
    reason: `A station ingested for this channel, but it has zero future airings in the 48h horizon.`,
  };
}
