import 'server-only';
import { unstable_cache } from 'next/cache';
import type { MediaType, WatchProvider, WatchProviders } from '@/lib/types';
import { serverEnv } from '@/lib/env';

/**
 * Watchmode — streaming availability + deep play-links, as an optional source.
 *
 * Server-only. Entirely gated behind `WATCHMODE_API_KEY`: with no key every
 * function returns null and the app falls back to TMDB, so this is dormant until
 * a key is set. Per-title results are cached hard (12h) because Watchmode's free
 * tier is only ~1,000 requests/month and availability is a per-title lookup.
 *
 * Docs: https://api.watchmode.com/docs/  — the title-details endpoint accepts a
 * TMDB id in the form `movie-<id>` / `tv-<id>`, so one call returns sources.
 */

const BASE = 'https://api.watchmode.com/v1';

interface WatchmodeSource {
  source_id: number;
  name: string;
  type: string; // sub | free | rent | buy | tve
  region: string; // e.g. "US"
  web_url?: string | null;
  ios_url?: string | null;
  android_url?: string | null;
  format?: string | null;
  price?: number | null;
}

interface WatchmodeDetails {
  sources?: WatchmodeSource[];
}

/** Watchmode source `type` → our WatchProvider `type`. */
function mapType(t: string): WatchProvider['type'] {
  switch (t) {
    case 'free':
      return 'free';
    case 'rent':
      return 'rent';
    case 'buy':
      return 'buy';
    case 'sub':
    case 'tve': // "TV everywhere" — cable/authenticated, treated like a subscription
    default:
      return 'flatrate';
  }
}

async function fetchWatchmode(mediaType: MediaType, tmdbId: number, region: string): Promise<WatchProviders | null> {
  const key = serverEnv.watchmodeKey();
  if (!key) return null;

  const titleId = `${mediaType === 'tv' ? 'tv' : 'movie'}-${tmdbId}`;
  const url = new URL(`${BASE}/title/${titleId}/details/`);
  url.searchParams.set('apiKey', key);
  url.searchParams.set('append_to_response', 'sources');

  let data: WatchmodeDetails;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    data = (await res.json()) as WatchmodeDetails;
  } catch {
    return null;
  }

  const sources = (data.sources ?? []).filter((s) => (s.region ?? '').toUpperCase() === region.toUpperCase());
  if (sources.length === 0) return { region, link: null, options: [], available: false };

  // Dedupe by service name + type, keeping the first deep link we see.
  const seen = new Map<string, WatchProvider>();
  for (const s of sources) {
    if (!s.name) continue;
    const type = mapType(s.type);
    const dedupeKey = `${s.name.toLowerCase()}|${type}`;
    if (seen.has(dedupeKey)) continue;
    seen.set(dedupeKey, {
      providerId: s.source_id,
      providerName: s.name,
      logoPath: null, // Watchmode's per-title sources carry no logo; UI shows the name
      type,
      link: s.web_url ?? null,
    });
  }
  const options = [...seen.values()];
  return { region, link: null, options, available: options.length > 0 };
}

/** Watchmode availability for a title, cached 12h. Null when no key/miss. */
export function getWatchmodeProviders(mediaType: MediaType, tmdbId: number, region = 'US'): Promise<WatchProviders | null> {
  if (!serverEnv.watchmodeKey()) return Promise.resolve(null);
  return unstable_cache(() => fetchWatchmode(mediaType, tmdbId, region), ['watchmode', mediaType, String(tmdbId), region], {
    revalidate: 60 * 60 * 12,
    tags: [`watchmode:${mediaType}:${tmdbId}`],
  })();
}

// ---------------------------------------------------------------------------
// Episode-level availability — which streaming service carries each SEASON of a
// show. Watchmode's episodes endpoint returns per-episode sources in one call;
// we roll that up to seasons and only credit a service with a season when it
// carries a majority of that season's episodes (so a single free pilot doesn't
// masquerade as full-season availability).
// ---------------------------------------------------------------------------

export interface SeasonAvailability {
  season: number;
  services: WatchProvider[]; // subscription / free services carrying the season
}

interface WatchmodeEpisode {
  season_number?: number | null;
  episode_number?: number | null;
  sources?: WatchmodeSource[];
}

async function fetchWatchmodeSeasons(tmdbId: number, region: string): Promise<SeasonAvailability[] | null> {
  const key = serverEnv.watchmodeKey();
  if (!key) return null;
  const url = new URL(`${BASE}/title/tv-${tmdbId}/episodes/`);
  url.searchParams.set('apiKey', key);

  let episodes: WatchmodeEpisode[];
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(9000) });
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    episodes = Array.isArray(data) ? (data as WatchmodeEpisode[]) : [];
  } catch {
    return null;
  }
  if (episodes.length === 0) return [];

  const total = new Map<number, number>(); // episodes counted per season
  const cover = new Map<string, { count: number; provider: WatchProvider }>(); // `${season}|${name}`

  for (const ep of episodes) {
    const sn = ep.season_number;
    if (sn == null || sn <= 0) continue; // skip specials (season 0)
    total.set(sn, (total.get(sn) ?? 0) + 1);
    const onThisEp = new Set<string>();
    for (const s of ep.sources ?? []) {
      if ((s.region ?? '').toUpperCase() !== region.toUpperCase()) continue;
      if (s.type !== 'sub' && s.type !== 'free' && s.type !== 'tve') continue;
      if (!s.name) continue;
      const k = `${sn}|${s.name.toLowerCase()}`;
      if (onThisEp.has(k)) continue; // count a service once per episode
      onThisEp.add(k);
      const entry = cover.get(k);
      if (entry) entry.count += 1;
      else
        cover.set(k, {
          count: 1,
          provider: { providerId: s.source_id, providerName: s.name, logoPath: null, type: mapType(s.type), link: s.web_url ?? null },
        });
    }
  }

  const out: SeasonAvailability[] = [];
  for (const [season, epCount] of [...total.entries()].sort((a, b) => a[0] - b[0])) {
    const need = Math.ceil(epCount / 2);
    const services = [...cover.entries()]
      .filter(([k, v]) => k.startsWith(`${season}|`) && v.count >= need)
      .map(([, v]) => v.provider);
    if (services.length > 0) out.push({ season, services });
  }
  return out;
}

/** Per-season streaming availability for a TV show, cached 12h. Null on no key/miss. */
export function getWatchmodeSeasons(tmdbId: number, region = 'US'): Promise<SeasonAvailability[] | null> {
  if (!serverEnv.watchmodeKey()) return Promise.resolve(null);
  return unstable_cache(() => fetchWatchmodeSeasons(tmdbId, region), ['watchmode-seasons', String(tmdbId), region], {
    revalidate: 60 * 60 * 12,
    tags: [`watchmode:tv:${tmdbId}`],
  })();
}

const norm = (name: string) =>
  name
    .toLowerCase()
    .replace(/\b(channel|network|\+|plus|app|tv)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();

/**
 * Merge Watchmode into the TMDB providers: keep TMDB's logos/coverage, attach
 * Watchmode's deep play-links to the matching services, and append any services
 * only Watchmode knows about. Either side may be null.
 */
export function mergeWatchmode(tmdb: WatchProviders | null, wm: WatchProviders | null): WatchProviders | null {
  if (!wm || wm.options.length === 0) return tmdb;
  if (!tmdb || tmdb.options.length === 0) return wm;

  const wmByName = new Map<string, WatchProvider>();
  for (const o of wm.options) wmByName.set(`${norm(o.providerName)}|${o.type}`, o);

  const used = new Set<string>();
  const merged: WatchProvider[] = tmdb.options.map((o) => {
    const k = `${norm(o.providerName)}|${o.type}`;
    const match = wmByName.get(k);
    if (match) {
      used.add(k);
      return { ...o, link: match.link ?? o.link ?? null };
    }
    return o;
  });

  // Services Watchmode has that TMDB didn't list — fresher availability.
  for (const [k, o] of wmByName) {
    if (!used.has(k)) merged.push(o);
  }

  return { region: tmdb.region, link: tmdb.link, options: merged, available: merged.length > 0 };
}
