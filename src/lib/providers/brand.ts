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
 *   • the OFFICIAL logo asset    (the caller's verified path, else our own
 *                                  verified table — see providers/assets.ts)
 *   • accessible alt text        (brand + how you get it, spelled out)
 *   • a brand-safe fallback      (restrained plain text — never an emoji)
 *
 * ── WHAT IT WILL NOT DO ───────────────────────────────────────────────────
 *   • It never invents a logo. An asset is either the VERIFIED path the caller
 *     already holds (TMDB `logo_path`), or the one this project has verified by
 *     eye for that brand — see `providers/assets.ts`, where every entry was
 *     fetched and LOOKED AT before it was written down. Nothing is guessed
 *     per-request and nothing is derived from a name: a wrong logo is a false
 *     claim about who carries a title, so a brand we cannot prove renders as
 *     text.
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
import { assetForProvider, providerNameForId } from './assets';


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
  // TMDB still labels Tubi with the "TV" the brand dropped from its wordmark.
  'tubi tv': 'Tubi',
  // Plan variants of Prime Video, named so they key to the same brand. They are
  // the SAME subscription catalogue with a cheaper tier, not another service.
  'amazon prime video with ads': 'Prime Video with Ads',
  'amazon prime video free with ads': 'Prime Video Free with Ads',
};

/**
 * ── ABSENT IDENTITY IS A STATE, NOT A PROGRAMMING ERROR ───────────────────
 *
 * Every entry point below used to start at `name.trim()`, so `undefined`,
 * `null` or a blank string threw. The nearest caller is a React component
 * (`ProviderChip`), which meant the throw happened DURING RENDER and React
 * unwound to the error boundary: one missing provider name replaced an entire
 * recommendation page with "Something went wrong".
 *
 * These names arrive as deserialized JSON from an API whose payload has gained
 * fields over time, so "no identity" is a real shape that reaches here, not a
 * hypothetical. The registry's answer is a NON-BRAND — an empty name, no asset
 * — which a caller renders as nothing. What it must never be is a guess, and
 * what it must never do is throw.
 */
function nameOrEmpty(name: string | null | undefined): string {
  return typeof name === 'string' ? name.trim() : '';
}

/** Lower-cased, whitespace-collapsed — the key both tables are read with. */
export function normalizeProviderName(name: string | null | undefined): string {
  return nameOrEmpty(name).toLowerCase().replace(/\s+/g, ' ');
}

/**
 * The official display name for a provider, or the name unchanged when it is
 * already official (which is the common case). An absent or blank name
 * resolves to the empty string — there is no brand here to name.
 */
export function officialProviderName(name: string | null | undefined): string {
  const raw = nameOrEmpty(name);
  if (!raw) return '';
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
export function providerBrandKey(name: string | null | undefined, logoPath?: string | null): string {
  // A verified logo is the strongest key the registry has, so a row carrying
  // one is a real brand whatever its name field is doing.
  if (logoPath) return `logo:${logoPath}`;
  // No logo AND no name is one single non-brand, so a dedupe collapses a run
  // of nameless rows instead of multiplying them into empty tiles.
  if (!nameOrEmpty(name)) return 'name:';
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
  /**
   * The provider name exactly as the data gave it. Nullable because this is
   * routinely populated from an API payload rather than a checked value — see
   * the absent-identity note above `nameOrEmpty`.
   */
  name: string | null | undefined;
  /**
   * A VERIFIED logo path (TMDB `logo_path`) the caller already holds. Absent is
   * FINE and no longer means "text": the registry falls back to its own
   * verified asset table, so a surface that knows only a service still shows
   * the brand. See providers/assets.ts.
   */
  logoPath?: string | null;
  /** TMDB watch-provider id, when the caller has one. The strongest key. */
  providerId?: number | null;
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
  // A MISSING NAME IS NOT THE SAME AS A MISSING IDENTITY. A row can arrive
  // with no `name` but a TMDB provider id, which is a primary key from the
  // same source the name would have come from — reading the brand back out of
  // the verified table recovers a fact we hold rather than inventing one, and
  // dropping it would lose a provider we can name with certainty. Resolution
  // by NAME RESEMBLANCE stays forbidden; this is an exact id match or nothing.
  const name = officialProviderName(input.name) || (providerNameForId(input.providerId) ?? '');
  // NO IDENTITY AT ALL, NO BRAND. Returned rather than thrown: nothing names
  // this row, no id we know, and no logo the caller brought. `textOnly` with an
  // empty name is the signal a caller checks to render nothing at all.
  if (!name && !input.logoPath) {
    return { key: 'name:', name: '', logoPath: null, alt: '', textOnly: true };
  }
  // THE CALLER'S OWN ASSET WINS. It came with this exact provider row, so it is
  // the most specific truth available. Only when there is none do we reach for
  // the verified table — which is what makes "Netflix" render as Netflix on a
  // surface that never saw a TMDB provider object.
  const logoPath = input.logoPath ?? assetForProvider(name, input.providerId);
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
