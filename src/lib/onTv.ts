import 'server-only';
import { unstable_cache } from 'next/cache';

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

// Major streaming platforms we surface on the "Streaming today" tab. The web
// feed is global and lists many regional services; this keeps it recognizable.
const MAJOR_STREAMERS = [
  'netflix', 'prime video', 'disney+', 'hulu', 'max', 'hbo', 'apple tv+', 'apple tv',
  'peacock', 'paramount+', 'amc+', 'starz', 'showtime', 'youtube', 'tubi', 'crunchyroll',
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

/** Broadcast (over-the-air / cable) schedule for a country. */
async function fetchBroadcast(country: string, date: string): Promise<Airing[]> {
  const data = await fetchJson(`https://api.tvmaze.com/schedule?country=${encodeURIComponent(country)}&date=${date}`);
  const out: Airing[] = [];
  for (const a of data) {
    const show = a.show;
    const network = show?.network?.name ?? show?.webChannel?.name ?? null;
    if (!show || !network) continue;
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

/** Cached daily streaming premieres (major services), keyed by date. */
export function getStreamingToday(date: string): Promise<Airing[]> {
  return unstable_cache(() => fetchStreaming(date), ['streaming-today', date], {
    revalidate: 3600,
    tags: [`streaming-today:${date}`],
  })();
}
