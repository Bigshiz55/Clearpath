import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MediaType } from '@/lib/types';
import { getWatchProviders } from '@/lib/tmdb/client';
import { getMyServices } from '@/lib/profile';
import { STREAMING_SERVICES, LIVE_TV_PROVIDERS } from '@/lib/services';

/**
 * "Are your subscriptions worth it?" — the ROI hook. Uses only data we already
 * have: the services the user picked + the titles they marked watched. For each
 * paid service, we count how many recently-watched titles are available on it,
 * and flag the ones they're paying for but not using. Prices are rough US
 * estimates (labeled as such); usage is approximate (a title can be on several
 * services) — we're honest about both in the UI.
 */

const DAY = 86_400_000;
const WINDOW_DAYS = 120; // ~4 months of "recent" usage
const MAX_TITLES = 80;

/** Approximate US monthly price (est.), by TMDB provider/service id. Free = 0. */
const EST_PRICE: Record<number, number> = {
  8: 15.49, // Netflix
  9: 8.99, // Prime Video
  337: 9.99, // Disney+
  1899: 9.99, // Max
  15: 9.99, // Hulu
  531: 7.99, // Paramount+
  386: 7.99, // Peacock
  350: 9.99, // Apple TV+
  43: 10.99, // Starz
  37: 10.99, // Showtime
  526: 8.99, // AMC+
  257: 79.99, // fuboTV
  73: 0, 300: 0, 207: 0, // free tiers
  900001: 82.99, 900002: 82.99, 900003: 45.99, 900004: 86.99, // live TV bundles
};

export interface ServiceValue {
  id: number;
  name: string;
  emoji: string;
  estPrice: number | null; // monthly, null = unknown
  watched: number; // recent watched titles available here
  perWatch: number | null; // est cost per watch over the window
  verdict: 'worth' | 'underused' | 'cancel' | 'free' | 'unknown';
}

export interface SubscriptionValue {
  needsServices: boolean;
  services: ServiceValue[];
  monthlyTotal: number; // sum of known est prices
  potentialSavings: number; // sum of cancel-candidate prices
  cancelCount: number;
  windowDays: number;
}

const EMPTY: SubscriptionValue = { needsServices: true, services: [], monthlyTotal: 0, potentialSavings: 0, cancelCount: 0, windowDays: WINDOW_DAYS };

// providerId → the service the user could have selected it as.
const PROVIDER_TO_SERVICE = new Map<number, number>();
for (const s of [...STREAMING_SERVICES, ...LIVE_TV_PROVIDERS]) {
  for (const pid of s.ids) if (!PROVIDER_TO_SERVICE.has(pid)) PROVIDER_TO_SERVICE.set(pid, s.id);
}
const SERVICE_META = new Map([...STREAMING_SERVICES, ...LIVE_TV_PROVIDERS].map((s) => [s.id, s]));

function verdictFor(est: number | null, watched: number): ServiceValue['verdict'] {
  if (est == null) return 'unknown';
  if (est === 0) return 'free';
  if (watched === 0) return 'cancel';
  if (watched <= 2) return 'underused';
  return 'worth';
}

export async function getSubscriptionValue(
  supabase: SupabaseClient,
  userId: string,
  region = 'US',
): Promise<SubscriptionValue> {
  if (!userId) return EMPTY;
  const mine = await getMyServices(supabase, userId);
  if (mine.length === 0) return EMPTY;

  const since = new Date(Date.now() - WINDOW_DAYS * DAY).toISOString();
  const { data } = await supabase
    .from('watchlist_items')
    .select('tmdb_id, media_type, watched_at')
    .eq('user_id', userId)
    .eq('status', 'watched')
    .gte('watched_at', since)
    .order('watched_at', { ascending: false })
    .limit(MAX_TITLES);
  const watchedRows = (data ?? []) as { tmdb_id: number; media_type: MediaType; watched_at: string }[];

  // Count, per service the user subscribes to, how many recent watches are on it.
  const counts = new Map<number, number>();
  const mineSet = new Set(mine);
  await Promise.all(
    watchedRows.map(async (r) => {
      const providers = await getWatchProviders(r.media_type, r.tmdb_id, region).catch(() => null);
      if (!providers) return;
      const services = new Set<number>();
      for (const o of providers.options) {
        if (o.type !== 'flatrate' && o.type !== 'free' && o.type !== 'ads') continue;
        const sid = PROVIDER_TO_SERVICE.get(o.providerId);
        if (sid != null && mineSet.has(sid)) services.add(sid);
      }
      for (const sid of services) counts.set(sid, (counts.get(sid) ?? 0) + 1);
    }),
  );

  const months = WINDOW_DAYS / 30;
  const services: ServiceValue[] = mine.map((id) => {
    const meta = SERVICE_META.get(id);
    const estPrice = id in EST_PRICE ? EST_PRICE[id]! : null;
    const watched = counts.get(id) ?? 0;
    const perWatch = estPrice && estPrice > 0 && watched > 0 ? (estPrice * months) / watched : null;
    return {
      id,
      name: meta?.name ?? `Service ${id}`,
      emoji: meta?.emoji ?? '📺',
      estPrice,
      watched,
      perWatch,
      verdict: verdictFor(estPrice, watched),
    };
  });

  // Worst first: cancel → underused → worth → free/unknown.
  const rank: Record<ServiceValue['verdict'], number> = { cancel: 0, underused: 1, worth: 2, free: 3, unknown: 4 };
  services.sort((a, b) => rank[a.verdict] - rank[b.verdict] || (b.estPrice ?? 0) - (a.estPrice ?? 0));

  const monthlyTotal = services.reduce((s, x) => s + (x.estPrice ?? 0), 0);
  const cancels = services.filter((x) => x.verdict === 'cancel');
  return {
    needsServices: false,
    services,
    monthlyTotal,
    potentialSavings: cancels.reduce((s, x) => s + (x.estPrice ?? 0), 0),
    cancelCount: cancels.length,
    windowDays: WINDOW_DAYS,
  };
}
