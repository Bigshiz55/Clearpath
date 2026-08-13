/**
 * THE ONE PROVIDER-BRAND REGISTRY.
 *
 * Every visible reference to a streaming service, network, channel or platform
 * resolves its presentation here — `WhereToWatch`/`ProviderLogos`, the
 * "Why this Verd1ct?" availability row, provider chips, availability rows,
 * channel cards and the landing surfaces. One lookup, so the same service
 * cannot appear as a logo in one component and as "📺 fuboTV" in the next.
 *
 * ── WHAT IT RESOLVES ──────────────────────────────────────────────────────
 *   • the OFFICIAL display name  ("fuboTV" → "Fubo", "Paramount Plus" → "Paramount+")
 *   • the OFFICIAL logo asset    (the verified path the caller was given)
 *   • accessible alt text        (brand + how you get it, spelled out)
 *   • a brand-safe fallback      (restrained plain text — never an emoji)
 *
 * ── WHAT IT WILL NOT DO ───────────────────────────────────────────────────
 *   • It never invents a logo. `logoPath` is only ever the VERIFIED path the
 *     caller already holds (TMDB `logo_path`), passed through. There is no
 *     table of guessed asset URLs here and there must never be one: a wrong
 *     logo is a false claim about who carries a title.
 *   • It never merges two distinct provider identities. Renaming is EXACT
 *     match on the whole normalized name, so "Paramount+ Amazon Channel" — a
 *     genuinely different way to buy the thing — stays itself and never
 *     collapses into "Paramount+". The only thing the table changes is how a
 *     brand spells its own name.
 *   • It never substitutes an emoji for a brand. When no verified asset
 *     exists the answer is the official NAME, set in text.
 *
 * Pure and client-safe: no I/O, no server imports.
 */

/** Generic subscription-tier / channel qualifiers, identical for every service.
 *  Used ONLY for the dedupe key — never to rename a service. */
const TIER_WORDS =
  /\b(?:premium plus|premium|plus|with ads|ad[- ]?supported|amazon channel|apple tv channel|roku premium channel|basic|standard|free|hd|uhd|4k)\b/g;

/**
 * How a brand spells its own name, keyed by the normalized name the data gives
 * us. EXACT whole-name matches only.
 *
 * Every entry here is a typography or wordmark correction for the SAME entity:
 * Fubo dropped the "TV" from its wordmark; Paramount, Apple, Disney, AMC, MGM,
 * Discovery and ESPN all set their tier as "+" rather than the word "Plus";
 * Amazon's subscription catalogue is branded "Prime Video". Nothing here maps
 * one service onto a different service.
 *
 * Names that are ALREADY official (Netflix, Hulu, Max, Peacock, Starz, Tubi,
 * The Roku Channel, YouTube TV…) are deliberately absent: an identity that
 * needs no correction passes straight through.
 */
const OFFICIAL_NAMES: Record<string, string> = {
  fubotv: 'Fubo',
  'fubo tv': 'Fubo',
  'amazon prime video': 'Prime Video',
  'paramount plus': 'Paramount+',
  'paramount plus premium': 'Paramount+ Premium',
  'paramount plus basic with ads': 'Paramount+ Basic with Ads',
  'apple tv plus': 'Apple TV+',
  'disney plus': 'Disney+',
  'amc plus': 'AMC+',
  'mgm plus': 'MGM+',
  'discovery plus': 'discovery+',
  'espn plus': 'ESPN+',
};

/** Lower-cased, whitespace-collapsed — the key both tables are read with. */
export function normalizeProviderName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * The official display name for a provider, or the name unchanged when it is
 * already official (which is the common case).
 */
export function officialProviderName(name: string): string {
  const raw = name.trim();
  return OFFICIAL_NAMES[normalizeProviderName(raw)] ?? raw;
}

/**
 * Stable identity for collapsing plan variants of ONE brand.
 *
 * Two options that share a verified logo are the same brand (language
 * independent and exact). Without a logo, a key is derived by stripping the
 * same list of generic tier words from every service — so a brand we have
 * never seen still dedupes correctly, and two genuinely different services
 * never merge.
 */
export function providerBrandKey(name: string, logoPath?: string | null): string {
  if (logoPath) return `logo:${logoPath}`;
  // CANONICALIZE FIRST. "fuboTV" and "Fubo" are one company, and a list that
  // received both spellings used to print both. Keying off the official name
  // makes the identity independent of which label the data happened to carry.
  const official = normalizeProviderName(officialProviderName(name));
  return `name:${official.replace(TIER_WORDS, '').replace(/[^a-z0-9]+/g, ' ').trim()}`;
}

/**
 * A list of provider names in their official spelling, one entry per brand,
 * original order preserved. For the surfaces that hold NAMES ONLY (a group
 * verdict's "everyone can watch it on…", a judge's ruling) and therefore have
 * no asset to render — the honest presentation there is restrained text, and
 * this is what makes it say "Fubo" rather than "fuboTV".
 */
export function officialProviderNames(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    if (!raw || !raw.trim()) continue;
    const key = providerBrandKey(raw, null);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(officialProviderName(raw));
  }
  return out;
}

export interface ProviderBrandInput {
  /** The provider name exactly as the data gave it. */
  name: string;
  /** A VERIFIED logo path (TMDB `logo_path`). Null/absent → text fallback. */
  logoPath?: string | null;
  /** How you get it, for the accessible label: "Included with subscription". */
  access?: string | null;
}

export interface ProviderBrand {
  /** Dedupe identity — see `providerBrandKey`. */
  key: string;
  /** The official display name. */
  name: string;
  /** The verified logo path, or null. Never invented. */
  logoPath: string | null;
  /** Accessible label: the brand, plus how you get it when the caller knows. */
  alt: string;
  /** True when there is no asset and the brand must render as plain text. */
  textOnly: boolean;
}

/** Resolve one provider reference to its official presentation. */
export function resolveProviderBrand(input: ProviderBrandInput): ProviderBrand {
  const name = officialProviderName(input.name);
  const logoPath = input.logoPath ?? null;
  const access = input.access?.trim();
  return {
    key: providerBrandKey(input.name, logoPath),
    name,
    logoPath,
    // The label always carries the FULL fact, even when the tile shows only a
    // logo — a screen reader must not lose "rent" to a corner badge.
    alt: access ? `${name} — ${access}` : name,
    textOnly: logoPath == null,
  };
}
