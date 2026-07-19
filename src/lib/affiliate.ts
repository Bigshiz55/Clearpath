/**
 * Affiliate link rewriting + outbound-click routing (pure, no I/O — safe to
 * import anywhere and unit-test).
 *
 * Two jobs:
 *  1. `affiliateLink()` appends affiliate parameters to a provider deep link for
 *     the networks we're enrolled in (Amazon Associates, Apple Services). Every
 *     tag is config-driven, so a service earns nothing until its tag is set —
 *     unknown hosts are returned untouched.
 *  2. `outHref()` builds a first-party `/api/out` URL so every provider click is
 *     attributable (and gets tagged server-side at redirect time, keeping tags
 *     out of the client bundle).
 */

export interface AffiliateConfig {
  amazonTag?: string; // Amazon Associates store id → &tag=
  appleToken?: string; // Apple Services affiliate token → &at=
  appleCampaign?: string; // optional Apple campaign token → &ct=
}

const AMAZON_HOSTS = ['amazon.', 'primevideo.com', 'amzn.to', 'amzn.com'];
const APPLE_HOSTS = ['tv.apple.com', 'itunes.apple.com', 'music.apple.com', 'geo.itunes.apple.com', 'apple.co'];

const hostMatches = (host: string, needles: string[]) =>
  needles.some((n) => host === n || host.endsWith(`.${n}`) || host.includes(n));

/** True for a well-formed http(s) URL. */
export function isHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Rewrite a provider deep link with affiliate params for the networks we're
 * enrolled in. Unknown hosts (and any missing tag) pass through unchanged, so
 * this is always safe to call. Never throws — bad input returns the input.
 */
export function affiliateLink(raw: string, cfg: AffiliateConfig): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return raw;
  }
  const host = u.hostname.toLowerCase();
  if (cfg.amazonTag && hostMatches(host, AMAZON_HOSTS)) {
    u.searchParams.set('tag', cfg.amazonTag);
  } else if (cfg.appleToken && hostMatches(host, APPLE_HOSTS)) {
    u.searchParams.set('at', cfg.appleToken);
    if (cfg.appleCampaign) u.searchParams.set('ct', cfg.appleCampaign);
  }
  return u.toString();
}

/** True when at least one affiliate network is configured. */
export function hasAffiliate(cfg: AffiliateConfig): boolean {
  return Boolean(cfg.amazonTag || cfg.appleToken);
}

/**
 * Rough relative payout weight per service, used only to ORDER the provider row
 * so the services that pay us most surface first (commercial ordering — it never
 * changes *which* real options we show, only their order within a type group).
 *
 * Values are relative tiers, not dollar amounts: CPA sign-up bounties (Max,
 * Hulu, Paramount+, fuboTV…) pay far more than a single rental commission, which
 * pays more than an ad-free free tier, which pays more than a service with no
 * affiliate program at all (Netflix). Tune freely — keys are name-normalized.
 */
const PROVIDER_PAYOUTS: Record<string, number> = {
  // High-value CPA sign-up bounties
  fubotv: 6, max: 5, hbomax: 5, hulu: 5, paramount: 4, starz: 4, showtime: 4,
  britbox: 4, philo: 4, peacock: 3, disney: 3, amc: 3, discovery: 3, acorntv: 3,
  crunchyroll: 3, mubi: 3, shudder: 3, appletv: 3, espn: 3,
  // Rental / purchase commissions (one-time, smaller)
  amazonvideo: 2, primevideo: 2, googleplaymovies: 1.5, microsoftstore: 1.5, vudu: 1.5, youtube: 1,
  // Free / ad-supported — little or no payout
  freevee: 1, tubi: 0.5, plutotv: 0.5, therokuchannel: 0.5, crackle: 0.5, plex: 0.5,
  // No affiliate program
  netflix: 0,
};

const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Relative payout weight for a provider (higher = surface earlier). Unknown
 * services get a neutral 1 so they sort above known no-payout ones (Netflix)
 * but below known bounties.
 */
export function providerPayout(name: string): number {
  const n = normName(name);
  if (n in PROVIDER_PAYOUTS) return PROVIDER_PAYOUTS[n]!;
  for (const [k, v] of Object.entries(PROVIDER_PAYOUTS)) if (n.includes(k)) return v;
  return 1;
}

export interface OutParams {
  u: string; // destination URL (raw provider deep link)
  p?: string; // provider name, for attribution
  t?: string; // provider type (flatrate/rent/buy/…)
  m?: string; // media type
  id?: string | number; // tmdb id
}

/**
 * First-party outbound URL. Rendered links point here; `/api/out` logs the
 * click, tags it, and 302s onward. Returns the raw URL unchanged if it isn't a
 * valid http(s) link (nothing to route).
 */
export function outHref(p: OutParams): string {
  if (!isHttpUrl(p.u)) return p.u;
  const q = new URLSearchParams({ u: p.u });
  if (p.p) q.set('p', p.p);
  if (p.t) q.set('t', p.t);
  if (p.m) q.set('m', p.m);
  if (p.id != null) q.set('id', String(p.id));
  return `/api/out?${q.toString()}`;
}
