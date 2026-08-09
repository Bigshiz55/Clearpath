/**
 * THE CANONICAL GUIDE CHANNEL LINEUP — the channel UNIVERSE, decided up front.
 *
 * The Full Guide's channels must come from a supported CHANNEL LINEUP, not from
 * whichever airings happen to exist right now. This is that lineup: the same
 * `MAJOR_US_NETWORKS` allowlist the national ingest already uses (ONE source of
 * truth — widen coverage in one place), given proper display names so a channel
 * renders whether or not it has schedule data this moment.
 *
 * A channel with no airings in the window is NOT deleted — it renders with
 * "Schedule currently unavailable". Silent disappearance is a bug, not a feature.
 *
 * Pure: no I/O, no clock. Safe to import from the pure guide builder.
 */
import { MAJOR_US_NETWORKS, networkSlug } from '@/lib/viewing/ingest/nationalNetworks';

/** Proper display names for the allowlist's lowercased keys. Anything without an
 *  override is Title-Cased. Kept beside the allowlist so the two never drift. */
const DISPLAY: Record<string, string> = {
  abc: 'ABC', cbs: 'CBS', nbc: 'NBC', fox: 'FOX', 'the cw': 'The CW', pbs: 'PBS',
  telemundo: 'Telemundo', univision: 'Univision', ion: 'ION Television', mynetworktv: 'MyNetworkTV',
  amc: 'AMC', 'usa network': 'USA Network', tnt: 'TNT', tbs: 'TBS', fx: 'FX', fxx: 'FXX', bravo: 'Bravo',
  'e!': 'E!', 'comedy central': 'Comedy Central', 'paramount network': 'Paramount Network', syfy: 'Syfy',
  freeform: 'Freeform', hallmark: 'Hallmark Channel', hgtv: 'HGTV', 'food network': 'Food Network',
  discovery: 'Discovery', tlc: 'TLC', history: 'History', 'a&e': 'A&E', lifetime: 'Lifetime',
  'national geographic': 'National Geographic', 'nat geo': 'Nat Geo', 'animal planet': 'Animal Planet',
  'bbc america': 'BBC America', ifc: 'IFC', sundancetv: 'SundanceTV', tcm: 'TCM', 'tv land': 'TV Land',
  'we tv': 'WE tv', own: 'OWN', mtv: 'MTV', vh1: 'VH1', bet: 'BET', 'cartoon network': 'Cartoon Network',
  nickelodeon: 'Nickelodeon', 'disney channel': 'Disney Channel', 'adult swim': 'Adult Swim', trutv: 'truTV',
  oxygen: 'Oxygen', 'investigation discovery': 'Investigation Discovery', gsn: 'GSN', reelz: 'Reelz',
  'cooking channel': 'Cooking Channel', motortrend: 'MotorTrend', cnn: 'CNN', msnbc: 'MSNBC',
  'fox news': 'Fox News', cnbc: 'CNBC', hln: 'HLN', newsmax: 'Newsmax', espn: 'ESPN', fs1: 'FS1', fs2: 'FS2',
  'fox sports': 'Fox Sports', 'nbc sports': 'NBC Sports', 'nfl network': 'NFL Network', 'mlb network': 'MLB Network',
  'nba tv': 'NBA TV', 'golf channel': 'Golf Channel', 'tennis channel': 'Tennis Channel', hbo: 'HBO',
  cinemax: 'Cinemax', showtime: 'Showtime', starz: 'Starz', 'mgm+': 'MGM+', epix: 'MGM+',
};

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface LineupChannel {
  /** Proper display name, e.g. "USA Network". */
  name: string;
  /** networkSlug(name) — the join key against an airing's network. */
  slug: string;
}

/**
 * The supported guide channels, de-duplicated by slug (so "nat geo" and
 * "national geographic", or "mgm+"/"epix", collapse to one row). Order is the
 * allowlist order; the guide re-sorts by on-now/alphabetical at build time.
 */
export const GUIDE_CHANNEL_LINEUP: LineupChannel[] = Array.from(
  new Map(
    MAJOR_US_NETWORKS.map((n) => {
      const name = DISPLAY[n] ?? titleCase(n);
      return [networkSlug(name), { name, slug: networkSlug(name) }] as const;
    }),
  ).values(),
);

/** Fast membership + name lookup by slug. */
export const LINEUP_BY_SLUG: ReadonlyMap<string, LineupChannel> = new Map(
  GUIDE_CHANNEL_LINEUP.map((c) => [c.slug, c]),
);

/** How many supported channels the guide guarantees a row for. */
export const GUIDE_LINEUP_SIZE = GUIDE_CHANNEL_LINEUP.length;
