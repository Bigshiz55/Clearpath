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
    const upNext = sorted.filter((a) => startOf(a) > nowMs && a !== onNow).slice(0, UP_NEXT);
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
