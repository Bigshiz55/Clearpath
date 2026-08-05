import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FranchiseEntry, FranchiseConnection, FactConfidence } from './types';

interface FranchiseRow {
  id: string;
  franchise: string;
  programme_id: string | null;
  tmdb_id: number | null;
  tmdb_media_type: 'movie' | 'tv' | null;
  title: string;
  sequence_number: number | null;
  connection: string;
  source_url: string | null;
  confidence: string;
}

function toFranchiseEntry(row: FranchiseRow): FranchiseEntry {
  return {
    id: row.id,
    franchise: row.franchise,
    programmeId: row.programme_id,
    tmdbId: row.tmdb_id,
    tmdbMediaType: row.tmdb_media_type,
    title: row.title,
    sequenceNumber: row.sequence_number,
    connection: row.connection as FranchiseConnection,
    sourceUrl: row.source_url,
    confidence: row.confidence as FactConfidence,
  };
}

/**
 * Distinct franchise names with any verified entries at all — never
 * inferred from title-string similarity (see migration 0039). A Pack with
 * no curated franchises yet returns an empty list, which the UI must show
 * as an honest "not yet verified" state, not silence or a guess.
 */
export async function listFranchiseNames(supabase: SupabaseClient, packSlug?: string): Promise<string[]> {
  // Scoped by pack_slug (migration 0043). Franchises used to be global, so
  // enabling the feature on one Pack rendered every other Pack's franchises
  // too. When the column is absent (migration not yet applied) this returns
  // NOTHING rather than everything: a franchise shown under the wrong Pack is
  // a factual error, an absent one is only a gap the catalog tier fills.
  let query = supabase.from('franchise_entries').select('franchise');
  if (packSlug) query = query.eq('pack_slug', packSlug);
  const { data, error } = await query;
  if (error) {
    if (packSlug && /pack_slug|column|schema cache/i.test(error.message)) return [];
    throw error;
  }
  return [...new Set(((data ?? []) as { franchise: string }[]).map((r) => r.franchise))].sort();
}

/** A franchise's verified entries, in viewing order (nulls last — order not yet verified). */
export async function listFranchiseEntries(supabase: SupabaseClient, franchise: string): Promise<FranchiseEntry[]> {
  const { data, error } = await supabase.from('franchise_entries').select('*').eq('franchise', franchise);
  if (error) throw error;
  return (data as FranchiseRow[])
    .map(toFranchiseEntry)
    .sort((a, b) => {
      if (a.sequenceNumber == null && b.sequenceNumber == null) return 0;
      if (a.sequenceNumber == null) return 1;
      if (b.sequenceNumber == null) return -1;
      return a.sequenceNumber - b.sequenceNumber;
    });
}
