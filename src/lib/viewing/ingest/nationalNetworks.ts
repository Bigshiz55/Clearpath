/**
 * NATIONAL NETWORK ALLOWLIST — now a thin view over the channel registry.
 *
 * This file used to hold a hand-written array of ~76 lowercased network names
 * plus a matcher that accepted anything STARTING with one of them:
 *
 *     n === net || n.startsWith(net + ' ') || n.startsWith(net)
 *
 * The third clause made the first two dead code and removed every boundary, so
 * "nbc.com" was admitted as NBC, "ABC News Live" as ABC, "CBS News" as CBS —
 * three streaming feeds rendered on the guide as if they were television
 * channels — and "Foxtel" and "ABCDEFG Network" would have been too.
 *
 * Identity now lives in ONE place, `viewing/channels/channelIdentity.ts`, which
 * matches exact normalized names against explicit aliases and keeps LINEAR and
 * WEB as different kinds of thing. This module keeps its old exported surface
 * so the live path (`onTv.ts`), the writer and the guide lineup keep working —
 * but every one of them now asks the registry.
 *
 * Pure: no I/O, no `server-only`.
 */
import { LINEAR_CHANNELS, resolveLinearChannel } from '@/lib/viewing/channels/channelIdentity';

/**
 * The carried networks, as lowercased display names.
 *
 * DERIVED, never hand-maintained — widening coverage means adding a channel to
 * the registry, and this follows. A second list is a second thing to forget.
 */
export const MAJOR_US_NETWORKS: readonly string[] = LINEAR_CHANNELS.map((c) => c.name.toLowerCase());

/**
 * Is this source name one of the linear channels we carry?
 *
 * Exact identity, not a prefix. Callers that hold a full source row should
 * prefer `isCarriedLinear`/`classifySourceChannel`, which additionally refuse a
 * web feed no matter what it is called; this remains for the paths that only
 * ever have a network name in hand.
 */
export function isMajorUsNetwork(name: string): boolean {
  return resolveLinearChannel(name) !== null;
}

/**
 * Stable station id fragment for a network name: lowercased, trimmed, with every
 * run of non-alphanumerics collapsed to a single hyphen and stripped at the
 * ends. "USA Network" -> "usa-network", "A&E" -> "a-e", "E!" -> "e".
 *
 * UNCHANGED ON PURPOSE — it is baked into `tv_stations.provider_station_id`
 * values that already exist in the database, so its output is a storage
 * contract rather than an implementation detail. New code that wants a stable
 * per-channel key should use the registry's canonical `id` instead (see
 * `canonicalStationSlug`), which is what actually collapses two spellings of
 * one channel into one station.
 */
export function networkSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * The station slug for a source network name, canonicalised.
 *
 * "Fox News" and "Fox News Channel" are one channel, so they must produce ONE
 * station — otherwise the same broadcaster appears twice in the guide, which is
 * the duplicate half of the defect this module exists to fix. Falls back to the
 * raw slug for names the registry does not carry, so nothing silently vanishes
 * on a path that was not filtering.
 */
export function canonicalStationSlug(name: string): string {
  return resolveLinearChannel(name)?.id ?? networkSlug(name);
}
