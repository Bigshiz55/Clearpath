/**
 * THE CHANNEL GUIDE — the cable-box view of the grid we already ingest.
 *
 * The app has held the full national lineup all along: an hourly job pulls
 * Gracenote's grid (every cable channel, movies typed, Hallmark and Lifetime
 * and TCM included) into `tv_grid`. But the only way to see any of it was to
 * ask a filtered question — "Lifetime movies tonight" — one channel at a time.
 * A person with 300 channels does not browse by interrogation; they open the
 * guide and scan.
 *
 * This module turns a flat list of airings into that guide: one row per
 * channel, what is ON RIGHT NOW first, then what is up next. Channels showing
 * something now lead (a guide is about the present), channels with only
 * upcoming listings follow, both alphabetical so a channel is findable.
 *
 * Pure. No I/O, no clock — `nowMs` comes in.
 */
import type { Airing } from '@/lib/onTv';

export interface ChannelRow {
  network: string;
  /** Airing covering `nowMs`, when the grid gives us enough to know. */
  onNow: Airing | null;
  /** How far through the current airing we are, 0..1. Null without a runtime. */
  progress: number | null;
  /** The next airings after `now`, soonest first. */
  upNext: Airing[];
}

/** Up-next entries per channel — enough to plan the evening, not a data dump. */
export const UP_NEXT = 2;

function startOf(a: Airing): number {
  return Date.parse(a.airstamp);
}

function endOf(a: Airing): number | null {
  const start = startOf(a);
  if (!Number.isFinite(start) || a.runtime == null || a.runtime <= 0) return null;
  return start + a.runtime * 60_000;
}

/** The airing covering `nowMs` — only claimed when the runtime proves it. */
export function onNowOf(airings: readonly Airing[], nowMs: number): Airing | null {
  let best: Airing | null = null;
  for (const a of airings) {
    const start = startOf(a);
    const end = endOf(a);
    if (end == null) continue; // no runtime → cannot honestly claim "on now"
    if (start <= nowMs && nowMs < end) {
      // Two claims to the same moment (data overlap): the later start wins —
      // it is what the channel actually cut to.
      if (!best || start > startOf(best)) best = a;
    }
  }
  return best;
}

/**
 * Build the guide. Channels with something on now lead, then channels with
 * only upcoming listings; alphabetical inside each group. A channel whose
 * every airing has already ended is dropped — a guide row with nothing on it
 * and nothing coming is noise.
 */
export function buildChannelGuide(airings: readonly Airing[], nowMs: number): ChannelRow[] {
  const byChannel = new Map<string, Airing[]>();
  for (const a of airings) {
    const key = a.network.trim();
    if (!key) continue;
    const list = byChannel.get(key);
    if (list) list.push(a);
    else byChannel.set(key, [a]);
  }

  const rows: ChannelRow[] = [];
  for (const [network, list] of byChannel) {
    // EAST AND WEST FEEDS ARE ONE CHANNEL. A&E and A&E-West both map to
    // "A&E", so the same episode arrived twice at the same minute and the
    // guide printed "2:30 PM Neighborhood Wars" twice in a row. Same start +
    // same title is one broadcast, whatever satellite it rode in on.
    const seen = new Set<string>();
    const deduped = list.filter((a) => {
      const k = `${a.airstamp}|${a.showName.toLowerCase()}`;
      return seen.has(k) ? false : (seen.add(k), true);
    });
    const sorted = deduped.sort((a, b) => startOf(a) - startOf(b));
    const onNow = onNowOf(sorted, nowMs);
    // WHAT IS ON NOW IS NEVER ALSO "UP NEXT". Reference identity (`a !==
    // onNow`) missed the feed's near-duplicates — the same broadcast arriving
    // again with a different episode id and an airstamp seconds apart — so the
    // channel header said "Chicago Fire, on now" and the first schedule row
    // said "5:00 AM Chicago Fire" right under it. Same show, same start minute
    // = the same broadcast, whatever id it rode in on.
    const repeatsOnNow = (a: Airing) =>
      onNow != null &&
      a.showName.toLowerCase() === onNow.showName.toLowerCase() &&
      Math.abs(startOf(a) - startOf(onNow)) < 60_000;
    const upNext = sorted.filter((a) => startOf(a) > nowMs && a !== onNow && !repeatsOnNow(a)).slice(0, UP_NEXT);
    if (!onNow && upNext.length === 0) continue;
    let progress: number | null = null;
    if (onNow) {
      const end = endOf(onNow)!;
      const start = startOf(onNow);
      progress = Math.min(1, Math.max(0, (nowMs - start) / (end - start)));
    }
    rows.push({ network, onNow, progress, upNext });
  }

  return rows.sort((a, b) => {
    const liveA = a.onNow ? 0 : 1;
    const liveB = b.onNow ? 0 : 1;
    if (liveA !== liveB) return liveA - liveB;
    return a.network.localeCompare(b.network);
  });
}

/** One honest sentence for the guide's header: what we can actually see. */
export function guideSummary(rows: readonly ChannelRow[]): { channels: number; onNow: number; movies: number } {
  let onNow = 0;
  let movies = 0;
  for (const r of rows) {
    if (r.onNow) {
      onNow++;
      if (r.onNow.showType === 'Movie') movies++;
    }
    for (const n of r.upNext) if (n.showType === 'Movie') movies++;
  }
  return { channels: rows.length, onNow, movies };
}

/**
 * Filter a guide to the channels matching a search — by channel name OR by
 * what is on it ("hallmark" finds the channel; "die hard" finds whoever is
 * showing it). Empty query returns everything.
 */
export function filterGuide(rows: readonly ChannelRow[], query: string): ChannelRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...rows];
  return rows.filter((r) => {
    if (r.network.toLowerCase().includes(q)) return true;
    if (r.onNow?.showName.toLowerCase().includes(q)) return true;
    return r.upNext.some((a) => a.showName.toLowerCase().includes(q));
  });
}

/** The guide's one-tap type toggle: everything, movies, or shows. */
export type GuideMediaFilter = 'all' | 'movie' | 'tv';

/**
 * Keep the channels with a movie (or a show) on now or up next. Uses the
 * grid's own `is_movie` typing — a channel row survives when ANY of its
 * visible listings is the wanted type, so "Movies" keeps a channel whose
 * series ends at 9 to start a film. Generic so ranked rows keep their extras.
 */
export function filterGuideByMedia<T extends ChannelRow>(rows: readonly T[], media: GuideMediaFilter): T[] {
  if (media === 'all') return [...rows];
  const wantMovie = media === 'movie';
  return rows.filter((r) => {
    const listings = r.onNow ? [r.onNow, ...r.upNext] : r.upNext;
    return listings.some((a) => (a.showType === 'Movie') === wantMovie);
  });
}

/**
 * ONE-TAP CHANNEL GROUPS. The grid rows carry no per-programme genre, so a
 * "genre" filter here would be invention — what IS defensible is a channel's
 * programming identity (the same reasoning as the DNA channel affinity):
 * ESPN is sports, CNN is news, TCM shows movies. Matched against the display
 * name; a channel matching no group simply only appears under "All" — never
 * guessed into one.
 */
export interface GuideCategory {
  key: string;
  label: string;
  re: RegExp;
}

export const GUIDE_CATEGORIES: GuideCategory[] = [
  {
    key: 'movies',
    label: 'Movie channels',
    re: /hbo|cinemax|showtime|starz|encore|epix|mgm|^tcm\b|turner classic|^amc\b|hdnet movie|sony movie|movieplex|flix|hallmark movie|lifetime movie|lmn|cine/i,
  },
  { key: 'feelgood', label: 'Hallmark & Lifetime', re: /hallmark|lifetime|lmn|uptv|gac/i },
  {
    key: 'crime',
    label: 'Crime & mystery',
    re: /investigation discovery|^id\b|oxygen|a&e|court tv|usa network|^ion\b|^tnt\b/i,
  },
  {
    key: 'sports',
    label: 'Sports',
    re: /espn|fox sports|fs[12]\b|nfl|nba|mlb|nhl|golf|tennis|cbs sports|accn|sec network|big ten|btn\b|olympic/i,
  },
  {
    key: 'kids',
    label: 'Kids & family',
    re: /disney|nick|cartoon network|boomerang|pbs kids|universal kids|discovery family/i,
  },
  {
    key: 'news',
    label: 'News',
    re: /cnn|fox news|msnbc|cnbc|newsnation|newsmax|bbc (world )?news|c-?span|weather/i,
  },
];

/** Keep the channels in one named group. Null or unknown key = everything. */
export function filterGuideByCategory<T extends ChannelRow>(rows: readonly T[], key: string | null): T[] {
  const cat = key ? GUIDE_CATEGORIES.find((c) => c.key === key) : null;
  if (!cat) return [...rows];
  return rows.filter((r) => cat.re.test(r.network.trim()));
}

/**
 * PAID PROGRAMMING IS NOT PROGRAMMING. Broadcast affiliates fill overnight
 * slots with infomercials — "Inogen Portable Oxygen - No More Tanks!" is a
 * sales pitch, not a show, and treating it like one (a title row, a score
 * lookup, a reminder bell) lends it the guide's credibility. Classified by the
 * signals the feed actually carries: the giveaway phrases and the product-pitch
 * title shapes. Classified rows stay in the guide (the slot IS what that
 * channel is airing — hiding it would fake the schedule) but render muted,
 * scoreless and un-remindable.
 */
const PAID_RE =
  /\bpaid programming\b|\binfomercial\b|\bprogramming paid\b|(?:^|\s)(?:my ?pillow|copperfit|copper fit|inogen|lifelock|omega ?xl|nutrisystem|proactiv|hurrycane|medicare (?:help|hotline|benefits))\b/i;
/** Product-pitch title shapes: "X - No More Y!", "Amazing Z™!", phone-number CTAs. */
const PITCH_RE = /(?:no more \w+!|call now|act now|risk[- ]free|free trial|as seen on tv|™|®)/i;

export function isPaidProgramming(a: Pick<Airing, 'showName' | 'showType'>): boolean {
  const name = a.showName ?? '';
  if (PAID_RE.test(name)) return true;
  // The pitch shapes only count on the show types infomercials ship under —
  // a scripted drama with "Call Now" in an episode title is not a sales block.
  const t = (a.showType ?? '').toLowerCase();
  const pitchable = t === '' || t === 'variety' || t === 'reality' || t === 'news' || t === 'talk show';
  return pitchable && PITCH_RE.test(name);
}

export interface ScheduleGap {
  /** ms timestamps of the unexplained hole between two listed rows. */
  fromMs: number;
  toMs: number;
}

/**
 * A GUIDE THAT JUMPS THREE HOURS IS LYING BY OMISSION. When one row ends at
 * 6:00 and the next listed row starts at 9:00, silence between them reads as
 * "nothing until 9" — but it's "we have no data until 9", a different claim.
 * Detectable only when the earlier row's runtime is known; a hole shorter than
 * `MIN_GAP_MIN` is scheduling slop, not missing data.
 */
export const MIN_GAP_MIN = 25;

export function scheduleGaps(rows: readonly Airing[]): ScheduleGap[] {
  const gaps: ScheduleGap[] = [];
  const sorted = [...rows].sort((a, b) => startOf(a) - startOf(b));
  for (let i = 0; i < sorted.length - 1; i++) {
    const cur = sorted[i]!;
    const next = sorted[i + 1]!;
    const end = endOf(cur);
    if (end == null) continue; // no runtime → cannot claim a gap honestly
    const nextStart = startOf(next);
    if (nextStart - end >= MIN_GAP_MIN * 60_000) gaps.push({ fromMs: end, toMs: nextStart });
  }
  return gaps;
}
