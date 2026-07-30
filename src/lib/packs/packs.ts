import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Pack, PackPremiereEntry } from './types';

interface PackRow {
  id: string;
  slug: string;
  display_name: string;
  description: string | null;
  is_premium: boolean;
  sort_order: number;
  premiere_calendar: boolean;
  case_tracking: boolean;
  person_tracking: boolean;
  franchise_continuity: boolean;
  completion_stats: boolean;
  created_at: string;
  updated_at: string;
}

function toPack(row: PackRow): Pack {
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.display_name,
    description: row.description,
    isPremium: row.is_premium,
    sortOrder: row.sort_order,
    premiereCalendar: row.premiere_calendar,
    caseTracking: row.case_tracking,
    personTracking: row.person_tracking,
    franchiseContinuity: row.franchise_continuity,
    completionStats: row.completion_stats,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** All Packs, in display order. No slug branching — callers key off the feature flags. */
export async function listPacks(supabase: SupabaseClient): Promise<Pack[]> {
  const { data, error } = await supabase
    .from('packs')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data as PackRow[]).map(toPack);
}

export async function getPackBySlug(supabase: SupabaseClient, slug: string): Promise<Pack | null> {
  const { data, error } = await supabase.from('packs').select('*').eq('slug', slug).maybeSingle();
  if (error) throw error;
  return data ? toPack(data as PackRow) : null;
}

interface PremiereRow {
  pack_id: string;
  programme_id: string;
  title: string;
  premiere_date: string;
  airing_id: string;
  station_id: string;
  start_at_utc: string;
}

/**
 * Premieres on a Pack's stations within [startDate, endDate] (inclusive,
 * 'YYYY-MM-DD'). Reads `pack_premiere_calendar` directly — the view already
 * scopes by pack_stations, so this stays a single generic query for every
 * Pack; no per-Pack logic lives here or anywhere else.
 */
export async function getPackPremiereCalendar(
  supabase: SupabaseClient,
  packId: string,
  startDate: string,
  endDate: string,
): Promise<PackPremiereEntry[]> {
  const { data, error } = await supabase
    .from('pack_premiere_calendar')
    .select('*')
    .eq('pack_id', packId)
    .gte('premiere_date', startDate)
    .lte('premiere_date', endDate)
    .order('premiere_date', { ascending: true });
  if (error) throw error;
  return (data as PremiereRow[]).map((row) => ({
    packId: row.pack_id,
    programmeId: row.programme_id,
    title: row.title,
    premiereDate: row.premiere_date,
    airingId: row.airing_id,
    stationId: row.station_id,
    startAtUtc: row.start_at_utc,
  }));
}
