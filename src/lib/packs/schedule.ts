import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { listStationsForPack } from './stations';

/**
 * A PACK'S UPCOMING SCHEDULE, WITHOUT THE PREMIERE-FLAG DEPENDENCY.
 *
 * ── THE DEFECT THIS FIXES ─────────────────────────────────────────────────
 * The premiere calendar read ONLY `pack_premiere_calendar`, a view that
 * requires `tv_airings.is_premiere = true`. Providers do not reliably set
 * that flag — TV Media's `isNew` is sparse and TVmaze's premiere detection
 * only covers episodic series — so a pack whose channels had dozens of real
 * upcoming airings still rendered a giant empty panel that blamed the
 * ingest ("nothing new is scheduled … or the ingest hasn't run yet").
 *
 * An empty premiere list and an empty schedule are different facts. This
 * module reads the schedule itself — every future airing on the pack's
 * stations — and CLASSIFIES each entry instead of filtering to a flag:
 *
 *   verified  — the provider explicitly marked the airing as a premiere.
 *   derived   — trustworthy evidence short of a flag: this is the earliest
 *               airing of the programme we have EVER stored, and it is not
 *               part of an existing back-catalog rerun cycle (see
 *               `classifyEntry`). Labelled as derived, never as verified.
 *   scheduled — an ordinary upcoming airing.
 *
 * Nothing is invented: every entry is a stored `tv_airings` row, every label
 * names its evidence, and the caller decides how to present each class.
 */

export type PremiereKind = 'verified' | 'derived' | 'scheduled';

export interface UpcomingEntry {
  airingId: string;
  programmeId: string;
  title: string;
  posterUrl: string | null;
  channel: string;
  startAtUtc: string;
  programmeType: string;
  kind: PremiereKind;
}

export interface UpcomingAiringRow {
  airingId: string;
  programmeId: string;
  stationId: string;
  startAtUtc: string;
  isPremiere: boolean | null;
}

/**
 * Classification, pure so it is testable without a database.
 *
 * `earliestStoredUtc` is the programme's earliest airing across EVERYTHING
 * stored (past included). A future airing is a `derived` premiere only when
 * it IS that earliest airing — i.e. the schedule has never shown this title
 * before, at any point in our data. A title with any earlier stored airing
 * is part of a rerun cycle and stays `scheduled`; claiming it as a premiere
 * would be exactly the kind of invented fact the packs must never show.
 */
export function classifyEntry(
  airing: { startAtUtc: string; isPremiere: boolean | null },
  earliestStoredUtc: string | null,
): PremiereKind {
  if (airing.isPremiere === true) return 'verified';
  if (earliestStoredUtc != null && Date.parse(airing.startAtUtc) <= Date.parse(earliestStoredUtc)) {
    return 'derived';
  }
  return 'scheduled';
}

const UPCOMING_LIMIT = 200;

/**
 * Every future airing on the pack's stations within `days`, classified.
 * One query for the future window, one for each programme's earliest stored
 * airing (a single grouped-ish select), one for programme metadata, one for
 * station names — bounded regardless of schedule size.
 */
export async function getPackUpcoming(
  supabase: SupabaseClient,
  packId: string,
  days = 14,
): Promise<UpcomingEntry[]> {
  const stationIds = await listStationsForPack(supabase, packId);
  if (stationIds.length === 0) return [];

  const nowIso = new Date().toISOString();
  const endIso = new Date(Date.now() + days * 86_400_000).toISOString();

  const { data: airings, error } = await supabase
    .from('tv_airings')
    .select('id, programme_id, station_id, start_at_utc, is_premiere')
    .in('station_id', stationIds)
    .gte('start_at_utc', nowIso)
    .lt('start_at_utc', endIso)
    .order('start_at_utc', { ascending: true })
    .limit(UPCOMING_LIMIT);
  if (error) throw error;

  const rows: UpcomingAiringRow[] = ((airings ?? []) as {
    id: string; programme_id: string; station_id: string; start_at_utc: string; is_premiere: boolean | null;
  }[]).map((a) => ({
    airingId: a.id, programmeId: a.programme_id, stationId: a.station_id,
    startAtUtc: a.start_at_utc, isPremiere: a.is_premiere,
  }));
  if (rows.length === 0) return [];

  const programmeIds = [...new Set(rows.map((r) => r.programmeId))];

  // Earliest STORED airing per programme — past included, which is the point:
  // it is what separates "first time our data has ever seen this title" from
  // "part of a rerun cycle".
  const { data: earliest } = await supabase
    .from('tv_airings')
    .select('programme_id, start_at_utc')
    .in('programme_id', programmeIds)
    .order('start_at_utc', { ascending: true })
    .limit(2000);
  const earliestByProgramme = new Map<string, string>();
  for (const r of (earliest ?? []) as { programme_id: string; start_at_utc: string }[]) {
    if (!earliestByProgramme.has(r.programme_id)) earliestByProgramme.set(r.programme_id, r.start_at_utc);
  }

  const [{ data: programmes }, { data: stations }] = await Promise.all([
    supabase.from('tv_programmes').select('id, title, artwork_url, programme_type').in('id', programmeIds),
    supabase.from('tv_stations').select('id, name').in('id', [...new Set(rows.map((r) => r.stationId))]),
  ]);
  const programmeById = new Map(
    ((programmes ?? []) as { id: string; title: string; artwork_url: string | null; programme_type: string }[]).map(
      (p) => [p.id, p],
    ),
  );
  const stationById = new Map(((stations ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));

  return rows
    .map((r) => {
      const prog = programmeById.get(r.programmeId);
      return {
        airingId: r.airingId,
        programmeId: r.programmeId,
        title: prog?.title ?? 'Unknown title',
        posterUrl: prog?.artwork_url ?? null,
        channel: stationById.get(r.stationId) ?? 'Unknown channel',
        startAtUtc: r.startAtUtc,
        programmeType: prog?.programme_type ?? 'other',
        kind: classifyEntry(r, earliestByProgramme.get(r.programmeId) ?? null),
      };
    })
    // One entry per programme per day is plenty for a schedule surface; keep
    // the earliest airing of each programme so a 12-rerun day is one row.
    .filter((entry, i, all) => all.findIndex((e) => e.programmeId === entry.programmeId) === i);
}
