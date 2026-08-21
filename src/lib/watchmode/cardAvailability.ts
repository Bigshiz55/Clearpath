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
  // Never fetched — and, given the sync job only advances ~50 titles/day from
  // a fixed candidate pool (see sync.ts), for most titles NO fetch is ever
  // queued at all. This must never be worded as an in-progress check (it
  // usually isn't one) — it's a distinct, honest terminal state: "we don't
  // have a confirmed answer," not "check back in a second."
  | 'unconfirmed'
  | 'none'       // fetched, genuinely nothing found
  | 'available'; // fetched, at least one source

export interface CardAvailability {
  status: CardAvailabilityStatus;
  sources: CardAvailabilitySource[];
  /** ISO timestamp of the sync job's last check for this title, or null when
   *  never checked ('unconfirmed' status). Region-independent: the
   *  fetch-state table tracks "have we checked this title at all", not
   *  per-region. */
  checkedAt: string | null;
}

const UNCONFIRMED: CardAvailability = { status: 'unconfirmed', sources: [], checkedAt: null };

/**
 * `region` defensively scopes the availability rows to the viewer's country
 * (see `regionFor`). The sync job only populates `region = 'US'` today (see
 * src/lib/watchmode/sync.ts), so this is currently a no-op for US viewers and
 * an honest "nothing for you yet" for everyone else — but it means a future
 * multi-region sync can't silently show a non-US viewer US-only sources.
 */
export async function getCardAvailability(mediaType: MediaType, tmdbId: number, region = 'US'): Promise<CardAvailability> {
  const supabase = createClient();
  const [{ data: state }, { data: rows }] = await Promise.all([
    supabase.from('watchmode_fetch_state').select('last_fetched_at').eq('tmdb_id', tmdbId).eq('tmdb_media_type', mediaType).maybeSingle(),
    supabase
      .from('watchmode_availability')
      .select('source_name, source_type, deeplink, retrieved_at')
      .eq('tmdb_id', tmdbId)
      .eq('tmdb_media_type', mediaType)
      .eq('region', region),
  ]);

  if (!state) return UNCONFIRMED;

  const sources: CardAvailabilitySource[] = (rows ?? []).map((r) => ({
    name: r.source_name as string,
    type: r.source_type as CardAvailabilitySource['type'],
    deeplink: (r.deeplink as string | null) ?? null,
  }));
  // The per-row retrieved_at (0042 — written by the sync since Slice A) is
  // the claim's own as-of; the title-level fetch_state stamp is the fallback
  // for rows synced before the columns were written.
  const rowRetrievedAt = (rows ?? [])
    .map((r) => r.retrieved_at as string | null)
    .filter((t): t is string => !!t)
    .sort()
    .pop();
  return {
    status: sources.length > 0 ? 'available' : 'none',
    sources,
    checkedAt: rowRetrievedAt ?? (state.last_fetched_at as string | undefined) ?? null,
  };
}

/**
 * The twelve canonical availability states, the legacy `source_type` mapping
 * and the Prime state set now live in `src/lib/availability/states.ts` so that
 * CLIENT components can import them as values — this module is server-only, so
 * a card in the browser could only ever have imported the types from here.
 * Re-exported unchanged: one definition, two import paths, no copies.
 */
export {
  AVAILABILITY_STATES,
  isIncluded,
  stateFromLegacyType,
  PRIME_STATES,
  type AvailabilityState,
  type AvailabilityClaim,
} from '@/lib/availability/states';
