/**
 * Tracking-link builder — pure. Turns a campaign/source into a stable, tracked
 * URL. Every external link Growth OS produces flows through /go/<slug>, which
 * logs the click and 302s to the destination with UTM params attached — so a
 * click can later be attributed to a source, campaign, and content variation.
 */

export interface LinkParams {
  slug: string;
  destination: string; // absolute or path on the production site
  source: string; // utm_source, e.g. "reddit"
  medium?: string; // utm_medium, e.g. "post" | "dm" | "referral"
  campaign?: string; // utm_campaign
  content?: string; // utm_content — the specific post/message variation
  referrer?: string; // a referring user id, for referral links
}

const SLUG_RE = /^[a-z0-9]([a-z0-9-]{1,30})[a-z0-9]$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

/** Deterministic slug from a label (no randomness — safe for resumable code). */
export function slugify(label: string, salt = ''): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
    .replace(/-+$/g, ''); // re-trim: truncation can leave a trailing hyphen
  const suffix = salt ? `-${salt.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6)}` : '';
  const s = `${base || 'link'}${suffix}`.replace(/^-+|-+$/g, '');
  return s.length < 3 ? `${s}-lnk` : s;
}

/** The public short link the founder shares. */
export function shortLink(origin: string, slug: string): string {
  return `${origin.replace(/\/$/, '')}/go/${slug}`;
}

/** The final destination the redirect sends to, with UTM params attached. */
export function destinationWithUtm(p: LinkParams): string {
  const isAbsolute = /^https?:\/\//i.test(p.destination);
  const url = new URL(isAbsolute ? p.destination : `https://placeholder.local${p.destination.startsWith('/') ? '' : '/'}${p.destination}`);
  url.searchParams.set('utm_source', p.source);
  if (p.medium) url.searchParams.set('utm_medium', p.medium);
  if (p.campaign) url.searchParams.set('utm_campaign', p.campaign);
  if (p.content) url.searchParams.set('utm_content', p.content);
  if (p.referrer) url.searchParams.set('ref', p.referrer);
  return isAbsolute ? url.toString() : `${url.pathname}${url.search}`;
}
