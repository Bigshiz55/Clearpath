/**
 * WHAT'S ON TODAY — pure section selection over the STORED schedule.
 *
 * The XML says what is on; WatchVerd1ct says what is worth watching; the two
 * are never confused. Every section here is selected from canonical stored
 * airings (`Airing[]` as the ingested reader returns them) with plain
 * predicates on provider facts:
 *
 *   On Now            start ≤ now < start+runtime — runtime-provable only,
 *                     the same discipline as `onNowOf`
 *   Tonight           starts 19:00–23:59 US-Eastern of the current Eastern
 *                     broadcast day, still ahead of now
 *   Movies Today      provider-classified movies (`showType === 'Movie'`)
 *                     airing later today — never runtime/title guessing
 *   Sports Today      provider-classified sports airing later today
 *   New & Premieres   provider-flagged `isPremiere` only — never inferred
 *   Worth Watching    airings the EXISTING engine already scored for this
 *                     user (`match` attached by scoreGuideAirings — same
 *                     deterministic score as every card; no new formula).
 *                     Unmatched titles stay valid guide entries elsewhere
 *                     and simply do not appear here — no invented score.
 *
 * Pure: no I/O, no clock — `nowMs` comes in. Sections a window cannot
 * support come back empty and the component renders nothing for them.
 */
import type { Airing } from '@/lib/onTv';

const EASTERN = 'America/New_York';

/** Same Eastern day key as onTv's `usBroadcastDate`, duplicated here because
 *  this module renders in the CLIENT bundle and `onTv.ts` is server-only —
 *  a value import would drag the whole server module into the browser. The
 *  format is pinned by test against the same inputs. */
const easternDayKey = (ms: number): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: EASTERN, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));

export interface WhatsOnToday {
  onNow: Airing[];
  tonight: Airing[];
  moviesToday: Airing[];
  sportsToday: Airing[];
  newAndPremieres: Airing[];
  worthWatching: Airing[];
}

export const SECTION_CAP = 12;

const startOf = (a: Airing): number => Date.parse(a.airstamp);
const endOf = (a: Airing): number | null => {
  const s = startOf(a);
  if (!Number.isFinite(s) || a.runtime == null || a.runtime <= 0) return null;
  return s + a.runtime * 60_000;
};

const isOnNow = (a: Airing, nowMs: number): boolean => {
  const s = startOf(a);
  const e = endOf(a);
  return e != null && s <= nowMs && nowMs < e;
};

const easternHour = (ms: number): number =>
  Number(
    new Intl.DateTimeFormat('en-US', { timeZone: EASTERN, hour: '2-digit', hour12: false })
      .formatToParts(new Date(ms))
      .find((p) => p.type === 'hour')?.value ?? '0',
  ) % 24;

/** Same Eastern broadcast day as `nowMs`, DST-safe via Intl. */
const isToday = (a: Airing, nowMs: number): boolean => {
  const s = startOf(a);
  return Number.isFinite(s) && easternDayKey(s) === easternDayKey(nowMs);
};

const upcomingToday = (a: Airing, nowMs: number): boolean =>
  isToday(a, nowMs) && (startOf(a) >= nowMs || isOnNow(a, nowMs));

const byStart = (a: Airing, b: Airing) => startOf(a) - startOf(b);
const byMatchDesc = (a: Airing, b: Airing) => (b.match ?? -1) - (a.match ?? -1) || byStart(a, b);

/** One row per broadcast: the same title at the same instant on an East and a
 *  West feed (or in two lineups) reads as one entry. */
const dedupe = (list: Airing[]): Airing[] => {
  const seen = new Set<string>();
  return list.filter((a) => {
    const k = `${a.airstamp}|${a.showName.toLowerCase()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

export function selectWhatsOnToday(airings: readonly Airing[], nowMs: number): WhatsOnToday {
  const today = dedupe([...airings].filter((a) => isToday(a, nowMs)).sort(byStart));

  const onNow = today.filter((a) => isOnNow(a, nowMs));
  const tonight = today.filter((a) => {
    const s = startOf(a);
    return s >= nowMs && easternHour(s) >= 19;
  });
  const moviesToday = today.filter((a) => a.showType === 'Movie' && upcomingToday(a, nowMs));
  const sportsToday = today.filter((a) => a.showType === 'Sports' && upcomingToday(a, nowMs));
  const newAndPremieres = today.filter((a) => a.isPremiere === true && upcomingToday(a, nowMs));
  const worthWatching = today
    .filter((a) => a.match != null && upcomingToday(a, nowMs))
    .sort(byMatchDesc);

  return {
    onNow: onNow.slice(0, SECTION_CAP),
    tonight: tonight.slice(0, SECTION_CAP),
    moviesToday: moviesToday.slice(0, SECTION_CAP),
    sportsToday: sportsToday.slice(0, SECTION_CAP),
    newAndPremieres: newAndPremieres.slice(0, SECTION_CAP),
    worthWatching: worthWatching.slice(0, SECTION_CAP),
  };
}
