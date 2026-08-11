/**
 * CHANNEL IDENTITY — the normalization boundary between a source's naming and
 * this product's business logic.
 *
 * The guide had three channels on it that do not exist as television channels:
 * `NBC.COM`, `ABC NEWS LIVE` and `CBS NEWS`. They are TVmaze *web channel*
 * records — streaming feeds — and they reached the guide because two separate
 * things were true at once, either of which alone was enough to cause it:
 *
 *   1. The ingest collapsed two different concepts into one string:
 *      `show.network?.name ?? show.webChannel?.name`. After that expression
 *      there is no way to ask "was this a linear channel?", because the answer
 *      was thrown away at the point the question stopped being askable.
 *
 *   2. Matching was prefix-based: `n.startsWith(net)`. "nbc.com" starts with
 *      "nbc", so NBC's entry in the allowlist admitted NBC's website. The same
 *      rule admitted "ABCDEFG Network" and "Foxtel".
 *
 * Both are fixed here, and deliberately BOTH — either one alone would still
 * leave a plausible route back in:
 *
 *   • STRUCTURAL: `classifySourceChannel` decides `linear` vs `web` from WHICH
 *     FIELD the source populated, not from the name. A web-only row can never
 *     be returned as a `LinearChannel`, whatever it is called. That holds even
 *     for a web feed named exactly "NBC".
 *   • NOMINAL: `resolveLinearChannel` matches a normalized name against an
 *     EXPLICIT alias table, exactly. No prefixes, no substrings, no fuzz. A
 *     name we have not deliberately claimed is not a channel we carry.
 *
 * WHY A CANONICAL ID AND NOT A NAME. One channel arrives under several names
 * ("Fox News", "Fox News Channel"), and until they collapse to one id the guide
 * can render the same channel twice. Identity is the id; the name is a label.
 *
 * Pure: no I/O, no clock. Safe to import from the request path, the batch
 * ingest, and tests alike.
 */

/** What kind of thing the source was describing. */
export type ChannelKind = 'linear' | 'web';

export type LinearCategory = 'broadcast' | 'cable' | 'news' | 'sports' | 'premium' | 'spanish';

/** A real linear television channel we carry, in canonical form. */
export interface LinearChannel {
  kind: 'linear';
  /** Stable identity. Two source names for one channel share this. */
  id: string;
  /** Display name, ours — not whatever the source happened to send. */
  name: string;
  category: LinearCategory;
}

/** A streaming/web feed. Real, nameable, and NOT a television channel. */
export interface WebChannel {
  kind: 'web';
  /** Namespaced so a web id can never collide with a linear id. */
  id: string;
  /** The source's own name, preserved — we do not pretend to canonicalise it. */
  name: string;
}

export type ResolvedChannel = LinearChannel | WebChannel;

/**
 * What a source told us about where something aired. The two fields are kept
 * SEPARATE all the way to the boundary; collapsing them is the original defect.
 */
export interface SourceChannelRef {
  /** TVmaze `show.network.name` — a linear broadcaster. */
  networkName?: string | null;
  /** TVmaze `show.webChannel.name` — a streaming service. */
  webChannelName?: string | null;
}

/**
 * Fold a source's spelling into a comparable key: lowercase, punctuation to
 * spaces, whitespace collapsed. "Fox News Channel" and "FOX  NEWS  CHANNEL"
 * agree; "NBC" and "NBC.com" deliberately DO NOT — the dot becomes a space and
 * the second key is "nbc com", which no alias claims.
 */
export function normalizeChannelName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9+&!]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * The LEGACY station-key spelling of a network name: lowercased, trimmed, every
 * run of non-alphanumerics collapsed to a single hyphen, stripped at the ends.
 * "USA Network" → "usa-network", "A&E" → "a-e", "E!" → "e".
 *
 * UNCHANGED ON PURPOSE — it is baked into `tv_stations.provider_station_id`
 * values that already exist in the database, so its output is a storage
 * contract, not an implementation detail. New code wanting a stable per-channel
 * key should use a canonical `id` instead; this exists so the cleanup can still
 * recognise stations written under the old scheme.
 *
 * Defined HERE rather than in `ingest/nationalNetworks.ts`, where it used to
 * live and from which it is still re-exported for its existing callers. It is
 * pure naming with no ingest dependency, and leaving it under `ingest/` meant
 * `carriedStations.ts` — pure identity code — had to import from the ingest
 * layer to build its legacy-key set, giving `channels/ → ingest/ → channels/`.
 * A cycle between layers is the kind of thing that is free to fix now and
 * expensive to fix once something else depends on it.
 */
export function networkSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

interface CanonicalDef {
  id: string;
  name: string;
  category: LinearCategory;
  /** Every spelling that MEANS this channel. The display name is implied. */
  aliases?: string[];
}

/**
 * THE CHANNELS WE CLAIM TO CARRY.
 *
 * Adding one is a deliberate act: a name is admitted because someone decided it
 * names a channel we support, never because it happened to share a prefix with
 * one. Aliases carry the source spellings actually observed on TVmaze — see
 * `scripts/tv/guideCoverageAudit.ts`, which prints every name the source
 * returned and which ones we rejected, so this list can be widened against
 * evidence rather than guesswork.
 */
const CANONICAL: CanonicalDef[] = [
  // ── Broadcast ────────────────────────────────────────────────────────────
  { id: 'abc', name: 'ABC', category: 'broadcast' },
  { id: 'cbs', name: 'CBS', category: 'broadcast' },
  { id: 'nbc', name: 'NBC', category: 'broadcast' },
  { id: 'fox', name: 'FOX', category: 'broadcast', aliases: ['fox broadcasting company'] },
  { id: 'the-cw', name: 'The CW', category: 'broadcast', aliases: ['cw', 'the cw television network'] },
  { id: 'pbs', name: 'PBS', category: 'broadcast' },
  { id: 'ion', name: 'ION Television', category: 'broadcast', aliases: ['ion', 'ion tv'] },
  { id: 'mynetworktv', name: 'MyNetworkTV', category: 'broadcast', aliases: ['my network tv'] },
  // ── Spanish-language ─────────────────────────────────────────────────────
  { id: 'telemundo', name: 'Telemundo', category: 'spanish' },
  { id: 'univision', name: 'Univision', category: 'spanish' },
  { id: 'las-estrellas', name: 'Las Estrellas', category: 'spanish' },
  // ── Cable entertainment ──────────────────────────────────────────────────
  { id: 'amc', name: 'AMC', category: 'cable' },
  { id: 'usa-network', name: 'USA Network', category: 'cable', aliases: ['usa'] },
  { id: 'tnt', name: 'TNT', category: 'cable' },
  { id: 'tbs', name: 'TBS', category: 'cable' },
  { id: 'fx', name: 'FX', category: 'cable' },
  { id: 'fxx', name: 'FXX', category: 'cable' },
  { id: 'bravo', name: 'Bravo', category: 'cable' },
  { id: 'e', name: 'E!', category: 'cable', aliases: ['e entertainment', 'e!'] },
  { id: 'comedy-central', name: 'Comedy Central', category: 'cable' },
  { id: 'paramount-network', name: 'Paramount Network', category: 'cable' },
  { id: 'syfy', name: 'Syfy', category: 'cable' },
  { id: 'freeform', name: 'Freeform', category: 'cable' },
  { id: 'hallmark', name: 'Hallmark Channel', category: 'cable', aliases: ['hallmark'] },
  { id: 'hallmark-mystery', name: 'Hallmark Mystery', category: 'cable', aliases: ['hallmark movies mysteries'] },
  { id: 'hallmark-family', name: 'Hallmark Family', category: 'cable', aliases: ['hallmark drama'] },
  { id: 'hgtv', name: 'HGTV', category: 'cable' },
  { id: 'food-network', name: 'Food Network', category: 'cable' },
  { id: 'cooking-channel', name: 'Cooking Channel', category: 'cable' },
  { id: 'discovery', name: 'Discovery', category: 'cable', aliases: ['discovery channel'] },
  { id: 'tlc', name: 'TLC', category: 'cable' },
  { id: 'history', name: 'History', category: 'cable', aliases: ['history channel'] },
  { id: 'a-e', name: 'A&E', category: 'cable', aliases: ['a&e', 'a e'] },
  { id: 'lifetime', name: 'Lifetime', category: 'cable' },
  { id: 'lmn', name: 'Lifetime Movie Network', category: 'cable', aliases: ['lmn'] },
  { id: 'national-geographic', name: 'National Geographic', category: 'cable', aliases: ['nat geo', 'natgeo'] },
  { id: 'animal-planet', name: 'Animal Planet', category: 'cable' },
  { id: 'bbc-america', name: 'BBC America', category: 'cable' },
  { id: 'ifc', name: 'IFC', category: 'cable' },
  { id: 'sundancetv', name: 'SundanceTV', category: 'cable', aliases: ['sundance tv'] },
  { id: 'tcm', name: 'TCM', category: 'cable', aliases: ['turner classic movies'] },
  { id: 'tv-land', name: 'TV Land', category: 'cable', aliases: ['tvland'] },
  { id: 'we-tv', name: 'WE tv', category: 'cable' },
  { id: 'own', name: 'OWN', category: 'cable' },
  { id: 'mtv', name: 'MTV', category: 'cable' },
  { id: 'vh1', name: 'VH1', category: 'cable' },
  { id: 'bet', name: 'BET', category: 'cable' },
  { id: 'cartoon-network', name: 'Cartoon Network', category: 'cable' },
  { id: 'adult-swim', name: 'Adult Swim', category: 'cable' },
  { id: 'nickelodeon', name: 'Nickelodeon', category: 'cable', aliases: ['nick'] },
  { id: 'disney-channel', name: 'Disney Channel', category: 'cable' },
  { id: 'trutv', name: 'truTV', category: 'cable' },
  { id: 'oxygen', name: 'Oxygen', category: 'cable', aliases: ['oxygen true crime'] },
  { id: 'investigation-discovery', name: 'Investigation Discovery', category: 'cable', aliases: ['id'] },
  { id: 'gsn', name: 'GSN', category: 'cable' },
  { id: 'reelz', name: 'Reelz', category: 'cable' },
  { id: 'motortrend', name: 'MotorTrend', category: 'cable' },
  { id: 'magnolia-network', name: 'Magnolia Network', category: 'cable' },
  { id: 'vice-tv', name: 'Vice TV', category: 'cable', aliases: ['vice'] },
  // ── News ─────────────────────────────────────────────────────────────────
  { id: 'cnn', name: 'CNN', category: 'news' },
  /* MSNBC rebranded to "MS NOW" in 2026 and the allowlist still said "msnbc",
     so the second-busiest news network in the source — 13 airings in a single
     day — was rejected outright. One channel, both names. */
  { id: 'msnbc', name: 'MS NOW', category: 'news', aliases: ['msnbc', 'ms now'] },
  { id: 'newsnation', name: 'NewsNation', category: 'news', aliases: ['news nation'] },
  { id: 'fox-news', name: 'Fox News Channel', category: 'news', aliases: ['fox news'] },
  { id: 'fox-business', name: 'Fox Business Network', category: 'news', aliases: ['fox business'] },
  { id: 'cnbc', name: 'CNBC', category: 'news' },
  { id: 'hln', name: 'HLN', category: 'news' },
  { id: 'newsmax', name: 'Newsmax', category: 'news', aliases: ['newsmax tv'] },
  // ── Sports ───────────────────────────────────────────────────────────────
  { id: 'espn', name: 'ESPN', category: 'sports' },
  { id: 'espn2', name: 'ESPN2', category: 'sports' },
  { id: 'fs1', name: 'FS1', category: 'sports', aliases: ['fox sports 1'] },
  { id: 'fs2', name: 'FS2', category: 'sports', aliases: ['fox sports 2'] },
  { id: 'nbc-sports', name: 'NBC Sports', category: 'sports' },
  { id: 'nfl-network', name: 'NFL Network', category: 'sports' },
  { id: 'mlb-network', name: 'MLB Network', category: 'sports' },
  { id: 'nba-tv', name: 'NBA TV', category: 'sports' },
  { id: 'golf-channel', name: 'Golf Channel', category: 'sports' },
  { id: 'tennis-channel', name: 'Tennis Channel', category: 'sports' },
  { id: 'sec-network', name: 'SEC Network', category: 'sports' },
  // ── Premium ──────────────────────────────────────────────────────────────
  { id: 'hbo', name: 'HBO', category: 'premium' },
  { id: 'cinemax', name: 'Cinemax', category: 'premium' },
  { id: 'showtime', name: 'Showtime', category: 'premium' },
  { id: 'starz', name: 'Starz', category: 'premium' },
  { id: 'mgm-plus', name: 'MGM+', category: 'premium', aliases: ['mgm+', 'epix'] },
];

/** alias key → canonical channel. Built once; exact lookups only. */
const BY_ALIAS: ReadonlyMap<string, LinearChannel> = (() => {
  const m = new Map<string, LinearChannel>();
  for (const def of CANONICAL) {
    const channel: LinearChannel = { kind: 'linear', id: def.id, name: def.name, category: def.category };
    for (const key of [def.name, ...(def.aliases ?? [])]) {
      const k = normalizeChannelName(key);
      const prev = m.get(k);
      if (prev && prev.id !== channel.id) {
        throw new Error(`channelIdentity: alias "${k}" claimed by both ${prev.id} and ${channel.id}`);
      }
      m.set(k, channel);
    }
  }
  return m;
})();

/** Every canonical linear channel we carry, in registry order. */
export const LINEAR_CHANNELS: readonly LinearChannel[] = CANONICAL.map((d) => ({
  kind: 'linear',
  id: d.id,
  name: d.name,
  category: d.category,
}));

/**
 * The canonical channel a LINEAR network name refers to, or null.
 *
 * Exact match on the normalized name only. "NBC.com" normalizes to "nbc com",
 * which nothing claims, so it returns null — the prefix rule that admitted it
 * is gone rather than patched.
 */
export function resolveLinearChannel(name: string | null | undefined): LinearChannel | null {
  if (!name) return null;
  return BY_ALIAS.get(normalizeChannelName(name)) ?? null;
}

/** Namespaced id for a web feed, so it can never be mistaken for a linear id. */
export function webChannelId(name: string): string {
  return `web:${normalizeChannelName(name).replace(/\s+/g, '-')}`;
}

/**
 * Decide what the source actually described.
 *
 * The order is the whole point: a populated `networkName` means the source is
 * describing a LINEAR broadcast, and only then may the name be matched against
 * the registry. A row carrying only `webChannelName` is a web feed and is
 * returned as one — never promoted, never renamed into a channel, whatever it
 * is called. Returns null when the source named a linear network we do not
 * carry (so callers skip it) — an unknown name is not silently downgraded to a
 * web feed either.
 */
export function classifySourceChannel(ref: SourceChannelRef): ResolvedChannel | null {
  const net = ref.networkName?.trim();
  if (net) return resolveLinearChannel(net);
  const web = ref.webChannelName?.trim();
  if (web) return { kind: 'web', id: webChannelId(web), name: web };
  return null;
}

/** True only for a source row that is a linear channel we carry. */
export function isCarriedLinear(ref: SourceChannelRef): boolean {
  return classifySourceChannel(ref)?.kind === 'linear';
}

/**
 * What the guide can actually say about its own coverage — computed, never
 * asserted. The header sentence is built from this, so it cannot promise a
 * completeness the data does not have.
 */
export interface GuideCoverage {
  /** Linear channels we claim to carry at all. */
  carried: number;
  /** Of those, how many have at least one listing in the window. */
  withListings: number;
  /** Web feeds seen and correctly refused as channels. */
  webFeedsRejected: number;
  /** Source names that looked linear but are not in the registry. */
  unknownLinearNames: string[];
}

export function summarizeCoverage(
  refs: readonly SourceChannelRef[],
): GuideCoverage {
  const withListings = new Set<string>();
  const unknown = new Set<string>();
  let web = 0;
  for (const ref of refs) {
    const net = ref.networkName?.trim();
    if (net) {
      const linear = resolveLinearChannel(net);
      if (linear) withListings.add(linear.id);
      else unknown.add(net);
      continue;
    }
    if (ref.webChannelName?.trim()) web += 1;
  }
  return {
    carried: LINEAR_CHANNELS.length,
    withListings: withListings.size,
    webFeedsRejected: web,
    unknownLinearNames: [...unknown].sort(),
  };
}
