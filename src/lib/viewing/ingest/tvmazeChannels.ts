/**
 * TVMAZE INGEST — CHANNEL CONFIG ("provider config").
 *
 * TVmaze has no "give me channel X's schedule" endpoint — only a daily
 * national `/schedule?country=US&date=` dump, one row per airing, each
 * carrying its own `show.network.name` (or `show.webChannel.name`). Ingesting
 * a channel therefore means: pull the day, then keep only the rows whose show
 * belongs to a network (or, for the newsmagazines, a specific show on a
 * specific network) we've configured.
 *
 * Every entry here was checked against the live API before being added —
 * see the coverage report in the commit this file shipped with. Do not add a
 * channel without checking real coverage first; a configured-but-silently-
 * empty channel is exactly the kind of gap this ingest exists to surface, not
 * hide.
 */

export type TvmazeChannelMatch =
  | { mode: 'network'; networkNames: string[] }
  | { mode: 'show'; networkName: string; showNames: string[] };

/**
 * One group per Pack (see src/lib/packs/lazyIngest.ts's PACK_CHANNEL_GROUP) —
 * previously a coarse 'A' (Hallmark+Lifetime combined) / 'B' (crime) split;
 * now one group per real Pack so Hallmark Universe and Lifetime Movie Vault
 * each get only their own stations, not each other's.
 */
export type TvmazeChannelGroup = 'hallmark' | 'lifetime' | 'crime';

export interface TvmazeChannelDef {
  /** Stable key — used as `tv_stations.provider_station_id`. */
  key: string;
  displayName: string;
  group: TvmazeChannelGroup;
  match: TvmazeChannelMatch;
}

export const TVMAZE_CHANNELS: TvmazeChannelDef[] = [
  // --- Hallmark family --------------------------------------------------------
  // Hallmark Channel and Hallmark Mystery both carry real, TVmaze-indexed
  // scripted series (When Calls the Heart / Chesapeake Shores; Mystery 101),
  // confirmed live. Coverage is sparse (Hallmark's schedule is mostly a
  // rotating movie library TVmaze does not track episode-by-episode) but real.
  {
    key: 'hallmark_channel', displayName: 'Hallmark Channel', group: 'hallmark',
    match: { mode: 'network', networkNames: ['Hallmark Channel'] },
  },
  {
    key: 'hallmark_mystery', displayName: 'Hallmark Mystery', group: 'hallmark',
    match: { mode: 'network', networkNames: ['Hallmark Mystery'] },
  },
  // No TVmaze network entity found for this name in any search performed
  // while building this config. Left configured, not silently dropped, so
  // the coverage report says "not found" rather than the channel just never
  // appearing anywhere.
  {
    key: 'hallmark_family', displayName: 'Hallmark Family', group: 'hallmark',
    match: { mode: 'network', networkNames: ['Hallmark Family'] },
  },

  // --- Lifetime family ---------------------------------------------------------
  {
    key: 'lifetime', displayName: 'Lifetime', group: 'lifetime',
    match: { mode: 'network', networkNames: ['Lifetime'] },
  },
  // Not found under this name or "LMN" in any search or in a 7-day pull of
  // the full national schedule. Configured anyway, per the same rule above.
  {
    key: 'lifetime_movie_network', displayName: 'Lifetime Movie Network', group: 'lifetime',
    match: { mode: 'network', networkNames: ['Lifetime Movie Network', 'LMN'] },
  },
  // Not found under this name in any search performed.
  {
    key: 'great_american_family', displayName: 'Great American Family', group: 'lifetime',
    match: { mode: 'network', networkNames: ['Great American Family'] },
  },

  // --- Crime: true-crime cable + broadcast newsmagazines ----------------------
  {
    key: 'investigation_discovery', displayName: 'Investigation Discovery', group: 'crime',
    match: { mode: 'network', networkNames: ['Investigation Discovery'] },
  },
  // TVmaze's current network name for this channel is "Oxygen True Crime"
  // (its post-rebrand name), not plain "Oxygen" — confirmed live. Both are
  // listed so a future TVmaze rename in either direction still matches.
  {
    key: 'oxygen', displayName: 'Oxygen', group: 'crime',
    match: { mode: 'network', networkNames: ['Oxygen', 'Oxygen True Crime'] },
  },
  // The newsmagazines are modeled as their own "channel" (a specific show on
  // a specific broadcast network), not "everything NBC/ABC/CBS air" — matching
  // by network name alone would pull in the network's entire schedule.
  {
    key: 'dateline_nbc', displayName: 'Dateline (NBC)', group: 'crime',
    match: { mode: 'show', networkName: 'NBC', showNames: ['Dateline NBC'] },
  },
  {
    key: '20_20_abc', displayName: '20/20 (ABC)', group: 'crime',
    match: { mode: 'show', networkName: 'ABC', showNames: ['20/20'] },
  },
  // Exact-name match deliberately excludes TVmaze's separate spinoff shows
  // ("48 Hours: Suspicion", "48 Hours: Hard Evidence") and the unrelated
  // syndicated "48 Hours Weekday Edition" — distinct TVmaze shows, not this one.
  {
    key: '48_hours_cbs', displayName: '48 Hours (CBS)', group: 'crime',
    match: { mode: 'show', networkName: 'CBS', showNames: ['48 Hours'] },
  },
];

/** The configured channel a raw TVmaze schedule row belongs to, or null. */
export function matchChannel(
  networkName: string | null,
  showName: string | null,
): TvmazeChannelDef | null {
  if (!networkName) return null;
  for (const ch of TVMAZE_CHANNELS) {
    if (ch.match.mode === 'network') {
      if (ch.match.networkNames.some((n) => n.toLowerCase() === networkName.toLowerCase())) return ch;
    } else {
      if (
        ch.match.networkName.toLowerCase() === networkName.toLowerCase() &&
        !!showName &&
        ch.match.showNames.some((n) => n.toLowerCase() === showName.toLowerCase())
      ) {
        return ch;
      }
    }
  }
  return null;
}
