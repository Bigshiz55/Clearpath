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
