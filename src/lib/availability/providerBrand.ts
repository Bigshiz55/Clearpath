import type { WatchLine } from '@/lib/availability/watchPresentation';

/**
 * Collapsing several plan variants of the SAME service to one brand tile.
 *
 * "Peacock Premium" and "Peacock Premium Plus" are one brand (Peacock) and must
 * show one logo on the compact card; the exact plans stay in View options. This
 * is done with NO per-brand table: two options that share a TMDB logo are the
 * same brand (language-independent and exact), and when a logo is missing a
 * brand key is derived by stripping the same list of generic tier words from
 * every service — so a brand we have never seen still dedupes correctly, and two
 * genuinely different services never merge.
 */

/** Generic subscription-tier / channel qualifiers, identical for every service. */
const TIER_WORDS =
  /\b(?:premium plus|premium|plus|with ads|ad[- ]?supported|amazon channel|apple tv channel|roku premium channel|basic|standard|free|hd|uhd|4k)\b/g;

export function brandKey(l: WatchLine): string {
  if (l.logoPath) return `logo:${l.logoPath}`;
  const base = (l.service ?? l.text).toLowerCase();
  return `name:${base.replace(TIER_WORDS, '').replace(/[^a-z0-9]+/g, ' ').trim()}`;
}

/**
 * One line per brand, keeping the FIRST occurrence. The resolver has already
 * ordered options best-availability-first (included before rent/buy, a real
 * deep link before none), so the survivor is the strongest way to watch.
 */
export function dedupeByBrand(lines: WatchLine[]): WatchLine[] {
  const seen = new Set<string>();
  const out: WatchLine[] = [];
  for (const l of lines) {
    const key = brandKey(l);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(l);
  }
  return out;
}
