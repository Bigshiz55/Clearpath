// Client-safe catalog of common streaming services and helpers for matching a
// user's subscriptions against TMDB watch-provider data. Pure — no I/O, no
// secrets — so it's safe to import from client components.
import type { WatchProvider } from '@/lib/types';

export interface StreamingService {
  /** Canonical TMDB provider id we store in profiles.my_services. */
  id: number;
  name: string;
  /** All TMDB provider-id variants that count as "this service" when matching. */
  ids: number[];
}

/**
 * THERE IS NO `emoji` FIELD, DELIBERATELY.
 *
 * Every service here used to carry one — 🅽 for Netflix, ⚽ for fuboTV, 📺 for
 * Pluto TV — and four surfaces printed it in front of the brand name. A glyph
 * chosen to evoke a company is a homemade approximation of its mark, and the
 * site-wide rule is that a brand gets its official asset or its official NAME,
 * never a stand-in. We hold no verified logo for this curated list (it is a
 * subscription picker, not provider rows), so the honest presentation is the
 * name — see src/lib/providers/brand.ts.
 */

/**
 * A curated list of the mainstream subscription services. `ids` collapses TMDB's
 * multiple entries for one brand (e.g. Prime Video vs. Amazon Prime Video with
 * ads) so a subscription matches however TMDB labels the availability.
 */
export const STREAMING_SERVICES: StreamingService[] = [
  { id: 8, name: 'Netflix', ids: [8, 1796] },
  { id: 9, name: 'Prime Video', ids: [9, 119, 2100] },
  { id: 337, name: 'Disney+', ids: [337, 2739] },
  { id: 1899, name: 'Max', ids: [1899, 384, 1825] },
  { id: 15, name: 'Hulu', ids: [15] },
  { id: 531, name: 'Paramount+', ids: [531, 582, 1770, 633] },
  { id: 386, name: 'Peacock', ids: [386, 387] },
  { id: 350, name: 'Apple TV+', ids: [350, 2552] },
  { id: 43, name: 'Starz', ids: [43, 634] },
  { id: 37, name: 'Showtime', ids: [37, 349] },
  { id: 526, name: 'AMC+', ids: [526, 528] },
  { id: 257, name: 'Fubo', ids: [257] },
  { id: 73, name: 'Tubi (free)', ids: [73] },
  { id: 300, name: 'Pluto TV (free)', ids: [300] },
  { id: 207, name: 'The Roku Channel (free)', ids: [207] },
];

/**
 * Live-TV / cable & fiber providers TMDB doesn't model as on-demand catalogs.
 * They're selectable so a viewer can record what they actually have (a cable or
 * fiber box, a live-TV bundle) — but they don't filter on-demand availability,
 * since "having Xfinity" isn't a streaming catalog TMDB can match a title to.
 * Ids are in a private 900000+ range so they never collide with a real TMDB id.
 */
export const LIVE_TV_PROVIDERS: StreamingService[] = [
  { id: 900001, name: 'YouTube TV', ids: [900001] },
  { id: 900002, name: 'Hulu + Live TV', ids: [900002] },
  { id: 900003, name: 'Sling TV', ids: [900003] },
  { id: 900004, name: 'DIRECTV / DIRECTV Stream', ids: [900004] },
  { id: 900005, name: 'DISH Network', ids: [900005] },
  { id: 900006, name: 'Verizon Fios TV', ids: [900006] },
  { id: 900007, name: 'Xfinity (Comcast)', ids: [900007] },
  { id: 900008, name: 'Spectrum (Charter)', ids: [900008] },
  { id: 900009, name: 'Cox Contour', ids: [900009] },
  { id: 900010, name: 'Optimum / Altice', ids: [900010] },
  { id: 900011, name: 'AT&T U-verse', ids: [900011] },
  { id: 900012, name: 'Antenna / Over-the-air', ids: [900012] },
];

/** Subscription/free types — the ones a plan "includes" (not rent/buy). */
const INCLUDED_TYPES: ReadonlySet<WatchProvider['type']> = new Set(['flatrate', 'free', 'ads']);

/** Expand stored service ids to the full set of TMDB provider-id variants. */
function expandSelected(selected: number[]): Set<number> {
  const out = new Set<number>();
  for (const sid of selected) {
    const svc = STREAMING_SERVICES.find((s) => s.id === sid || s.ids.includes(sid));
    if (svc) svc.ids.forEach((i) => out.add(i));
    else out.add(sid); // unknown id — match it directly
  }
  return out;
}

/** Is this provider covered by one of the user's selected services? */
export function isProviderMine(providerId: number, selected: number[]): boolean {
  if (selected.length === 0) return false;
  return expandSelected(selected).has(providerId);
}

/** Distinct names of the user's services that *include* this title (no rental). */
export function includedServiceNames(options: WatchProvider[], selected: number[]): string[] {
  if (selected.length === 0) return [];
  const mine = expandSelected(selected);
  const names = new Set<string>();
  for (const o of options) {
    if (INCLUDED_TYPES.has(o.type) && mine.has(o.providerId)) names.add(o.providerName);
  }
  return Array.from(names);
}

/** Distinct names of any subscription/free streaming option, regardless of plan. */
export function streamingNames(options: WatchProvider[]): string[] {
  const names = new Set<string>();
  for (const o of options) if (INCLUDED_TYPES.has(o.type)) names.add(o.providerName);
  return Array.from(names);
}

/** The single best included streaming provider to badge on a card — name PLUS
 *  its verified TMDB logo path, so the UI can render the real brand mark instead
 *  of a name string. Options are display-priority ordered upstream. Null when no
 *  included (subscription/free/ads) provider exists. */
export function topStreamingProvider(
  options: WatchProvider[],
): { providerId: number; name: string; logoPath: string | null } | null {
  for (const o of options) {
    if (INCLUDED_TYPES.has(o.type)) {
      return { providerId: o.providerId, name: o.providerName, logoPath: o.logoPath ?? null };
    }
  }
  return null;
}

export type TonightAvailability =
  | { kind: 'included'; services: string[] } // free with a plan you have
  | { kind: 'elsewhere'; services: string[] } // streams, but not on your plans
  | { kind: 'rent_buy' } // only rent/buy
  | { kind: 'none' }; // nothing found

/** Summarize whether the user can watch this tonight on a plan they already have. */
export function tonightAvailability(
  options: WatchProvider[] | null | undefined,
  selected: number[],
): TonightAvailability {
  const opts = options ?? [];
  const included = includedServiceNames(opts, selected);
  if (included.length > 0) return { kind: 'included', services: included };
  const streaming = streamingNames(opts);
  if (streaming.length > 0) return { kind: 'elsewhere', services: streaming };
  if (opts.some((o) => o.type === 'rent' || o.type === 'buy')) return { kind: 'rent_buy' };
  return { kind: 'none' };
}
