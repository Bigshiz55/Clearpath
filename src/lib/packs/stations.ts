import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Pack ids a station belongs to. A station may belong to more than one Pack. */
export async function listPacksForStation(supabase: SupabaseClient, stationId: string): Promise<string[]> {
  const { data, error } = await supabase.from('pack_stations').select('pack_id').eq('station_id', stationId);
  if (error) throw error;
  return (data as { pack_id: string }[]).map((row) => row.pack_id);
}

/** Station ids belonging to a Pack. */
export async function listStationsForPack(supabase: SupabaseClient, packId: string): Promise<string[]> {
  const { data, error } = await supabase.from('pack_stations').select('station_id').eq('pack_id', packId);
  if (error) throw error;
  return (data as { station_id: string }[]).map((row) => row.station_id);
}
