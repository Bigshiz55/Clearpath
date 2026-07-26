/**
 * PROVIDER NORMALIZATION — one canonical name per streaming service.
 *
 * Users, TMDB and our own copy all disagree on naming: "HBO Max", "Max",
 * "Amazon Prime", "Prime Video", "Paramount Plus", "Paramount+". Without a
 * single canonical form a provider query silently matches nothing and the
 * result set looks empty for a service that is fully stocked.
 *
 * Pure and side-effect free so it can be unit-tested exhaustively.
 */

export interface ProviderDef {
  /** Canonical id used internally. */
  id: string;
  /** Canonical display name. */
  name: string;
  /** TMDB watch-provider id, when the catalog source knows this service. */
  tmdbId: number | null;
  kind: 'subscription' | 'premium' | 'fast' | 'niche';
  aliases: string[];
}

export const PROVIDERS: ProviderDef[] = [
  { id: 'netflix', name: 'Netflix', tmdbId: 8, kind: 'subscription', aliases: ['netflix', 'nflx'] },
  { id: 'prime_video', name: 'Prime Video', tmdbId: 9, kind: 'subscription',
    aliases: ['prime video', 'amazon prime', 'amazon prime video', 'amazon video', 'prime', 'amazon'] },
  { id: 'hulu', name: 'Hulu', tmdbId: 15, kind: 'subscription', aliases: ['hulu'] },
  { id: 'max', name: 'Max', tmdbId: 1899, kind: 'premium',
    aliases: ['max', 'hbo max', 'hbomax', 'hbo'] },
  { id: 'disney_plus', name: 'Disney+', tmdbId: 337, kind: 'subscription',
    aliases: ['disney+', 'disney plus', 'disneyplus', 'disney'] },
  { id: 'peacock', name: 'Peacock', tmdbId: 386, kind: 'subscription',
    aliases: ['peacock', 'peacock premium'] },
  { id: 'paramount_plus', name: 'Paramount+', tmdbId: 531, kind: 'subscription',
    aliases: ['paramount+', 'paramount plus', 'paramountplus', 'paramount'] },
  { id: 'apple_tv_plus', name: 'Apple TV+', tmdbId: 350, kind: 'subscription',
    aliases: ['apple tv+', 'apple tv plus', 'appletv+', 'apple tv', 'appletv'] },
  { id: 'britbox', name: 'BritBox', tmdbId: 151, kind: 'niche', aliases: ['britbox', 'brit box'] },
  { id: 'acorn_tv', name: 'Acorn TV', tmdbId: 87, kind: 'niche', aliases: ['acorn tv', 'acorn', 'acorntv'] },
  { id: 'hallmark_plus', name: 'Hallmark+', tmdbId: 34, kind: 'niche',
    aliases: ['hallmark+', 'hallmark plus', 'hallmark movies now', 'hallmark'] },
  { id: 'starz', name: 'Starz', tmdbId: 43, kind: 'premium', aliases: ['starz'] },
  { id: 'showtime', name: 'Showtime', tmdbId: 37, kind: 'premium',
    aliases: ['showtime', 'paramount+ with showtime'] },
  { id: 'amc_plus', name: 'AMC+', tmdbId: 526, kind: 'premium', aliases: ['amc+', 'amc plus'] },
  { id: 'mgm_plus', name: 'MGM+', tmdbId: 34, kind: 'premium', aliases: ['mgm+', 'mgm plus', 'epix'] },
  // FAST (free, ad-supported)
  { id: 'tubi', name: 'Tubi', tmdbId: 73, kind: 'fast', aliases: ['tubi', 'tubi tv'] },
  { id: 'pluto_tv', name: 'Pluto TV', tmdbId: 300, kind: 'fast', aliases: ['pluto', 'pluto tv'] },
  { id: 'roku_channel', name: 'The Roku Channel', tmdbId: 207, kind: 'fast',
    aliases: ['roku', 'the roku channel', 'roku channel'] },
  { id: 'freevee', name: 'Amazon Freevee', tmdbId: 613, kind: 'fast', aliases: ['freevee', 'imdb tv'] },
  { id: 'crackle', name: 'Crackle', tmdbId: 12, kind: 'fast', aliases: ['crackle'] },
  { id: 'plex', name: 'Plex', tmdbId: 538, kind: 'fast', aliases: ['plex'] },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9+]+/g, ' ').trim();

const INDEX = new Map<string, ProviderDef>();
for (const p of PROVIDERS) {
  INDEX.set(norm(p.id), p);
  INDEX.set(norm(p.name), p);
  for (const a of p.aliases) INDEX.set(norm(a), p);
}

/**
 * Resolve any user- or API-supplied name to its canonical provider.
 *
 * Exact-alias first, then a longest-alias containment pass so "on HBO Max
 * tonight" resolves — but "hbo" alone can't beat "hbo max" to the answer.
 */
export function resolveProvider(raw: string | null | undefined): ProviderDef | null {
  if (!raw) return null;
  const n = norm(raw);
  if (!n) return null;
  const exact = INDEX.get(n);
  if (exact) return exact;
  let best: { p: ProviderDef; len: number } | null = null;
  for (const [alias, p] of INDEX) {
    if (alias.length < 3) continue;
    if (n.includes(alias) && (!best || alias.length > best.len)) best = { p, len: alias.length };
  }
  return best?.p ?? null;
}

/** Canonical display name, or the input unchanged when unknown. */
export function canonicalProviderName(raw: string): string {
  return resolveProvider(raw)?.name ?? raw;
}

/** TMDB watch-provider ids for a set of names. Unknown names are dropped. */
export function tmdbProviderIds(names: string[]): number[] {
  const ids = new Set<number>();
  for (const n of names) {
    const p = resolveProvider(n);
    if (p?.tmdbId != null) ids.add(p.tmdbId);
  }
  return [...ids];
}
