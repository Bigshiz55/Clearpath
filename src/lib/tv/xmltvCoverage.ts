import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * FILE-FED COVERAGE EVIDENCE — may the guide claim a licensed full grid
 * because of an XMLTV file import?
 *
 * `hasLiveFullGridProvider()` answers for the METERED API transport (key +
 * egress) and is deliberately untouched. A file delivery is a different
 * transport with different evidence, and "one file imported successfully
 * once" is NOT that evidence. The claim requires ALL of:
 *
 *   1. an ENABLED tv_media lineup whose provider_lineup_id marks the xmltv
 *      transport ('xmltv:<feedId>'),
 *   2. a recorded successful import (last_success_at set),
 *   3. NOW inside the lineup's own proven coverage window
 *      [coverage_start_utc, coverage_end_utc] — the window the file itself
 *      demonstrated, never an assumed horizon.
 *
 * When the imported window ages out, this returns false on its own and the
 * guide's honesty states take over — stale data is never presented as a
 * live grid. Fail-closed: any query error reads as "cannot prove coverage".
 */
export interface XmltvCoverageEvidence {
  live: boolean;
  /** The lineups backing the claim (empty when live=false). */
  lineups: { providerLineupId: string; coverageStartUtc: string; coverageEndUtc: string }[];
}

export async function xmltvCoverageEvidence(
  supabase: SupabaseClient,
  nowMs: number,
): Promise<XmltvCoverageEvidence> {
  try {
    const nowIso = new Date(nowMs).toISOString();
    const { data, error } = await supabase
      .from('tv_lineups')
      .select('provider_lineup_id, coverage_start_utc, coverage_end_utc, last_success_at, enabled')
      .eq('provider_id', 'tv_media')
      .like('provider_lineup_id', 'xmltv:%')
      .eq('enabled', true)
      .not('last_success_at', 'is', null)
      .lte('coverage_start_utc', nowIso)
      .gte('coverage_end_utc', nowIso);
    if (error || !data) return { live: false, lineups: [] };
    const lineups = data
      .filter((r) => r.coverage_start_utc && r.coverage_end_utc)
      .map((r) => ({
        providerLineupId: r.provider_lineup_id as string,
        coverageStartUtc: r.coverage_start_utc as string,
        coverageEndUtc: r.coverage_end_utc as string,
      }));
    return { live: lineups.length > 0, lineups };
  } catch {
    return { live: false, lineups: [] };
  }
}
