/**
 * CLIENT-SAFE availability vocabulary — deliberately NOT in
 * src/lib/watchmode/cardAvailability.ts, which starts with `import 'server-only'`.
 *
 * Cards run in the browser and need these states to decide what to say, so
 * the vocabulary has to live somewhere a client component can import as a
 * VALUE, not just a type. Keeping it here means there is one definition of
 * the twelve states and one legacy mapping, shared by the SQL-facing server
 * code and the rendering code, rather than a copy on each side that can
 * drift. cardAvailability.ts re-exports all of it for existing callers.
 */
/**
 * THE TWELVE CANONICAL AVAILABILITY STATES.
 *
 * Additive on purpose. `CardAvailabilityStatus` in cardAvailability.ts is the
 * TITLE-level answer (have we checked at all, did we find anything) and is
 * deliberately untouched — it is the honest "no confirmed answer" state and
 * must not be weakened. This is the PER-CLAIM state: what a specific service
 * offers, in a specific country, on a specific date.
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
