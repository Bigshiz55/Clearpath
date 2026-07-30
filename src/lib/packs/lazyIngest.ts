import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { runTvmazeIngest } from '@/lib/viewing/ingest/tvmazeWriter';
import { TVMAZE_CHANNELS } from '@/lib/viewing/ingest/tvmazeChannels';
import { createAdminClient } from '@/lib/supabase/admin';
import { linkStationToPack } from './stations';
import type { Pack } from './types';

const INGEST_FORWARD_DAYS = 14;

/**
 * The one place that maps a Pack to its TVmaze channel group — see
 * src/lib/viewing/ingest/tvmazeChannels.ts's `group: 'A' | 'B'`. No other
 * file needs to know this; Pack pages and components only ever read the
 * Pack's boolean feature flags, never its slug.
 */
const PACK_CHANNEL_GROUP: Record<string, 'A' | 'B'> = {
  'hallmark-lifetime': 'A',
  'true-crime': 'B',
};

export interface LazyIngestOutcome {
  /** True if THIS request ran (or attempted) the ingest. */
  attempted: boolean;
  ok: boolean;
  error: string | null;
  /** True if a DIFFERENT request is currently running the ingest for this Pack. */
  inProgressElsewhere: boolean;
}

/**
 * Lazily runs the existing TVmaze ingest for `pack` if its data is missing
 * or its last successful ingest is more than 12 hours old (see migration
 * 0038's `pack_try_start_ingest`, which also serializes concurrent callers
 * to exactly one actual ingest via a transaction-scoped Postgres advisory
 * lock keyed on the Pack id). Called directly from the Pack page's own
 * request — no admin route, no token, no new environment variable.
 */
export async function ensurePackIngested(supabase: SupabaseClient, pack: Pack): Promise<LazyIngestOutcome> {
  const group = PACK_CHANNEL_GROUP[pack.slug];
  if (!group) return { attempted: false, ok: true, error: null, inProgressElsewhere: false };

  const { data, error: rpcError } = await supabase.rpc('pack_try_start_ingest', { p_pack_id: pack.id });
  if (rpcError) {
    // The lock/staleness check itself failed — render with whatever exists
    // rather than blocking the page on an ingest-bookkeeping problem.
    return { attempted: false, ok: false, error: rpcError.message, inProgressElsewhere: false };
  }
  const decision = (Array.isArray(data) ? data[0] : data) as { should_run: boolean; run_id: string | null } | null;

  if (!decision?.should_run || !decision.run_id) {
    const inProgressElsewhere = await isIngestInProgress(pack.id);
    return { attempted: false, ok: true, error: null, inProgressElsewhere };
  }

  const runId = decision.run_id;
  try {
    const result = await runTvmazeIngest(INGEST_FORWARD_DAYS);
    await wirePackStations(pack.id, group);

    const outcome = result.ok ? 'success' : 'partial';
    await supabase.rpc('pack_finish_ingest', {
      p_run_id: runId,
      p_outcome: outcome,
      p_rows_written: result.inserted + result.updated,
      p_error_message: result.daysFailed.length > 0 ? result.daysFailed.join('; ').slice(0, 500) : null,
    });
    return {
      attempted: true,
      ok: result.ok,
      error: result.ok ? null : (result.daysFailed[0] ?? 'Ingest did not complete for every requested day.'),
      inProgressElsewhere: false,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Ingest failed.';
    try {
      await supabase.rpc('pack_finish_ingest', {
        p_run_id: runId,
        p_outcome: 'failed',
        p_rows_written: 0,
        p_error_message: message.slice(0, 500),
      });
    } catch {
      /* best effort — still return the real error below either way */
    }
    return { attempted: true, ok: false, error: message, inProgressElsewhere: false };
  }
}

/** Link this Pack's channel-group stations into pack_stations. Idempotent. */
async function wirePackStations(packId: string, group: 'A' | 'B'): Promise<void> {
  const admin = createAdminClient();
  const groupChannels = TVMAZE_CHANNELS.filter((ch) => ch.group === group);
  for (const ch of groupChannels) {
    const { data: station } = await admin
      .from('tv_stations')
      .select('id')
      .eq('provider_id', 'tvmaze')
      .eq('provider_station_id', ch.key)
      .maybeSingle();
    if (station?.id) {
      await linkStationToPack(admin, packId, station.id as string);
    }
  }
}

/** pack_ingest_runs is service-role-only (no select policy) — this admin read never reaches the browser. */
async function isIngestInProgress(packId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('pack_ingest_runs')
    .select('finished_at')
    .eq('pack_id', packId)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data != null && data.finished_at == null;
}
