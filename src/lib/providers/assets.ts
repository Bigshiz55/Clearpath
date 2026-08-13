/**
 * VERIFIED OFFICIAL BRAND ASSETS, KEYED BY CANONICAL PROVIDER IDENTITY.
 *
 * The registry used to resolve a logo only when the CALLER already held one.
 * That was enough for a card hydrated from TMDB provider rows and useless
 * everywhere else — the subscription picker, a group verdict's service list, a
 * judge's ruling and the availability row all know a service by id or by name
 * and nothing more, so every one of them fell back to text for brands
 * WatchVerd1ct plainly knows. This table closes that gap: canonical provider
 * identity → the service's own mark.
 *
 * ── HOW AN ENTRY GETS IN HERE ─────────────────────────────────────────────
 * Every path below was fetched from image.tmdb.org and LOOKED AT before it was
 * written down. A 200 is not verification — it only proves some image exists —
 * so each one was rendered and confirmed to be that company's current mark.
 * A path that cannot be verified that way does not go in the table, because a
 * wrong logo is a false claim about who carries a title, and text is a better
 * answer than a confident lie.
 *
 * `scripts/syncProviderLogos.ts` fills the gaps from TMDB's own
 * `/watch/providers` endpoint using the server's key — see its header. It
 * writes candidates for review; it does not silently trust them either.
 *
 * ── WHAT THIS IS NOT ──────────────────────────────────────────────────────
 * It is not a second brand map. `providers/brand.ts` is still the only lookup
 * anything renders through; this is the asset half of that one registry, split
 * into its own file purely because a data table and the rules that read it are
 * easier to review apart.
 */

export interface ProviderAsset {
  /** TMDB watch-provider id, where the brand has one. */
  providerId: number | null;
  /** The official display name this asset belongs to. */
  name: string;
  /** TMDB `logo_path`, verified by eye. */
  logoPath: string;
}

/**
 * PLAN WORDS ONLY — never distribution words.
 *
 * "Peacock Premium" is Peacock and wears Peacock's mark. "Paramount+ Amazon
 * Channel" is a different product bought a different way, and must NOT inherit
 * Paramount+'s asset just because the words overlap; `amazon channel` is
 * deliberately absent from this list for exactly that reason.
 */
const PLAN_WORDS =
  /\b(?:premium plus|premium|plus|essential|with ads|ad[- ]?supported|basic|standard|hd|uhd|4k|free)\b/g;

/** The key both sides of the asset lookup are built with. */
export function providerAssetKey(name: string | null | undefined): string {
  return (typeof name === 'string' ? name : '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(PLAN_WORDS, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * The verified table. Ordered as the subscription catalogue is ordered, so a
 * gap is visible at a glance rather than buried.
 */
export const PROVIDER_ASSETS: ProviderAsset[] = [
  { providerId: 8, name: 'Netflix', logoPath: '/pbpMk2JmcoNnQwx5JGpXngfoWtp.jpg' },
  { providerId: 9, name: 'Prime Video', logoPath: '/emthp39XA2YScoYL1p0sdbAH2WA.jpg' },
  { providerId: 337, name: 'Disney+', logoPath: '/7rwgEs15tFwyR9NPQ5vpzxTj19Q.jpg' },
  { providerId: 1899, name: 'Max', logoPath: '/6Q3ZYUNA9Hsgj6iWnVsw2gR5V6z.jpg' },
  { providerId: 15, name: 'Hulu', logoPath: '/zxrVdFjIjLqkfnwyghnfywTn3Lh.jpg' },
  { providerId: 531, name: 'Paramount+', logoPath: '/h5DcR0J2EESLitnhR8xLG1QymTE.jpg' },
  { providerId: 386, name: 'Peacock', logoPath: '/2aGrp1xw3qhwCYvNGAJZPdjfeeX.jpg' },
  // The mark reads "Apple tv" — Apple dropped the raised plus from the wordmark
  // in the 2024 app rebrand, so this IS the current asset for the subscription.
  { providerId: 350, name: 'Apple TV+', logoPath: '/9ghgSC0MA082EL6HLCW3GalykFD.jpg' },
  // ── Resolved from the deployed app's OWN TMDB data ────────────────────
  // These seven were missing because their paths could not be recalled. They
  // were not guessed: production's `/api/ratings/:type/:id` already returns
  // TMDB's provider rows, each pairing a `provider_name` with its `logo_path`,
  // so the identity comes from TMDB itself rather than from a name match. Each
  // path was then fetched and LOOKED AT, same rule as everything above.
  { providerId: 43, name: 'Starz', logoPath: '/yIKwylTLP1u8gl84Is7FItpYLGL.jpg' },
  { providerId: 526, name: 'AMC+', logoPath: '/ovmu6uot1XVvsemM2dDySXLiX57.jpg' },
  { providerId: 257, name: 'Fubo', logoPath: '/9BgaNQRMDvVlji1JBZi6tcfxpKx.jpg' },
  { providerId: 73, name: 'Tubi', logoPath: '/zLYr7OPvpskMA4S79E3vlCi71iC.jpg' },
  { providerId: 300, name: 'Pluto TV', logoPath: '/dB8G41Q6tSL5NBisrIeqByfepBc.jpg' },
  { providerId: 207, name: 'The Roku Channel', logoPath: '/wQzSN83BnWVgO7xEh0SeTVqtrFv.jpg' },
  // Verified and kept even though it is outside the curated picker: MUBI turns
  // up in real provider rows, and a brand we can prove should never be text.
  { providerId: 11, name: 'MUBI', logoPath: '/fj9Y8iIMFUC6952HwxbGixTQPb7.jpg' },
];

/**
 * SHOWTIME IS ABSENT ON PURPOSE, AND IT IS NOT AN OVERSIGHT.
 *
 * TMDB's US watch-provider data no longer carries a standalone Showtime entry —
 * checked across seven Showtime originals (Dexter, Dexter: New Blood, Weeds,
 * Californication, Penny Dreadful, The Affair, Your Honor, Billions, The Chi):
 * not one returns a Showtime provider row. The service was folded into
 * "Paramount+ with Showtime", so upstream has no separate mark to give us.
 *
 * Handing Showtime the Paramount+ asset would be exactly the merge this file
 * forbids — a different subscription wearing another brand's logo. It renders
 * as the official NAME until an authoritative source carries one again.
 */

const BY_ID = new Map<number, ProviderAsset>();
const BY_KEY = new Map<string, ProviderAsset>();
for (const a of PROVIDER_ASSETS) {
  if (a.providerId != null) BY_ID.set(a.providerId, a);
  // First entry wins, so an alias can never displace the canonical brand.
  const k = providerAssetKey(a.name);
  if (!BY_KEY.has(k)) BY_KEY.set(k, a);
}

/**
 * The verified asset for a provider, by id when the caller has one and by
 * canonical name otherwise. Null when we hold nothing — which is the honest
 * answer and renders as the official NAME.
 */
export function assetForProvider(name: string | null | undefined, providerId?: number | null): string | null {
  if (providerId != null) {
    const byId = BY_ID.get(providerId);
    if (byId) return byId.logoPath;
  }
  // An empty key must never match a table entry — `''` is "no brand named",
  // and returning some entry's asset for it would be inventing a provider.
  const key = providerAssetKey(name);
  if (!key) return null;
  return BY_KEY.get(key)?.logoPath ?? null;
}
