import 'server-only';
import { unstable_cache } from 'next/cache';
import type { Airing } from '@/lib/onTv';

/**
 * Gracenote's free public listings grid — the JSON behind tvlistings.gracenote.com.
 * Unlike TVmaze (broadcast only), this carries the full US cable + premium lineup
 * WITH movie typing, so "Lifetime movies tonight" finally has real data. We pull
 * the DirecTV national lineup (a consistent national cable feed, address-agnostic)
 * once per hour-block and cache it, so one fetch serves every user — pennies at any
 * scale. Real listings only; we never invent one, and titles we can't enrich just
 * show channel + time + a movie badge.
 *
 * Honest note: this is Gracenote's data. It's the community-standard free source
 * (iptv-org, zap2epg use the same grid) and fine at this stage; a commercial
 * product at scale would license Gracenote/Xperi directly. Swapping that in later
 * only changes this one module.
 */

const GRID_BASE = 'https://tvlistings.gracenote.com/api/grid';
// DirecTV national lineup → national cable/premium feeds, independent of ZIP.
const LINEUP_ID = 'USA-DITV-DEFAULT';
const HEADEND_ID = 'DITV';
const POSTAL = '10001';
const BLOCK_HOURS = 6; // one grid call spans ~6h; page across the window
const HOUR_MS = 60 * 60 * 1000;

interface GnEvent {
  startTime?: string; // ISO UTC
  duration?: string; // minutes (string)
  filter?: string[]; // e.g. ["filter-movie"], ["filter-news"]
  program?: { title?: string } | null;
}
interface GnChannel {
  callSign?: string;
  channelNo?: string;
  events?: GnEvent[];
}

/** Requested-network key → the Gracenote call-sign prefix and a display name. */
const GN_NETS: { key: string; re: RegExp; name: string }[] = [
  { key: 'lmn', re: /^LMN/i, name: 'LMN' },
  // "Lifetime movies" should sweep LMN too — it *is* the Lifetime Movie Network.
  { key: 'lifetime', re: /^(LIFE|LMN)/i, name: 'Lifetime' },
  { key: 'hallmark', re: /^(HALL|HMM|HMYS)/i, name: 'Hallmark' },
  { key: 'amc', re: /^AMC/i, name: 'AMC' },
  { key: 'usa', re: /^USA/i, name: 'USA Network' },
  { key: 'tnt', re: /^TNT/i, name: 'TNT' },
  { key: 'tbs', re: /^TBS/i, name: 'TBS' },
  { key: 'fxx', re: /^FXX/i, name: 'FXX' },
  { key: 'fx', re: /^FX(?!X)/i, name: 'FX' },
  { key: 'bravo', re: /^BRAVO/i, name: 'Bravo' },
  { key: 'syfy', re: /^SYFY/i, name: 'Syfy' },
  { key: 'freeform', re: /^FREE/i, name: 'Freeform' },
  { key: 'hgtv', re: /^HGTV/i, name: 'HGTV' },
  { key: 'food network', re: /^FOOD/i, name: 'Food Network' },
  { key: 'discovery', re: /^DISC/i, name: 'Discovery' },
  { key: 'tlc', re: /^TLC/i, name: 'TLC' },
  { key: 'history', re: /^HIST/i, name: 'History' },
  { key: 'a&e', re: /^AE/i, name: 'A&E' },
  { key: 'tcm', re: /^TCM/i, name: 'TCM' },
  { key: 'paramount network', re: /^PAR/i, name: 'Paramount Network' },
  { key: 'comedy central', re: /^COM/i, name: 'Comedy Central' },
  { key: 'mtv', re: /^MTV/i, name: 'MTV' },
  { key: 'bet', re: /^BET/i, name: 'BET' },
  { key: 'hbo', re: /^HBO/i, name: 'HBO' },
  { key: 'showtime', re: /^SHO/i, name: 'Showtime' },
  { key: 'starz', re: /^(STARZ|STZ)/i, name: 'Starz' },
];

/** A friendly network name for a Gracenote call sign, else a cleaned call sign. */
function displayNetwork(callSign: string): string {
  const hit = GN_NETS.find((n) => n.re.test(callSign));
  if (hit) return hit.name;
  return callSign.replace(/HD$/i, '').replace(/P$/i, '') || callSign;
}

const etFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false });
function etTime(iso: string): { time: string; minutes: number } {
  try {
    const parts = etFmt.formatToParts(new Date(iso));
    const hh = parts.find((p) => p.type === 'hour')?.value ?? '00';
    const mm = parts.find((p) => p.type === 'minute')?.value ?? '00';
    return { time: `${hh}:${mm}`, minutes: Number(hh) * 60 + Number(mm) };
  } catch {
    return { time: '', minutes: 0 };
  }
}

/** Stable positive int id from call sign + start (for React keys and reminders). */
function hashId(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) || 1;
}

async function fetchOnce(url: string): Promise<GnChannel[] | null> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36',
      // The grid API rejects requests without a matching Referer.
      Referer: 'https://tvlistings.gracenote.com/grid-affiliates.html?aid=orbebb',
      Accept: 'application/json, text/plain, */*',
    },
    cache: 'no-store',
  }).catch(() => null);
  if (!res || !res.ok) return null; // signal failure (rate-limit/error) — don't cache it
  const data = (await res.json().catch(() => null)) as { channels?: GnChannel[] } | null;
  return Array.isArray(data?.channels) ? data!.channels! : [];
}

/** Fetch one block, with a single spaced retry to ride out a transient 403.
 *  THROWS on hard failure so the cache layer never stores an empty result. */
async function fetchBlockRaw(timeSec: number): Promise<GnChannel[]> {
  const url =
    `${GRID_BASE}?aid=orbebb&TMSID=&AffiliateId=lat&lineupId=${LINEUP_ID}&timespan=${BLOCK_HOURS}` +
    `&headendId=${HEADEND_ID}&country=USA&device=X&postalCode=${POSTAL}&time=${timeSec}&pref=-&userId=-`;
  let channels = await fetchOnce(url);
  if (channels === null) {
    await new Promise((r) => setTimeout(r, 600));
    channels = await fetchOnce(url);
  }
  if (channels === null) throw new Error('gracenote grid unavailable');
  return channels;
}

/** One hour-aligned grid block, cached so it's shared across every user/request.
 *  A failed fetch throws (never caches empty); the caller catches per-block. */
function getBlock(timeSec: number): Promise<GnChannel[]> {
  return unstable_cache(() => fetchBlockRaw(timeSec), ['gracenote-grid', LINEUP_ID, String(timeSec)], {
    revalidate: 3600,
    tags: [`gracenote:${timeSec}`],
  })();
}

/**
 * Real US cable/broadcast airings from Gracenote between now and the horizon,
 * filtered to a requested network and/or movies-only. Empty on any failure.
 */
export async function getGracenoteAirings(
  nowMs: number,
  horizonMs: number,
  opts: { network?: string | null; movieOnly?: boolean } = {},
): Promise<Airing[]> {
  const wantNet = opts.network ? opts.network.toLowerCase() : null;
  const net = wantNet ? GN_NETS.find((n) => n.key === wantNet) : null;
  // A specific network was named but it isn't one we can locate in the grid —
  // return nothing so the caller can fall back honestly (rather than guess).
  if (wantNet && !net) return [];

  const horizon = nowMs + horizonMs;
  const startSec = Math.floor(nowMs / HOUR_MS) * (HOUR_MS / 1000);
  const spanHours = Math.ceil(horizonMs / HOUR_MS);
  const blockTimes: number[] = [];
  for (let off = 0; off < spanHours; off += BLOCK_HOURS) blockTimes.push(startSec + off * 3600);

  // Per-block catch: a failed/rate-limited block yields nothing (and isn't
  // cached), but the others still return — one bad block never wipes the set.
  const blocks = await Promise.all(blockTimes.map((t) => getBlock(t).catch(() => [] as GnChannel[])));
  const out: Airing[] = [];
  const seen = new Set<string>();
  for (const channels of blocks) {
    for (const c of channels) {
      const cs = c.callSign ?? '';
      if (net && !net.re.test(cs)) continue; // wrong network
      for (const e of c.events ?? []) {
        if (!e.startTime) continue;
        const start = Date.parse(e.startTime);
        if (!Number.isFinite(start)) continue;
        const dur = Number.parseInt(e.duration ?? '', 10);
        const end = start + (Number.isFinite(dur) ? dur : 0) * 60000;
        if (end <= nowMs || start > horizon) continue; // outside the window
        const isMovie = (e.filter ?? []).includes('filter-movie');
        if (opts.movieOnly && !isMovie) continue;
        const key = `${cs}|${e.startTime}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const { time, minutes } = etTime(e.startTime);
        out.push({
          id: hashId(key),
          time,
          minutes,
          airstamp: e.startTime,
          runtime: Number.isFinite(dur) ? dur : null,
          network: net ? net.name : displayNetwork(cs),
          showName: e.program?.title ?? 'Untitled',
          showId: hashId(cs),
          episodeName: null,
          season: null,
          number: null,
          showType: isMovie ? 'Movie' : 'Series',
          genres: [],
          rating: null,
          image: null,
          summary: null,
          imdb: null,
        });
      }
    }
  }
  return out.sort((a, b) => Date.parse(a.airstamp) - Date.parse(b.airstamp));
}
