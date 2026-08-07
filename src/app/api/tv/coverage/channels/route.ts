import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizeTvAdmin } from '@/lib/tv/platform/adminAuth';
import { resolveDataMode } from '@/lib/tv/dataMode';
import { configuredLineup } from '@/lib/tv/coverageLineup';
import {
  buildCoverageMatrix,
  type IngestedStation,
  type AuditAiring,
  type ProviderRun,
} from '@/lib/tv/coverageAudit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * PER-CHANNEL TV COVERAGE AUDIT — founder/admin only.
 *
 * Answers "why is <channel> empty?" for the WHOLE configured lineup at once,
 * without reading code or the database by hand. It enumerates every configured
 * channel (TVmaze's fixed list + TV Media's pack-linkable call signs), joins
 * that against what actually ingested (tv_stations / tv_airings) and the latest
 * ingest run per source (tv_ingestion_runs), and returns one row per channel
 * with a NAMED status + reason — never a silent "No listings."
 *
 * Pure classification + counting live in src/lib/tv/coverageAudit.ts (unit- and
 * property-tested); this route only does the I/O and the founder gate.
 */
export async function GET(req: Request) {
  const auth = await authorizeTvAdmin(req);
  if (!auth.authorized) {
    // Hidden behind the same gate as the other TV admin routes; a 403 with a
    // reason that never reveals a secret.
    return NextResponse.json({ error: auth.reason }, { status: 403 });
  }

  // The authoritative configured lineup — assembled in a lib from the same
  // constants the ingest scheduler/writers use (kept out of this route so it
  // stays free of any `@/lib/viewing/ingest/*` import; see coverageLineup.ts).
  const configured = configuredLineup();

  const nowMs = Date.now();
  const horizonEndIso = new Date(nowMs + 48 * 3_600_000).toISOString();

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: 'Admin Supabase client unavailable (SUPABASE_SERVICE_ROLE_KEY not set).' }, { status: 503 });
  }

  const [{ data: stationRows }, { data: airingRows }, { data: runRows }] = await Promise.all([
    admin.from('tv_stations').select('id, provider_id, provider_station_id, name'),
    admin
      .from('tv_airings')
      .select('station_id, start_at_utc')
      .gte('start_at_utc', new Date(nowMs).toISOString())
      .lt('start_at_utc', horizonEndIso)
      .limit(20000),
    admin.from('tv_ingestion_runs').select('provider_id, status, started_at').order('started_at', { ascending: false }).limit(200),
  ]);

  const stations: IngestedStation[] = (stationRows ?? []).map((s) => ({
    providerId: String(s.provider_id),
    providerStationId: String(s.provider_station_id),
    name: String(s.name ?? s.provider_station_id),
  }));
  // station uuid → (provider, providerStationId), so airings (which key on the
  // uuid) can be attributed back to the configured channel key.
  const stationById = new Map(
    (stationRows ?? []).map((s) => [String(s.id), { providerId: String(s.provider_id), providerStationId: String(s.provider_station_id) }]),
  );

  const airings: AuditAiring[] = (airingRows ?? []).flatMap((a) => {
    const st = stationById.get(String(a.station_id));
    if (!st) return [];
    const ms = Date.parse(String(a.start_at_utc));
    if (!Number.isFinite(ms)) return [];
    return [{ providerId: st.providerId, stationProviderId: st.providerStationId, startAtUtcMs: ms }];
  });

  const runs: ProviderRun[] = (runRows ?? []).map((r) => ({
    providerId: String(r.provider_id),
    status: (['success', 'partial', 'failed', 'skipped'].includes(String(r.status)) ? String(r.status) : 'failed') as ProviderRun['status'],
    startedAtMs: r.started_at ? Date.parse(String(r.started_at)) : null,
  }));

  const policy = resolveDataMode();
  const matrix = buildCoverageMatrix({ configured, stations, airings, runs, nowMs, ingestionDisabled: !policy.configured });

  // Add ISO mirrors of the ms fields so the response is readable by a human.
  const iso = (ms: number | null) => (ms == null ? null : new Date(ms).toISOString());
  return NextResponse.json({
    generatedAt: new Date(nowMs).toISOString(),
    ingestionDisabled: matrix.ingestionDisabled,
    dataMode: policy.configured ? policy.mode : null,
    summary: matrix.summary,
    rows: matrix.rows.map((r) => ({
      ...r,
      lastIngestUtc: iso(r.lastIngestUtcMs),
      nextAiringUtc: iso(r.nextAiringUtcMs),
    })),
  });
}
