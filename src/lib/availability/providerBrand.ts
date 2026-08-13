import type { WatchLine } from '@/lib/availability/watchPresentation';
import { providerBrandKey } from '@/lib/providers/brand';

/**
 * Collapsing several plan variants of the SAME service to one brand tile.
 *
 * "Peacock Premium" and "Peacock Premium Plus" are one brand (Peacock) and must
 * show one logo on the compact card; each surviving tile keeps its exact plan
 * in its own title + aria-label.
 *
 * THE KEY ITSELF NOW LIVES IN THE PROVIDER-BRAND REGISTRY
 * (`src/lib/providers/brand.ts`), because identity and presentation have to
 * agree: the thing that decides two rows are one brand must be the same thing
 * that decides what that brand is called and which logo it wears. This module
 * is the availability-shaped adapter over it — it knows what a `WatchLine` is,
 * the registry does not.
 */

export function brandKey(l: WatchLine): string {
  return providerBrandKey(l.service ?? l.text, l.logoPath);
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
