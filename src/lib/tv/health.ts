import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { TVM_API_KEY_ENV, TVM_ZIP_ENV, TVM_LINEUP_ENV } from '@/lib/viewing/adapters/tvMedia';

/**
 * OPERATOR HEALTH FOR THE TV LISTINGS PIPELINE — facts, not vibes.
 *
 * Built because the pipeline broke silently for three days: the GitHub cron
 * 401'd every hour, TV Media stopped refreshing with no run rows to show for
 * it, and the packs rendered "nothing ingested" while the database held
 * thousands of rows they weren't linked to. Every one of those failure modes
 * is now a queryable field here.
 *
 * SAFE TO SERVE PUBLICLY: timestamps, counts, coverage windows, boolean
 * configuration presence, and sanitized error CODES. Never key material,
 * never secret values, never raw provider payloads. The run/ledger tables it
 * reads are service-role-only; this module is their sanitized window.
 */

export interface ProviderHealth {
  providerId: string;
  configured: boolean;
  lastSuccessAt: string | null;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  /** Machine-readable cause from the last non-success run (e.g. missing_key). */
  lastErrorCode: string | null;
  coverageStartUtc: string | null;
  coverageEndUtc: string | null;
  channelsRequested: number | null;
  channelsReturned: number | null;
}

export interface PackHealth {
  slug: string;
  stationCount: number;
  futureAirings: number;
  nextAiringUtc: string | null;
}

export interface TvHealth {
  generatedAt: string;
  providers: ProviderHealth[];
  packs: PackHealth[];
  /**
   * Latest ingest tick of ANY status. Every authenticated pass through the
   * gated ingest now writes a run row (success, partial, failed or skipped),
   * so a long gap here means NO trigger is reaching production at all —
   * which is what the GitHub 401 looked like from the inside.
   */
  lastIngestTickAt: string | null;
  /** True when the newest tick is older than the external hourly trigger
   *  plus generous slack — i.e. the hourly GitHub cron is not landing. */
  externalHourlyTriggerAppearsBroken: boolean;
  verdict: 'healthy' | 'stale' | 'degraded';
  notes: string[];
}

/** Staleness rules, pure for tests. */
export function tvHealthVerdict(input: {
  nowMs: number;
  tvmazeLastSuccessAt: string | null;
  tvMediaConfigured: boolean;
  tvMediaLastSuccessAt: string | null;
  coverageEndUtc: string | null;
  totalFutureAirings: number;
}): { verdict: 'healthy' | 'stale' | 'degraded'; notes: string[] } {
  const notes: string[] = [];
  const DAY = 86_400_000;
  let stale = false;
  let degraded = false;

  if (!input.tvmazeLastSuccessAt || input.nowMs - Date.parse(input.tvmazeLastSuccessAt) > 2 * DAY) {
    degraded = true;
    notes.push('TVmaze has not succeeded in over 2 days.');
  }
  if (!input.tvMediaConfigured) {
    degraded = true;
    notes.push('TV Media is not configured in this environment (no API key) — Hallmark coverage depends on it.');
  } else if (!input.tvMediaLastSuccessAt || input.nowMs - Date.parse(input.tvMediaLastSuccessAt) > DAY + 2 * 3_600_000) {
    stale = true;
    notes.push('TV Media has not refreshed in over ~26 hours.');
  }
  if (input.coverageEndUtc && Date.parse(input.coverageEndUtc) < input.nowMs + DAY) {
    stale = true;
    notes.push('Schedule coverage ends within 24 hours.');
  }
  if (input.totalFutureAirings === 0) {
    degraded = true;
    notes.push('No future airings stored at all.');
  }
  return { verdict: degraded ? 'degraded' : stale ? 'stale' : 'healthy', notes };
}

export async function getTvHealth(): Promise<TvHealth> {
  const admin = createAdminClient();
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const [{ data: lineups }, { data: runs }, { data: packs }, { data: packStations }, { data: stations }] =
    await Promise.all([
      admin.from('tv_lineups').select('provider_id, last_success_at, coverage_start_utc, coverage_end_utc'),
      admin
        .from('tv_ingestion_runs')
        .select('provider_id, started_at, status, channels_requested, channels_returned, errors')
        .order('started_at', { ascending: false })
        .limit(60),
      admin.from('packs').select('id, slug'),
      admin.from('pack_stations').select('pack_id, station_id'),
      admin.from('tv_stations').select('id, provider_id, name'),
    ]);

  type RunRow = {
    provider_id: string; started_at: string; status: string;
    channels_requested: number | null; channels_returned: number | null;
    errors: Array<{ code?: string; message?: string }> | null;
  };
  const runsByProvider = new Map<string, RunRow[]>();
  for (const r of (runs ?? []) as RunRow[]) {
    const list = runsByProvider.get(r.provider_id) ?? [];
    list.push(r);
    runsByProvider.set(r.provider_id, list);
  }

  const lineupByProvider = new Map(
    ((lineups ?? []) as {
      provider_id: string; last_success_at: string | null;
      coverage_start_utc: string | null; coverage_end_utc: string | null;
    }[]).map((l) => [l.provider_id, l]),
  );

  function providerHealth(providerId: string, configured: boolean): ProviderHealth {
    const lineup = lineupByProvider.get(providerId);
    const providerRuns = runsByProvider.get(providerId) ?? [];
    const lastRun = providerRuns[0] ?? null;
    const lastSuccess = providerRuns.find((r) => r.status === 'success' || r.status === 'partial') ?? null;
    const lastBad = providerRuns.find((r) => r.status !== 'success' && r.status !== 'partial') ?? null;
    return {
      providerId,
      configured,
      lastSuccessAt: lastSuccess?.started_at ?? lineup?.last_success_at ?? null,
      lastRunAt: lastRun?.started_at ?? null,
      lastRunStatus: lastRun?.status ?? null,
      lastErrorCode: lastBad?.errors?.[0]?.code ?? null,
      coverageStartUtc: lineup?.coverage_start_utc ?? null,
      coverageEndUtc: lineup?.coverage_end_utc ?? null,
      channelsRequested: lastSuccess?.channels_requested ?? null,
      channelsReturned: lastSuccess?.channels_returned ?? null,
    };
  }

  const tvMediaConfigured = Boolean(process.env[TVM_API_KEY_ENV]) &&
    Boolean(process.env[TVM_LINEUP_ENV] ?? process.env[TVM_ZIP_ENV]);
  const providers = [providerHealth('tvmaze', true), providerHealth('tv_media', tvMediaConfigured)];

  // Per-pack future counts — the customer-facing truth, one head-count per pack.
  const stationsByPack = new Map<string, string[]>();
  for (const ps of (packStations ?? []) as { pack_id: string; station_id: string }[]) {
    const list = stationsByPack.get(ps.pack_id) ?? [];
    list.push(ps.station_id);
    stationsByPack.set(ps.pack_id, list);
  }
  const packHealths: PackHealth[] = [];
  for (const p of (packs ?? []) as { id: string; slug: string }[]) {
    const stationIds = stationsByPack.get(p.id) ?? [];
    let futureAirings = 0;
    let nextAiringUtc: string | null = null;
    if (stationIds.length > 0) {
      const { count } = await admin
        .from('tv_airings')
        .select('id', { count: 'exact', head: true })
        .in('station_id', stationIds)
        .gte('start_at_utc', nowIso);
      futureAirings = count ?? 0;
      const { data: next } = await admin
        .from('tv_airings')
        .select('start_at_utc')
        .in('station_id', stationIds)
        .gte('start_at_utc', nowIso)
        .order('start_at_utc', { ascending: true })
        .limit(1);
      nextAiringUtc = (next?.[0]?.start_at_utc as string | undefined) ?? null;
    }
    packHealths.push({ slug: p.slug, stationCount: stationIds.length, futureAirings, nextAiringUtc });
  }

  const { count: totalFuture } = await admin
    .from('tv_airings')
    .select('id', { count: 'exact', head: true })
    .gte('start_at_utc', nowIso);

  const allRuns = (runs ?? []) as RunRow[];
  const lastIngestTickAt = allRuns[0]?.started_at ?? null;
  const externalHourlyTriggerAppearsBroken =
    lastIngestTickAt == null || nowMs - Date.parse(lastIngestTickAt) > 3 * 3_600_000;

  const tvMedia = providers[1]!;
  const tvmaze = providers[0]!;
  const { verdict, notes } = tvHealthVerdict({
    nowMs,
    tvmazeLastSuccessAt: tvmaze.lastSuccessAt,
    tvMediaConfigured,
    tvMediaLastSuccessAt: tvMedia.lastSuccessAt,
    coverageEndUtc: tvMedia.coverageEndUtc ?? tvmaze.coverageEndUtc,
    totalFutureAirings: totalFuture ?? 0,
  });
  if (externalHourlyTriggerAppearsBroken) {
    notes.push(
      'No ingest tick recorded in the last 3 hours — the external hourly trigger (GitHub Actions) is not reaching production. Its last known failure mode: HTTP 401, meaning the repository CRON_SECRET does not match the deployment’s.',
    );
  }
  void stations; // reserved for future per-provider channel detail

  return {
    generatedAt: nowIso,
    providers,
    packs: packHealths,
    lastIngestTickAt,
    externalHourlyTriggerAppearsBroken,
    verdict,
    notes,
  };
}

/**
 * The compact customer-facing staleness fact for a pack page, computed from
 * PUBLIC tables only (tv_lineups is world-readable) so the pack page can ask
 * with its ordinary request-scoped client.
 */
export function coverageIsStale(coverageEndUtc: string | null, nowMs = Date.now()): boolean {
  if (!coverageEndUtc) return true;
  return Date.parse(coverageEndUtc) < nowMs + 86_400_000;
}
