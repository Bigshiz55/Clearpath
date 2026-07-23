import 'server-only';
import { unstable_cache } from 'next/cache';
import { getCriticRatings } from '@/lib/omdb';
import { findTmdbByImdb } from '@/lib/tmdb/client';
import { getGracenoteAirings } from '@/lib/gracenote';
import { getStoredGridAirings } from '@/lib/tvGrid';
import type { MediaType } from '@/lib/types';

/**
 * "On TV Today" — a real broadcast schedule, powered by TVmaze (free, no key).
 * TMDB has episode air-dates but not a channel + airtime guide; TVmaze does.
 * We surface only what TVmaze actually reports (time, channel, show, rating) and
 * never invent a listing. Times are the network's local broadcast times.
 */

export interface Airing {
  id: number; // TVmaze episode id
  time: string; // network-local broadcast time, "20:00"
  minutes: number; // minutes past midnight, for sorting / prime-time filter
  airstamp: string; // ISO UTC start — used to build a calendar reminder
  runtime: number | null; // minutes
  network: string; // channel, e.g. "AMC"
  showName: string;
  showId: number;
  episodeName: string | null;
  season: number | null;
  number: number | null;
  showType: string; // "Scripted" | "News" | "Sports" | "Movie" | …
  genres: string[];
  rating: number | null; // TVmaze show rating, 0..10
  image: string | null;
  summary: string | null; // plain text
  imdb: string | null;
  // Critic scores (OMDb, matched by imdb id) — filled by enrichAiringsWithCritics.
  criticImdb?: number | null; // 0..10
  criticRt?: number | null; // 0..100
  criticMeta?: number | null; // 0..100
  // Resolved TMDB id (from the imdb id) — powers Save / Remove / DNA on the card.
  tmdbId?: number | null;
  mediaType?: MediaType | null;
}

interface TvmazeShow {
  id: number;
  name?: string;
  type?: string;
  genres?: string[];
  rating?: { average?: number | null };
  image?: { medium?: string; original?: string } | null;
  summary?: string | null;
  network?: { name?: string } | null;
  webChannel?: { name?: string } | null;
  externals?: { imdb?: string | null } | null;
}
interface TvmazeAiring {
  id: number;
  airtime?: string;
  airstamp?: string;
  runtime?: number | null;
  name?: string | null; // episode name
  season?: number | null;
  number?: number | null;
  show?: TvmazeShow | null; // broadcast schedule
  _embedded?: { show?: TvmazeShow | null }; // web (streaming) schedule
}

// Streaming platforms we surface on the "Streaming today" tab. The web feed is
// global and full of regional services; this keeps it to services a US/UK/AU
// viewer would recognize, but broadly — not just the big five.
const MAJOR_STREAMERS = [
  // Majors
  'netflix', 'prime video', 'amazon', 'disney+', 'hulu', 'max', 'hbo', 'apple tv',
  'peacock', 'paramount+',
  // Premium / cable
  'amc+', 'starz', 'showtime', 'mgm+', 'epix', 'sundance now',
  // Free / ad-supported
  'tubi', 'pluto', 'the roku channel', 'roku', 'freevee', 'crackle', 'plex', 'vudu', 'xumo',
  // Genre & specialty
  'britbox', 'acorn', 'mubi', 'shudder', 'hallmark', 'bet+', 'allblk', 'discovery+',
  'crunchyroll', 'funimation', 'hidive', 'espn+', 'fubo', 'philo',
  // Docs / arthouse / library
  'curiositystream', 'kanopy', 'hoopla', 'pbs', 'fandor', 'ovid',
  // Global
  'vix', 'youtube',
];
function isMajorStreamer(name: string): boolean {
  const n = name.toLowerCase();
  return MAJOR_STREAMERS.some((s) => n === s || n.includes(s));
}

function stripHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  const text = html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  return text.length > 0 ? text : null;
}

function minutesOf(airtime: string | undefined): number {
  if (!airtime) return 0;
  const m = airtime.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

function toAiring(a: TvmazeAiring, show: TvmazeShow, network: string, requireTime: boolean): Airing | null {
  if (!a.airstamp) return null;
  if (requireTime && !a.airtime) return null;
  return {
    id: a.id,
    time: a.airtime ?? '',
    minutes: minutesOf(a.airtime),
    airstamp: a.airstamp,
    runtime: a.runtime ?? null,
    network,
    showName: show.name ?? 'Untitled',
    showId: show.id,
    episodeName: a.name ?? null,
    season: a.season ?? null,
    number: a.number ?? null,
    showType: show.type ?? 'Show',
    genres: show.genres ?? [],
    rating: typeof show.rating?.average === 'number' ? show.rating.average : null,
    image: show.image?.medium ?? show.image?.original ?? null,
    summary: stripHtml(show.summary),
    imdb: show.externals?.imdb ?? null,
  };
}

async function fetchJson(url: string): Promise<TvmazeAiring[]> {
  const res = await fetch(url, { next: { revalidate: 3600 } }).catch(() => null);
  if (!res || !res.ok) return [];
  const data = (await res.json().catch(() => [])) as TvmazeAiring[];
  return Array.isArray(data) ? data : [];
}

/**
 * Attach IMDb / Rotten Tomatoes / Metacritic scores to airings, matched by the
 * show's imdb id via OMDb (which caches 6h). Bounded by `cap` and spent on the
 * best-rated first, so a full listings page never blows OMDb's limits.
 */
export async function enrichAiringsWithCritics(airings: Airing[], cap = 30): Promise<Airing[]> {
  const ranked = [...airings].sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
  const enrichIds = new Set(ranked.slice(0, cap).map((a) => a.id));
  return Promise.all(
    airings.map(async (a) => {
      if (!a.imdb || !enrichIds.has(a.id)) return a;
      const c = await getCriticRatings(a.imdb).catch(() => null);
      if (!c) return a;
      return { ...a, criticImdb: c.imdbRating ?? null, criticRt: c.rottenTomatoes ?? null, criticMeta: c.metascore ?? null };
    }),
  );
}

/**
 * Resolve TMDB ids (movie/tv) for the best-rated airings so their cards can
 * offer Save / Remove / a DNA score. Bounded by `cap` and spent on the
 * highest-rated first (they're what surface as "highlights"), matched by the
 * show's imdb id. Real matches only — no id, no buttons.
 */
export async function enrichAiringsWithTmdb(airings: Airing[], cap = 14): Promise<Airing[]> {
  const ranked = [...airings]
    .filter((a) => a.imdb)
    .sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1))
    .slice(0, cap);
  const resolved = new Map<number, { id: number; mediaType: MediaType }>();
  await Promise.all(
    ranked.map(async (a) => {
      const r = await findTmdbByImdb(a.imdb!).catch(() => null);
      if (r) resolved.set(a.id, r);
    }),
  );
  return airings.map((a) => {
    const r = resolved.get(a.id);
    return r ? { ...a, tmdbId: r.id, mediaType: r.mediaType } : a;
  });
}

export interface NextAiring {
  network: string; // channel or platform, e.g. "AMC"
  time: string; // network-local "HH:MM" (may be '')
  airstamp: string; // ISO UTC start
}

/**
 * The next scheduled airing of a show, looked up by IMDb id straight from
 * TVmaze — real channel + airtime, never invented. Returns null when TVmaze has
 * no listing or the show has no upcoming episode (finished / streaming-only).
 */
export async function getNextAiring(imdbId: string | null): Promise<NextAiring | null> {
  if (!imdbId) return null;
  try {
    const sres = await fetch(`https://api.tvmaze.com/lookup/shows?imdb=${encodeURIComponent(imdbId)}`, {
      next: { revalidate: 3600 },
    }).catch(() => null);
    if (!sres || !sres.ok) return null;
    const show = (await sres.json().catch(() => null)) as {
      network?: { name?: string } | null;
      webChannel?: { name?: string } | null;
      _links?: { nextepisode?: { href?: string } } | null;
    } | null;
    const network = show?.network?.name ?? show?.webChannel?.name ?? null;
    const href = show?._links?.nextepisode?.href;
    if (!href || !network) return null;
    const eres = await fetch(href, { next: { revalidate: 3600 } }).catch(() => null);
    if (!eres || !eres.ok) return null;
    const ep = (await eres.json().catch(() => null)) as { airstamp?: string; airtime?: string } | null;
    if (!ep?.airstamp) return null;
    return { network, time: ep.airtime ?? '', airstamp: ep.airstamp };
  } catch {
    return null;
  }
}

// The major American TV networks carried on Xfinity / Verizon Fios — broadcast,
// major cable entertainment, news, sports, and premium. We track these and skip
// the long tail of tiny/regional channels, so the live guide stays useful.
const MAJOR_US_NETWORKS = [
  // Broadcast
  'abc', 'cbs', 'nbc', 'fox', 'the cw', 'pbs', 'telemundo', 'univision', 'ion', 'mynetworktv',
  // Cable entertainment
  'amc', 'usa network', 'tnt', 'tbs', 'fx', 'fxx', 'bravo', 'e!', 'comedy central',
  'paramount network', 'syfy', 'freeform', 'hallmark', 'hgtv', 'food network', 'discovery',
  'tlc', 'history', 'a&e', 'lifetime', 'national geographic', 'nat geo', 'animal planet',
  'bbc america', 'ifc', 'sundancetv', 'tcm', 'tv land', 'we tv', 'own', 'mtv', 'vh1', 'bet',
  'cartoon network', 'nickelodeon', 'disney channel', 'adult swim', 'trutv', 'oxygen',
  'investigation discovery', 'gsn', 'reelz', 'cooking channel', 'motortrend',
  // News
  'cnn', 'msnbc', 'fox news', 'cnbc', 'hln', 'newsmax',
  // Sports
  'espn', 'fs1', 'fs2', 'fox sports', 'nbc sports', 'nfl network', 'mlb network', 'nba tv',
  'golf channel', 'tennis channel',
  // Premium
  'hbo', 'cinemax', 'showtime', 'starz', 'mgm+', 'epix',
];
function isMajorUsNetwork(name: string): boolean {
  const n = name.toLowerCase().trim();
  return MAJOR_US_NETWORKS.some((net) => n === net || n.startsWith(net + ' ') || n.startsWith(net));
}

/** Broadcast schedule, curated to the major American networks (Xfinity/Verizon). */
async function fetchBroadcast(country: string, date: string): Promise<Airing[]> {
  const data = await fetchJson(`https://api.tvmaze.com/schedule?country=${encodeURIComponent(country)}&date=${date}`);
  const out: Airing[] = [];
  for (const a of data) {
    const show = a.show;
    const network = show?.network?.name ?? show?.webChannel?.name ?? null;
    if (!show || !network) continue;
    if (country === 'US' && !isMajorUsNetwork(network)) continue; // track only major US networks
    const item = toAiring(a, show, network, true); // broadcasts have a real airtime
    if (item) out.push(item);
  }
  return out.sort((x, y) => x.minutes - y.minutes);
}

/** Streaming premieres for the day (global web feed), curated to major services. */
async function fetchStreaming(date: string): Promise<Airing[]> {
  const data = await fetchJson(`https://api.tvmaze.com/schedule/web?date=${date}`);
  const out: Airing[] = [];
  const seen = new Set<number>();
  for (const a of data) {
    const show = a._embedded?.show ?? a.show ?? null;
    const platform = show?.webChannel?.name ?? show?.network?.name ?? null;
    if (!show || !platform || !isMajorStreamer(platform)) continue;
    if (seen.has(show.id)) continue; // one row per show (season drops list every episode)
    seen.add(show.id);
    const item = toAiring(a, show, platform, false); // streaming often has no set time
    if (item) out.push(item);
  }
  // Best-known first (rating desc), then by name for stability.
  return out.sort((x, y) => (y.rating ?? -1) - (x.rating ?? -1) || x.showName.localeCompare(y.showName));
}

/** Cached daily broadcast schedule for a country (ISO date, e.g. 2026-07-16). */
export function getOnTvToday(country: string, date: string): Promise<Airing[]> {
  return unstable_cache(() => fetchBroadcast(country, date), ['on-tv', country, date], {
    revalidate: 3600,
    tags: [`on-tv:${country}:${date}`],
  })();
}

const NOISE_TYPES = new Set(['News', 'Talk Show', 'Variety']);
const DAY_MS = 86_400_000;

function isoDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** We never surface a TV airing further out than this — "what's on" means the
 *  next two days, never a listing weeks away. Enforced here so every caller
 *  (home strip, TV Detective, Easy/Vintage) is bounded to the same window. This
 *  is the hard maximum; callers may request a shorter window (12h / 24h). */
export const UPCOMING_TV_HORIZON_MS = 48 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/**
 * "Coming up on TV" — the best-reviewed real airings between now and the chosen
 * horizon (default 48h, capped at 48h). Skips news/talk noise, favors well-rated
 * shows, and returns them in time order so it reads like a short, friendly
 * what's-on list. The 48-hour cap is hard: anything further out (a show on
 * hiatus, a fall premiere) is never shown. Real TVmaze data only.
 *
 * `horizonMs` lets the TV Detective narrow the window (12h / 24h / 48h). We
 * still fetch the full 48h span of dates so the daily cache keys stay identical
 * across horizons — only the final [now, now+horizon] filter changes.
 */
export async function getUpcomingTv(
  country: string,
  nowMs: number,
  horizonMs: number = UPCOMING_TV_HORIZON_MS,
  genre: string | null = null,
  network: string | null = null,
  movieOnly = false,
): Promise<Airing[]> {
  const clampedHorizon = Math.max(HOUR_MS, Math.min(horizonMs, UPCOMING_TV_HORIZON_MS));
  const horizon = nowMs + clampedHorizon;
  // Fetch every UTC date the full 48h window can touch (up to 3, depending on
  // the time of day) — cache keys stay stable regardless of the chosen horizon —
  // then filter strictly to [now, now+horizon].
  const spanDays = Math.ceil(UPCOMING_TV_HORIZON_MS / DAY_MS) + 1;
  const dates = Array.from({ length: spanDays }, (_, i) => isoDate(nowMs + i * DAY_MS));
  const perDay = await Promise.all(dates.map((d) => getOnTvToday(country, d)));

  const wantGenre = genre ? genre.toLowerCase() : null;
  const wantNet = network ? network.toLowerCase() : null;
  const upcoming = perDay
    .flat()
    .filter((a) => {
      const ms = Date.parse(a.airstamp);
      if (NOISE_TYPES.has(a.showType) || ms < nowMs || ms > horizon) return false;
      // Honor a requested genre ("comedies coming on…") against the show's real
      // TVmaze genre tags. No match on that genre → not shown.
      if (wantGenre && !a.genres.some((g) => g.toLowerCase() === wantGenre)) return false;
      // Requested network ("on Lifetime") — match the channel name.
      if (wantNet && !a.network.toLowerCase().includes(wantNet)) return false;
      // Requested movies only ("Lifetime movies") — TVmaze tags movies as 'Movie'.
      if (movieOnly && a.showType !== 'Movie') return false;
      return true;
    });

  // TVmaze is broadcast-only, so a cable network ("on Lifetime") or a movies-only
  // ask comes back thin or empty. For those, pull the real listing from Gracenote's
  // full US grid (cable + movie typing) and prefer a time-ordered union — this is
  // what makes "Lifetime movies tonight" actually return Lifetime movies. US only.
  const wantGracenote = country === 'US' && !!(network || movieOnly);
  if (wantGracenote) {
    // DB-first: read the hourly-refreshed grid from our own table (fast, no
    // upstream call). Only if it's empty (before the first refresh, or the table
    // isn't there yet) do we fetch Gracenote live.
    let grid = await getStoredGridAirings(nowMs, clampedHorizon, { network, movieOnly }).catch(() => []);
    if (grid.length === 0) grid = await getGracenoteAirings(nowMs, clampedHorizon, { network, movieOnly }).catch(() => []);
    const merged = [...upcoming, ...grid];
    const byKey = new Set<string>();
    return merged
      .filter((a) => {
        if (wantGenre && !a.genres.some((g) => g.toLowerCase() === wantGenre)) return false;
        const k = `${a.showName.toLowerCase()}|${a.airstamp}`;
        return byKey.has(k) ? false : (byKey.add(k), true);
      })
      .sort((a, b) => Date.parse(a.airstamp) - Date.parse(b.airstamp))
      .slice(0, 60);
  }

  // Rank by rating (unrated last), keep a healthy set, then show in time order.
  const ranked = [...upcoming].sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1)).slice(0, 30);
  const seen = new Set<number>();
  return ranked
    .filter((a) => (seen.has(a.showId) ? false : (seen.add(a.showId), true)))
    .sort((a, b) => Date.parse(a.airstamp) - Date.parse(b.airstamp));
}

/** Cached daily streaming premieres (major services), keyed by date. */
export function getStreamingToday(date: string): Promise<Airing[]> {
  return unstable_cache(() => fetchStreaming(date), ['streaming-today', date], {
    revalidate: 3600,
    tags: [`streaming-today:${date}`],
  })();
}
