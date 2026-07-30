/**
 * MEDIA-TYPE + SOURCE ONTOLOGY (pure). A strict vocabulary so "movies" can never
 * be satisfied by a TV series, and so a network (Lifetime) is never confused
 * with a streaming provider (Netflix). No I/O; unit-tested.
 */

export type MediaKind = 'movie' | 'tv_series' | 'miniseries' | 'episode' | 'documentary' | 'unknown';

/** Normalize a user media word to a canonical MediaKind. */
export function normalizeMediaWord(word: string): MediaKind | null {
  const w = word.toLowerCase().trim();
  if (/^(movies?|films?|features?|flicks?|feature films?)$/.test(w)) return 'movie';
  if (/^(mini-?series|limited series)$/.test(w)) return 'miniseries';
  if (/^(documentar(y|ies)|docs?)$/.test(w)) return 'documentary';
  if (/^(episodes?)$/.test(w)) return 'episode';
  if (/^(shows?|series|tv series|tv shows?|programmes?|programs?|sitcoms?)$/.test(w)) return 'tv_series';
  return null;
}

/** Is a candidate's TMDB media type compatible with a requested MediaKind? */
export function mediaTypeSatisfies(requested: MediaKind, candidate: 'movie' | 'tv'): boolean {
  if (requested === 'movie' || requested === 'documentary') return candidate === 'movie';
  if (requested === 'tv_series' || requested === 'miniseries' || requested === 'episode') return candidate === 'tv';
  return true; // 'unknown' → no media-type constraint
}

// ── Source ontology ─────────────────────────────────────────────────────────
export type SourceType = 'streaming_provider' | 'network' | 'live_tv_provider' | 'brand';

export interface CanonicalSource {
  canonicalName: string;
  sourceType: SourceType;
  aliases: string[];
  /** TMDB streaming provider id, when this source maps to one. */
  providerId?: number;
  /** detectNetwork key, when this is a linear network. */
  networkKey?: string;
  /** Sister sources NOT included by default (e.g. Lifetime → LMN). */
  relatedSources?: { name: string; relationship: string; includedByDefault: boolean }[];
}

const SOURCES: CanonicalSource[] = [
  { canonicalName: 'Netflix', sourceType: 'streaming_provider', providerId: 8, aliases: ['netflix', 'netflx'] },
  { canonicalName: 'Prime Video', sourceType: 'streaming_provider', providerId: 9, aliases: ['prime', 'prime video', 'amazon', 'amazon prime', 'amazon prime video'] },
  { canonicalName: 'Hulu', sourceType: 'streaming_provider', providerId: 15, aliases: ['hulu'] },
  { canonicalName: 'Max', sourceType: 'streaming_provider', providerId: 1899, aliases: ['max', 'hbo max'] },
  { canonicalName: 'Disney+', sourceType: 'streaming_provider', providerId: 337, aliases: ['disney+', 'disney plus'] },
  { canonicalName: 'Apple TV+', sourceType: 'streaming_provider', providerId: 350, aliases: ['apple tv+', 'apple tv', 'appletv'] },
  { canonicalName: 'Peacock', sourceType: 'streaming_provider', providerId: 386, aliases: ['peacock'] },
  { canonicalName: 'Paramount+', sourceType: 'streaming_provider', providerId: 531, aliases: ['paramount+', 'paramount plus'] },
  { canonicalName: 'BritBox', sourceType: 'streaming_provider', providerId: 151, aliases: ['britbox', 'brit box'] },
  { canonicalName: 'Acorn TV', sourceType: 'streaming_provider', providerId: 87, aliases: ['acorn', 'acorn tv'] },
  { canonicalName: 'Tubi', sourceType: 'streaming_provider', providerId: 73, aliases: ['tubi'] },
  // Linear networks — NOT streaming providers. Availability is a broadcast/app
  // question the discover API can't answer, so callers must verify separately.
  {
    canonicalName: 'Lifetime', sourceType: 'network', networkKey: 'lifetime',
    aliases: ['lifetime', 'lifetime channel', 'lifetime tv'],
    relatedSources: [{ name: 'Lifetime Movie Network', relationship: 'sister_network', includedByDefault: false }],
  },
  { canonicalName: 'Lifetime Movie Network', sourceType: 'network', networkKey: 'lmn', aliases: ['lifetime movie network', 'lmn'] },
  {
    canonicalName: 'Hallmark Channel', sourceType: 'network', networkKey: 'hallmark',
    aliases: ['hallmark', 'hallmark channel', 'hallmark tv'],
    relatedSources: [{ name: 'Hallmark Mystery', relationship: 'sister_network', includedByDefault: false }],
  },
  { canonicalName: 'HBO', sourceType: 'network', networkKey: 'hbo', aliases: ['hbo'] },
  { canonicalName: 'AMC', sourceType: 'network', networkKey: 'amc', aliases: ['amc'] },
  { canonicalName: 'FX', sourceType: 'network', networkKey: 'fx', aliases: ['fx'] },
  { canonicalName: 'TNT', sourceType: 'network', networkKey: 'tnt', aliases: ['tnt'] },
];

/** Resolve a raw source phrase to a canonical source (alias-aware). Null when
 *  the phrase names no known source. */
export function resolveSource(raw: string): CanonicalSource | null {
  // Collapse common two-word spellings so "life time"/"brit box"/"apple tv"
  // resolve to their canonical single-token aliases.
  const collapsed = raw
    .replace(/\blife\s+time\b/gi, 'lifetime')
    .replace(/\bbrit\s+box\b/gi, 'britbox')
    .replace(/\bapple\s+tv\b/gi, 'apple tv');
  const t = ` ${collapsed.toLowerCase().replace(/[^a-z0-9+ ]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
  // Longest alias first so "lifetime movie network" beats "lifetime".
  const ranked = SOURCES.flatMap((s) => s.aliases.map((a) => ({ s, a }))).sort((x, y) => y.a.length - x.a.length);
  for (const { s, a } of ranked) {
    if (t.includes(` ${a} `)) return s;
  }
  return null;
}

export function isNetwork(s: CanonicalSource): boolean {
  return s.sourceType === 'network';
}
