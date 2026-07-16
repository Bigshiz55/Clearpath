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

interface TvmazeAiring {
  id: number;
  airtime?: string;
  airstamp?: string;
  runtime?: number | null;
  name?: string | null; // episode name
  season?: number | null;
  number?: number | null;
  show?: {
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
  } | null;
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

async function fetchSchedule(country: string, date: string): Promise<Airing[]> {
  const url = `https://api.tvmaze.com/schedule?country=${encodeURIComponent(country)}&date=${date}`;
  const res = await fetch(url, { next: { revalidate: 3600 } }).catch(() => null);
  if (!res || !res.ok) return [];
  const data = (await res.json().catch(() => [])) as TvmazeAiring[];
  if (!Array.isArray(data)) return [];

  const out: Airing[] = [];
  for (const a of data) {
    const show = a.show;
    if (!show) continue;
    const network = show.network?.name ?? show.webChannel?.name ?? null;
    if (!network || !a.airtime || !a.airstamp) continue; // only real, scheduled broadcasts
    out.push({
      id: a.id,
      time: a.airtime,
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
    });
  }
  // Sort by broadcast time.
  return out.sort((x, y) => x.minutes - y.minutes);
}

/** Cached daily broadcast schedule for a country (ISO date, e.g. 2026-07-16). */
export function getOnTvToday(country: string, date: string): Promise<Airing[]> {
  return unstable_cache(() => fetchSchedule(country, date), ['on-tv', country, date], {
    revalidate: 3600,
    tags: [`on-tv:${country}:${date}`],
  })();
}
