/**
 * NATIONAL NETWORK ALLOWLIST — one source of truth.
 *
 * The major American TV networks carried on Xfinity / Verizon Fios — broadcast,
 * major cable entertainment, news, sports, and premium. We track these and skip
 * the long tail of tiny/regional channels, so the guide stays useful.
 *
 * Copied verbatim from the original definitions in `src/lib/onTv.ts` so the
 * LIVE guide path and the national INGEST filter share ONE allowlist and one
 * matching rule — a single place to widen coverage, never two lists that drift.
 *
 * Pure: no I/O, no `server-only` — safe to import from either the request-time
 * live path or the batch ingest writer, and unit-testable on its own.
 */

// Broadcast, major cable entertainment, news, sports, and premium.
export const MAJOR_US_NETWORKS = [
  // Broadcast
  'abc', 'cbs', 'nbc', 'fox', 'the cw', 'pbs', 'telemundo', 'univision', 'ion', 'mynetworktv',
  // Cable entertainment
  'amc', 'usa network', 'tnt', 'tbs', 'fx', 'fxx', 'bravo', 'e!', 'comedy central',
  'paramount network', 'syfy', 'freeform', 'hallmark', 'hgtv', 'food network', 'discovery',
  'tlc', 'history', 'a&e', 'lifetime', 'national geographic', 'nat geo', 'animal planet',
  'bbc america', 'ifc', 'sundancetv', 'tcm', 'tv land', 'we tv', 'own', 'mtv', 'vh1', 'bet',
  'cartoon network', 'nickelodeon', 'disney channel', 'adult swim', 'trutv', 'oxygen',
  'investigation discovery', 'gsn', 'reelz', 'cooking channel', 'motortrend',
  // News
  'cnn', 'msnbc', 'fox news', 'cnbc', 'hln', 'newsmax',
  // Sports
  'espn', 'fs1', 'fs2', 'fox sports', 'nbc sports', 'nfl network', 'mlb network', 'nba tv',
  'golf channel', 'tennis channel',
  // Premium
  'hbo', 'cinemax', 'showtime', 'starz', 'mgm+', 'epix',
];

export function isMajorUsNetwork(name: string): boolean {
  const n = name.toLowerCase().trim();
  return MAJOR_US_NETWORKS.some((net) => n === net || n.startsWith(net + ' ') || n.startsWith(net));
}

/**
 * Stable station id fragment for a network name: lowercased, trimmed, with every
 * run of non-alphanumerics collapsed to a single hyphen and stripped at the
 * ends. "USA Network" -> "usa-network", "A&E" -> "a-e", "E!" -> "e". Used to
 * synthesize `tv_stations.provider_station_id` for the national ingest so the
 * same network always maps to the same station across reruns.
 */
export function networkSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
