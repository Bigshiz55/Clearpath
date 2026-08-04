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
      .select('source_name, source_type, deeplink')
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
  return {
    status: sources.length > 0 ? 'available' : 'none',
    sources,
    checkedAt: (state.last_fetched_at as string | undefined) ?? null,
  };
}

/**
 * THE TWELVE CANONICAL AVAILABILITY STATES.
 *
 * Additive on purpose. `CardAvailabilityStatus` above is the TITLE-level
 * answer (have we checked at all, did we find anything) and is deliberately
 * untouched — it is the honest "no confirmed answer" state and must not be
 * weakened. This is the PER-CLAIM state: what a specific service offers, in a
 * specific country, on a specific date.
 *
 * `unverified` is the default everywhere. Nothing is ever asserted as included
 * without positive evidence — see the migration's backfill, which maps legacy
 * `subscription` to base-tier only and never to premium, add-on or Prime.
 */
export const AVAILABILITY_STATES = [
  'included_with_base_subscription',
  'included_with_premium_tier',
  'included_with_prime',
  'included_with_addon',
  'free_with_ads',
  'library_access',
  'rent',
  'buy',
  'coming_soon',
  'leaving_soon',
  'unavailable',
  'unverified',
] as const;

export type AvailabilityState = (typeof AVAILABILITY_STATES)[number];

/** States that mean "watching this costs nothing beyond what they already pay". */
const INCLUDED: ReadonlySet<AvailabilityState> = new Set<AvailabilityState>([
  'included_with_base_subscription',
  'included_with_premium_tier',
  'included_with_prime',
  'included_with_addon',
  'library_access',
]);

/**
 * True only for states positively evidenced as included. `free_with_ads` is
 * deliberately NOT here: it costs nothing but it is not subscription
 * inclusion, and conflating them is how "included with Prime" starts appearing
 * on rental-only titles.
 */
export function isIncluded(state: AvailabilityState): boolean {
  return INCLUDED.has(state);
}

/** A single evidenced claim. Every field a claim must retain lives here. */
export interface AvailabilityClaim {
  service: string;
  region: string;
  state: AvailabilityState;
  /** Required when state is 'included_with_addon' — which add-on, by name. */
  addonName: string | null;
  sourceKey: string;
  sourceUrl: string | null;
  retrievedAt: string | null;
  lastVerifiedAt: string | null;
  confidence: number | null;
  evidenceTrace: string | null;
  watchLink: string | null;
}

/**
 * The legacy `source_type` -> canonical mapping, mirrored from migration 0042
 * so application code and SQL cannot drift. Anything unrecognised is
 * 'unverified' — never a guess.
 */
export function stateFromLegacyType(sourceType: string): AvailabilityState {
  switch (sourceType) {
    case 'subscription': return 'included_with_base_subscription';
    case 'free': return 'free_with_ads';
    case 'rent': return 'rent';
    case 'buy': return 'buy';
    default: return 'unverified';
  }
}

/**
 * Prime Video's states are never collapsed. Inclusion is asserted only from
 * positive evidence — never because a title appeared in an Amazon search
 * result, which shows rentals, add-on content and unavailable titles side by
 * side with included ones.
 */
export const PRIME_STATES: ReadonlySet<AvailabilityState> = new Set<AvailabilityState>([
  'included_with_prime',
  'included_with_addon',
  'free_with_ads',
  'rent',
  'buy',
  'unavailable',
  'unverified',
]);
