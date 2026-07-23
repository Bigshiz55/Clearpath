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
  thumbnail?: string; // TMS image asset id, e.g. "p27366651_v_v13_aa"
  program?: { title?: string; shortDesc?: string; releaseYear?: string } | null;
}

// Gracenote/TMS poster art CDN. The event's `thumbnail` is an asset id; the CDN
// resizes on the fly with ?w=. This is what fills the placards.
const IMG_BASE = 'https://demo.tmsimg.com/assets';
function imageUrl(thumb: string | undefined): string | null {
  if (!thumb || !/^[\w-]+$/.test(thumb)) return null;
  return `${IMG_BASE}/${thumb}.jpg?w=360`;
}
interface GnChannel {
  callSign?: string;
  channelNo?: string;
  events?: GnEvent[];
}

/**
 * Requested-network key → the Gracenote call-sign pattern and a display name.
 * Keys match `detectNetwork`'s keys so any channel a user names routes here.
 * Ordered specific-before-general so the reverse lookup (labeling an arbitrary
 * channel) picks the right name — e.g. LMN before Lifetime, ESPN2 before ESPN,
 * FXX before FX. Call signs come from the real DirecTV national lineup; the
 * trailing P/HD are feed/quality suffixes. Broadcast (ABC/CBS/NBC/FOX/CW) is
 * left to TVmaze, which labels local affiliates and carries ratings.
 */
const GN_NETS: { key: string; re: RegExp; name: string }[] = [
  // Movie & entertainment cable
  { key: 'lmn', re: /^LMN/i, name: 'LMN' },
  { key: 'lifetime', re: /^(LIFE|LMN)/i, name: 'Lifetime' }, // "Lifetime movies" sweeps LMN too
  { key: 'hallmark', re: /^(HALLP|HALL|HMYS|HFM)/i, name: 'Hallmark' },
  { key: 'amc', re: /^AMC/i, name: 'AMC' },
  { key: 'usa', re: /^USA/i, name: 'USA Network' },
  { key: 'tnt', re: /^TNT/i, name: 'TNT' },
  { key: 'tbs', re: /^TBS/i, name: 'TBS' },
  { key: 'fxx', re: /^FXX/i, name: 'FXX' },
  { key: 'fxm', re: /^FXM/i, name: 'FXM' },
  { key: 'fx', re: /^FXP/i, name: 'FX' },
  { key: 'bravo', re: /^BRAVO/i, name: 'Bravo' },
  { key: 'syfy', re: /^SYFY/i, name: 'Syfy' },
  { key: 'freeform', re: /^(FREFRM|FRFM|FREE)/i, name: 'Freeform' },
  { key: 'paramount network', re: /^PARP/i, name: 'Paramount Network' },
  { key: 'comedy central', re: /^(COMEDY|CCHDP)/i, name: 'Comedy Central' },
  { key: 'tv land', re: /^TVLAND/i, name: 'TV Land' },
  { key: 'pop', re: /^POPP/i, name: 'Pop' },
  { key: 'we tv', re: /^WEP/i, name: 'WE tv' },
  { key: 'own', re: /^OWN/i, name: 'OWN' },
  { key: 'oxygen', re: /^OXYG/i, name: 'Oxygen' },
  { key: 'bet', re: /^BETP/i, name: 'BET' },
  { key: 'mtv', re: /^MTVP/i, name: 'MTV' },
  { key: 'vh1', re: /^VH1/i, name: 'VH1' },
  { key: 'cmt', re: /^CMT/i, name: 'CMT' },
  { key: 'ifc', re: /^IFC/i, name: 'IFC' },
  { key: 'sundance', re: /^SUNDAN/i, name: 'SundanceTV' },
  { key: 'tcm', re: /^TCM/i, name: 'TCM' },
  { key: 'ovation', re: /^OVATION/i, name: 'Ovation' },
  // Lifestyle / factual
  { key: 'hgtv', re: /^HGTV/i, name: 'HGTV' },
  { key: 'cooking channel', re: /^COOK/i, name: 'Cooking Channel' },
  { key: 'food network', re: /^FOOD/i, name: 'Food Network' },
  { key: 'discovery', re: /^DSC/i, name: 'Discovery' },
  { key: 'tlc', re: /^TLC/i, name: 'TLC' },
  { key: 'history', re: /^(HIST|HSTRY)/i, name: 'History' },
  { key: 'a&e', re: /^AETV/i, name: 'A&E' },
  { key: 'geographic', re: /^(NGC|NGWILD)/i, name: 'National Geographic' },
  { key: 'animal planet', re: /^APL/i, name: 'Animal Planet' },
  { key: 'bbc america', re: /^BBCA/i, name: 'BBC America' },
  { key: 'investigation discovery', re: /^ID/i, name: 'Investigation Discovery' },
  { key: 'travel', re: /^TRAV/i, name: 'Travel Channel' },
  { key: 'science', re: /^SCI/i, name: 'Science Channel' },
  // Kids
  { key: 'cartoon network', re: /^TOON/i, name: 'Cartoon Network' },
  { key: 'nickelodeon', re: /^NIKP/i, name: 'Nickelodeon' },
  { key: 'disney', re: /^(DISN|DXD)/i, name: 'Disney Channel' },
  // Games
  { key: 'gsn', re: /^GSN/i, name: 'GSN' },
  { key: 'reelz', re: /^REELZ/i, name: 'Reelz' },
  // News
  { key: 'cnn', re: /^CNN/i, name: 'CNN' },
  { key: 'fox news', re: /^FNC/i, name: 'Fox News' },
  { key: 'fox business', re: /^FBN/i, name: 'Fox Business' },
  { key: 'msnbc', re: /^MSNOW/i, name: 'MSNBC' },
  { key: 'cnbc', re: /^CNBC/i, name: 'CNBC' },
  { key: 'hln', re: /^HLN/i, name: 'HLN' },
  { key: 'newsnation', re: /^(NEWSNTN|NWSNT)/i, name: 'NewsNation' },
  // Sports
  { key: 'espn2', re: /^ESPN2/i, name: 'ESPN2' },
  { key: 'espnu', re: /^ESPNU/i, name: 'ESPNU' },
  { key: 'espn', re: /^ESPN(HD)?$/i, name: 'ESPN' },
  { key: 'fs1', re: /^FS1/i, name: 'FS1' },
  { key: 'fs2', re: /^FS2/i, name: 'FS2' },
  { key: 'fox sports', re: /^FS[12]/i, name: 'Fox Sports' },
  { key: 'golf channel', re: /^GOLF/i, name: 'Golf Channel' },
  { key: 'tennis channel', re: /^TENNIS/i, name: 'Tennis Channel' },
  { key: 'nfl network', re: /^NFLNET/i, name: 'NFL Network' },
  { key: 'mlb network', re: /^MLBN/i, name: 'MLB Network' },
  { key: 'cbs sports', re: /^CBSSN/i, name: 'CBS Sports' },
  // Premium
  { key: 'hbo', re: /^HBO/i, name: 'HBO' },
  { key: 'cinemax', re: /^(MAXP|MPLEX)/i, name: 'Cinemax' },
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
export function etTime(iso: string): { time: string; minutes: number } {
  try {
    const parts = etFmt.formatToParts(new Date(iso));
    const hh = parts.find((p) => p.type === 'hour')?.value ?? '00';
    const mm = parts.find((p) => p.type === 'minute')?.value ?? '00';
    return { time: `${hh}:${mm}`, minutes: Number(hh) * 60 + Number(mm) };
  } catch {
    return { time: '', minutes: 0 };
  }
}

/** A friendly network name for any call sign (used when storing the full grid). */
export function networkNameFor(callSign: string): string {
  return displayNetwork(callSign);
}
/** The canonical filter key for a call sign, or null when it's an unmapped channel. */
export function networkKeyFor(callSign: string): string | null {
  return GN_NETS.find((n) => n.re.test(callSign))?.key ?? null;
}

/** Stable positive int id from call sign + start (for React keys and reminders). */
export function hashId(s: string): number {
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
          image: imageUrl(e.thumbnail),
          summary: e.program?.shortDesc ?? null,
          imdb: null,
        });
      }
    }
  }
  return out.sort((a, b) => Date.parse(a.airstamp) - Date.parse(b.airstamp));
}

export interface GridRow {
  callSign: string;
  network: string;
  networkKey: string | null;
  showName: string;
  airstamp: string; // ISO UTC
  runtime: number | null;
  isMovie: boolean;
  image: string | null;
  summary: string | null;
}

/**
 * The ENTIRE grid (all channels, no filter) over the window, normalized for
 * storage — used by the hourly refresh job. Fetches fresh (bypasses the
 * per-block request cache) since the whole point is to pull new data. Empty on
 * total failure; a failed block just contributes nothing.
 */
export async function fetchGridForStore(nowMs: number, horizonMs: number): Promise<GridRow[]> {
  const startSec = Math.floor(nowMs / HOUR_MS) * (HOUR_MS / 1000);
  const spanHours = Math.ceil(horizonMs / HOUR_MS);
  const blockTimes: number[] = [];
  for (let off = 0; off < spanHours; off += BLOCK_HOURS) blockTimes.push(startSec + off * 3600);
  const blocks = await Promise.all(blockTimes.map((t) => fetchBlockRaw(t).catch(() => [] as GnChannel[])));
  const out: GridRow[] = [];
  const seen = new Set<string>();
  for (const channels of blocks) {
    for (const c of channels) {
      const cs = c.callSign ?? '';
      if (!cs) continue;
      const key0 = GN_NETS.find((n) => n.re.test(cs));
      for (const e of c.events ?? []) {
        if (!e.startTime) continue;
        const k = `${cs}|${e.startTime}`;
        if (seen.has(k)) continue;
        seen.add(k);
        const dur = Number.parseInt(e.duration ?? '', 10);
        out.push({
          callSign: cs,
          network: key0 ? key0.name : displayNetwork(cs),
          networkKey: key0?.key ?? null,
          showName: e.program?.title ?? 'Untitled',
          airstamp: e.startTime,
          runtime: Number.isFinite(dur) ? dur : null,
          isMovie: (e.filter ?? []).includes('filter-movie'),
          image: imageUrl(e.thumbnail),
          summary: e.program?.shortDesc ?? null,
        });
      }
    }
  }
  return out;
}
