/**
 * ONE SET OF PROVIDER NAMES, WHATEVER FOUND THEM.
 *
 * ── THE DEFECT THIS FIXES ─────────────────────────────────────────────────
 * A search result said "Not yet confirmed" for CSI: NY while the full title
 * page, one tap later, listed Hulu, Paramount+ and The Roku Channel. Same
 * title, same region, same second — two different answers, because they were
 * reading two different systems:
 *
 *   search card   → `watchmode_availability` cache rows ONLY
 *   title page    → `report.providers` (TMDB/JustWatch, enriched by Watchmode)
 *
 * The Watchmode sync job advances roughly fifty titles a day from a fixed
 * candidate pool, so for most of the catalogue there is no cache row and never
 * will be. The card was therefore reporting the state of an internal
 * enrichment queue as though it were a fact about the world. It is not. TMDB
 * already told us where the thing streams, on the very same request that
 * produced the score.
 *
 * ── THE ORDER, AND WHY ────────────────────────────────────────────────────
 *   1. WATCHMODE, when it has rows. It carries deep links and a precise source
 *      type, so it is strictly better where it exists.
 *   2. TMDB/report providers, as a truthful fallback. Real platform names, no
 *      deep link. Shown as what they are.
 *   3. Only when NEITHER has anything: "Not yet confirmed".
 *
 * Provenance is preserved on every option (`provenance`) so nothing downstream
 * can pass TMDB data off as Watchmode-verified. What it must NOT do is hide a
 * real platform name because an internal cache is empty — that is not caution,
 * it is a worse answer.
 *
 * This module invents nothing. It maps evidence we were already given onto the
 * existing option vocabulary; the rules about what may be SAID about an option
 * still live in `watchPresentation.ts`, which is the only thing that chooses
 * words. Pure and client-safe: no I/O, no server imports.
 */
import type { AvailabilityState } from '@/lib/availability/states';
import type { StreamingOption, WatchOption } from '@/lib/availability/watchPresentation';

/** TMDB's provider buckets, as `WatchProvider.type` already models them. */
export type TmdbProviderType = 'flatrate' | 'free' | 'ads' | 'rent' | 'buy';

/**
 * The client-safe slice of `WatchProviders` a card needs. Deliberately smaller
 * than the full type: a search result needs names, kinds and links, not logo
 * paths or JustWatch attribution, and shipping less over the wire matters when
 * twenty cards share one response.
 */
export interface TileProviderOption {
  name: string;
  type: TmdbProviderType;
  /** A real deep link when Watchmode enriched this row; null otherwise. */
  link: string | null;
}

export interface TileProviders {
  region: string;
  options: TileProviderOption[];
  /** When this availability was last confirmed upstream. Never fabricated. */
  checkedAt: string | null;
}

/**
 * TMDB bucket → canonical state.
 *
 * `flatrate` is the one worth pausing on: TMDB means "included in the
 * subscription", which is exactly `included_with_base_subscription`. It is
 * NOT mapped to premium tier, add-on or Prime — those are stronger claims that
 * need their own evidence, and guessing one of them is how a viewer hits a
 * paywall the card promised was not there.
 *
 * `ads` and `free` both mean "costs nothing to press play"; the existing
 * vocabulary has one state for that.
 */
export function stateFromTmdbType(type: string): AvailabilityState {
  switch (type) {
    case 'flatrate':
      return 'included_with_base_subscription';
    case 'free':
    case 'ads':
      return 'free_with_ads';
    case 'rent':
      return 'rent';
    case 'buy':
      return 'buy';
    default:
      // Never a guess. `unverified` is filtered out before display.
      return 'unverified';
  }
}

/**
 * Turn report/TMDB providers into the same options every other source produces.
 *
 * `checked` is true whenever we HAVE a providers payload — even an empty one.
 * That distinction is the whole point of the honest-unknown state: TMDB
 * answering "nothing streams this here" is a RESULT, and must not be reported
 * with the same words as "we never looked".
 */
export function optionsFromTileProviders(p: TileProviders | null | undefined): {
  options: StreamingOption[];
  checked: boolean;
} {
  if (!p) return { options: [], checked: false };
  return {
    checked: true,
    options: p.options.map<StreamingOption>((o) => ({
      kind: 'streaming',
      service: o.name,
      state: stateFromTmdbType(o.type),
      addonName: null,
      // TMDB carries no price. An absent price is shown as absent, never as
      // free or included.
      price: null,
      watchLink: o.link,
      lastVerifiedAt: p.checkedAt,
      provenance: 'tmdb',
    })),
  };
}

/**
 * THE MERGE, IN ONE PLACE.
 *
 * Watchmode wins outright when it has anything — deep links and a precise
 * source type are worth more than a bare name, and mixing the two lists would
 * show the same service twice with different wording.
 *
 * When Watchmode has nothing to say, TMDB answers. `checked` is true if EITHER
 * system looked, because "not yet confirmed" has to mean nobody looked, not
 * "our slowest enrichment queue has not reached this title".
 */
export function mergeProviderOptions<T extends WatchOption>(
  watchmode: { options: T[]; checked: boolean },
  tmdb: { options: T[]; checked: boolean },
): { options: T[]; checked: boolean } {
  const checked = watchmode.checked || tmdb.checked;
  if (watchmode.options.length > 0) return { options: watchmode.options, checked };
  return { options: tmdb.options, checked };
}

/**
 * A one-line summary for a compact surface — the search result, where there is
 * room for a sentence and not for a list.
 *
 * Returns null when there is nothing evidenced to say, so the caller renders
 * the honest unknown state rather than an empty row. Names only: the states
 * and their exact wording belong to `watchPresentation`, and duplicating that
 * vocabulary here is how the two surfaces drift apart again.
 */
export function providerSummary(options: WatchOption[], max = 3): string | null {
  const names: string[] = [];
  for (const o of options) {
    if (o.kind !== 'streaming') continue;
    if (!o.service || names.includes(o.service)) continue;
    names.push(o.service);
  }
  if (names.length === 0) return null;
  if (names.length <= max) return names.join(' · ');
  return `${names.slice(0, max).join(' · ')} +${names.length - max} more`;
}
