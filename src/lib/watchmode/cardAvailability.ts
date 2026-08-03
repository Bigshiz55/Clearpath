import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { MediaType } from '@/lib/types';

/**
 * READ-ONLY lookup against the cache tables the Watchmode sync job writes
 * (`src/lib/watchmode/sync.ts`) — a plain Supabase select, never a Watchmode
 * API call. Both tables are world-readable by RLS (migration
 * 0041_watchmode_availability.sql), so the regular request-scoped client is
 * enough; no service role needed to READ this.
 */

export interface CardAvailabilitySource {
  name: string;
  type: 'subscription' | 'rent' | 'buy' | 'free';
  deeplink: string | null;
}

export type CardAvailabilityStatus =
  | 'checking'   // never fetched — absence of data, not absence of availability
  | 'none'       // fetched, genuinely nothing found
  | 'available'; // fetched, at least one source

export interface CardAvailability {
  status: CardAvailabilityStatus;
  sources: CardAvailabilitySource[];
}

const CHECKING: CardAvailability = { status: 'checking', sources: [] };

export async function getCardAvailability(mediaType: MediaType, tmdbId: number): Promise<CardAvailability> {
  const supabase = createClient();
  const [{ data: state }, { data: rows }] = await Promise.all([
    supabase.from('watchmode_fetch_state').select('last_status').eq('tmdb_id', tmdbId).eq('tmdb_media_type', mediaType).maybeSingle(),
    supabase.from('watchmode_availability').select('source_name, source_type, deeplink').eq('tmdb_id', tmdbId).eq('tmdb_media_type', mediaType),
  ]);

  if (!state) return CHECKING;

  const sources: CardAvailabilitySource[] = (rows ?? []).map((r) => ({
    name: r.source_name as string,
    type: r.source_type as CardAvailabilitySource['type'],
    deeplink: (r.deeplink as string | null) ?? null,
  }));
  return { status: sources.length > 0 ? 'available' : 'none', sources };
}
