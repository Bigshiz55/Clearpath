/**
 * TODAY'S CASE BRIEFING — pure selection over the STORED schedule.
 *
 * The briefing is an editorial front page over the same canonical rows every
 * guide surface reads: schedule truth comes from the imported XMLTV tables
 * (via the ingested reader), personalization comes ONLY from the `match` /
 * `matchWhy` fields the existing `scoreGuideAirings` already attached — no
 * second scorer, no new formula, no invented number anywhere in this module.
 * An airing without a `match` is a legitimate unscored entry; it can appear
 * in every schedule section and simply never in a personalized one.
 *
 * THE DAY CONVENTION (decided, documented): the briefing covers the USER'S
 * OWN LOCAL CALENDAR DAY — the literal "today" on the reader's wall clock,
 * never a hardcoded Eastern broadcast day. `localDayWindow(nowMs, tz)` turns
 * a clock instant plus an IANA zone into that day's exact UTC bounds
 * (DST-safe via Intl, never ±24h arithmetic). The zone arrives from the
 * browser (`?tz=`, written by the page's one-shot corrector); until it does,
 * `DEFAULT_BRIEFING_TZ` (America/New_York — the US broadcast convention the
 * rest of the guide already uses) covers the first server render and non-JS
 * clients. A consequence of the literal-day rule: programmes that started
 * before local midnight or start after the next one belong to yesterday's /
 * tomorrow's briefing, even when they cross into today.
 *
 * Sections (rendered only when real rows support them):
 *   LEAD CASE          the single best engine-scored programme still ahead
 *                      today (personalized readers only)
 *   TOP CASES TODAY    the next engine-scored programmes, best first
 *   TONIGHT'S DOCKET   19:00–22:59 local starts, schedule order
 *   MOVIES ON THE DOCKET  provider-classified movies, scored first
 *   LIVE & SPORTS      provider-classified sports, schedule order
 *   NEW & PREMIERES    provider-flagged `isPremiere` only — never inferred
 *   WORTH WATCHING     scored ≥ the engine's neutral line, beyond the top
 *   LATE-NIGHT FILE    23:00 local to midnight (the literal day ends there)
 *   WILDCARD           one scored title whose genres share nothing with the
 *                      lead/top cases — a real discovery, or nothing
 *
 * Pure: no I/O, no clock — `nowMs` and `tz` come in. Client-safe by design
 * (the component renders these sections in the browser), so nothing here may
 * import a server-only module.
 */
import type { Airing } from '@/lib/onTv';
import { NEUTRAL } from '@/lib/tv/guideScoring';
import { channelIdentity } from '@/lib/tv/channelNames';

/** First-render / non-JS fallback zone only — see the day convention above. */
export const DEFAULT_BRIEFING_TZ = 'America/New_York';

export const LEAD_POOL_CAP = 6; // top cases beyond the lead
export const SECTION_CAP = 12; // schedule sections
export const WORTH_CAP = 8;
export const LATE_CAP = 8;

/** An IANA zone the runtime actually knows, or null — never a guess. */
export function safeTimeZone(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(raw)) return null;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: raw });
    return raw;
  } catch {
    return null;
  }
}

/** "YYYY-MM-DD" of `ms` on the wall clock of `tz` (en-CA emits ISO order). */
export function dayKeyIn(ms: number, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(ms),
  );
}

/** The instant's wall-clock reading in `tz`, re-encoded as if it were UTC —
 *  the standard Intl trick for recovering a zone's offset without a tz db. */
function wallClockAsUtc(ms: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(ms));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
}

/** UTC instant of local midnight beginning `y-m-d` in `tz`. Two-pass offset
 *  correction handles DST edges; a zone where that midnight does not exist
 *  (spring-forward at 00:00) lands on the first instant that does. */
function localMidnightUtc(y: number, m: number, d: number, tz: string): number {
  const guess = Date.UTC(y, m - 1, d);
  const off1 = wallClockAsUtc(guess, tz) - guess;
  let candidate = guess - off1;
  const off2 = wallClockAsUtc(candidate, tz) - candidate;
  if (off2 !== off1) candidate = guess - off2;
  return candidate;
}

export interface LocalDayWindow {
  dayKey: string;
  startMs: number;
  endMs: number;
}

/** The exact UTC bounds of the local calendar day containing `nowMs` in `tz`.
 *  A DST-transition day is honestly 23 or 25 hours long. */
export function localDayWindow(nowMs: number, tz: string): LocalDayWindow {
  const dayKey = dayKeyIn(nowMs, tz);
  const [y, m, d] = dayKey.split('-').map(Number) as [number, number, number];
  return { dayKey, startMs: localMidnightUtc(y, m, d, tz), endMs: localMidnightUtc(y, m, d + 1, tz) };
}

export function localHour(ms: number, tz: string): number {
  return (
    Number(
      new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hour12: false })
        .formatToParts(new Date(ms))
        .find((p) => p.type === 'hour')?.value ?? '0',
    ) % 24
  );
}

/** "8:00 PM" on the wall clock of `tz`. */
export function formatClock(ms: number, tz: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(new Date(ms));
}

/** "8:00 PM–10:30 PM" when the runtime is provable, else just the start. */
export function airingTimeRange(a: Airing, tz: string): string {
  const s = Date.parse(a.airstamp);
  if (!Number.isFinite(s)) return '';
  const start = formatClock(s, tz);
  if (a.runtime == null || a.runtime <= 0) return start;
  return `${start}–${formatClock(s + a.runtime * 60_000, tz)}`;
}

/** The title-detail schedule line: "AIRING TODAY · TCM · 8:00 PM–10:30 PM". */
export function airingTodayLine(a: Airing, tz: string): string {
  const range = airingTimeRange(a, tz);
  return ['AIRING TODAY', channelIdentity(a.network).name, range].filter(Boolean).join(' · ');
}

/** Render only artwork we may actually hotlink over TLS — an `http://` mark
 *  (or anything else) is withheld, never rewritten or guessed. */
export function httpsUrl(url: string | null | undefined): string | null {
  return url != null && url.startsWith('https://') ? url : null;
}

export interface BriefingChannel {
  /** Raw stored station name — the filter key (`?channel=`). */
  name: string;
  /** Viewer-facing identity (channelNames mapping — never a guess). */
  displayName: string;
  monogram: string;
  logoUrl: string | null;
  /** Stored airings still ahead (or on now) on this channel today. */
  count: number;
  /** Carries at least one engine-scored programme ≥ neutral — the "Your
   *  channels" shelf. Only meaningful for personalized readers. */
  yours: boolean;
}

export interface CaseBriefingSections {
  dayKey: string;
  /** Channel filter echoed back (null = the whole lineup). */
  channel: string | null;
  /** Rows in the (possibly channel-filtered) pool — 0 drives the honest
   *  channel-empty state. */
  poolCount: number;
  leadCase: Airing | null;
  topCases: Airing[];
  tonightsDocket: Airing[];
  moviesOnTheDocket: Airing[];
  liveAndSports: Airing[];
  newAndPremieres: Airing[];
  worthWatching: Airing[];
  lateNightFile: Airing[];
  wildcard: Airing | null;
  /** The full lineup's rail — never narrowed by the channel filter. */
  channels: BriefingChannel[];
}

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
const byStart = (a: Airing, b: Airing) => startOf(a) - startOf(b);
const byMatchDesc = (a: Airing, b: Airing) => (b.match ?? -1) - (a.match ?? -1) || byStart(a, b);

/**
 * THE CANONICAL IDENTITY OF A TITLE — what "the same show" means here.
 *
 * The resolved catalog identity when the engine has one, because that is the
 * thing the score belongs to and the thing every other surface keys on. Only
 * when a listing was never resolved does this fall back to the show name, and
 * then conservatively: normalized case and whitespace plus the media type, so
 * "The Golden Girls" and "the golden girls" collapse while two genuinely
 * different programmes never do.
 */
export function titleIdentity(a: Airing): string {
  if (a.tmdbId != null && a.mediaType != null) return `${a.mediaType}:${a.tmdbId}`;
  const name = a.showName.trim().toLowerCase().replace(/\s+/g, ' ');
  return `name:${a.showType === 'Movie' ? 'movie' : 'tv'}:${name}`;
}

/**
 * WHICH AIRING REPRESENTS A TITLE in the editorial sections.
 *
 * On now beats anything — it is what the reader can act on this second. Failing
 * that, the earliest still-upcoming showing, because a briefing is about what
 * is ahead and the 8pm airing is more useful than the 11pm one. Negative means
 * `a` wins, matching the comparator convention.
 */
function preferAiring(a: Airing, b: Airing, nowMs: number): number {
  const an = isOnNow(a, nowMs);
  const bn = isOnNow(b, nowMs);
  if (an !== bn) return an ? -1 : 1;
  return startOf(a) - startOf(b);
}

/**
 * ONE PERSONALIZED EDITORIAL SLOT PER TITLE.
 *
 * THE PRODUCTION DEFECT: three episodes of The Golden Girls took the Lead Case
 * and two Top Cases at once. `dedupe` below keys on `airstamp|showName`, which
 * collapses an East/West simulcast pair but does nothing about the SAME series
 * at three different times; the used-set keyed on `a.id`, the TVmaze EPISODE
 * id, which differs per episode. Since `applyScores` spreads one title's score
 * across every airing of it, all three carried the identical number and sorted
 * adjacently — one series occupying the whole front page.
 *
 * Schedule sections deliberately do NOT use this: there, each broadcast is its
 * own fact and a reader wants to see both showings.
 */
export function dedupeByTitle(list: readonly Airing[], nowMs: number): Airing[] {
  const best = new Map<string, Airing>();
  for (const a of list) {
    const key = titleIdentity(a);
    const cur = best.get(key);
    if (cur == null || preferAiring(a, cur, nowMs) < 0) best.set(key, a);
  }
  return [...best.values()];
}

/** One row per broadcast: the same title at the same instant on two feeds
 *  (an East/West pair) reads as one entry. */
const dedupe = (list: Airing[]): Airing[] => {
  const seen = new Set<string>();
  return list.filter((a) => {
    const k = `${a.airstamp}|${a.showName.toLowerCase()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

export function selectCaseBriefing(
  airings: readonly Airing[],
  nowMs: number,
  tz: string,
  opts: { channel?: string | null; personalized?: boolean } = {},
): CaseBriefingSections {
  const channel = opts.channel ?? null;
  const personalized = opts.personalized ?? false;
  const dayKey = dayKeyIn(nowMs, tz);

  const isToday = (a: Airing): boolean => {
    const s = startOf(a);
    return Number.isFinite(s) && dayKeyIn(s, tz) === dayKey;
  };
  /** Still worth briefing about: starts later today, or is on right now. */
  const ahead = (a: Airing): boolean => isToday(a) && (startOf(a) >= nowMs || isOnNow(a, nowMs));

  const todayAhead = [...airings].filter(ahead).sort(byStart);

  // THE RAIL comes from the un-filtered, un-deduped set: every channel that
  // still carries something today earns a chip, and a West feed is its own
  // channel even when its 8 PM movie deduped out of the sections.
  const byChannel = new Map<string, { logo: string | null; count: number; yours: boolean }>();
  for (const a of todayAhead) {
    const cur = byChannel.get(a.network) ?? { logo: null, count: 0, yours: false };
    cur.count += 1;
    cur.logo = cur.logo ?? httpsUrl(a.networkLogoUrl);
    // PER-TITLE EVIDENCE, not an account-level fact: a channel is "yours"
    // only when something on it actually scored personally for this reader.
    if (personalized && a.matchPersonalized === true && (a.match ?? 0) >= NEUTRAL) cur.yours = true;
    byChannel.set(a.network, cur);
  }
  const channels: BriefingChannel[] = [...byChannel.entries()]
    .map(([name, c]) => {
      const id = channelIdentity(name);
      return { name, displayName: id.name, monogram: id.monogram, logoUrl: c.logo, count: c.count, yours: c.yours };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  const pool = dedupe(channel != null ? todayAhead.filter((a) => a.network === channel) : todayAhead);

  // PERSONALIZED SECTIONS — engine-scored rows only, and only for a reader
  // the engine has actually learned (the same DNA floor every personal claim
  // uses; the page passes it in). No scored rows → no lead, no top cases —
  // never a stand-in.
  const scored = personalized
    ? dedupeByTitle(pool.filter((a) => a.match != null), nowMs).sort(byMatchDesc)
    : [];
  const leadCase = scored[0] ?? null;
  const topCases = scored.slice(1, 1 + LEAD_POOL_CAP);
  // BY TITLE, NOT BY EPISODE ID. `a.id` is the TVmaze episode id, so a used-set
  // keyed on it let a second episode of the same series straight back in.
  const usedIds = new Set(
    [leadCase, ...topCases].filter((a): a is Airing => a != null).map((a) => titleIdentity(a)),
  );

  // WILDCARD — one scored discovery whose genres share NOTHING with the lead
  // and top cases. Requires real genre evidence on both sides; otherwise null.
  const usualGenres = new Set(
    [leadCase, ...topCases].filter((a): a is Airing => a != null).flatMap((a) => a.genres.map((g) => g.toLowerCase())),
  );
  const wildcard =
    usualGenres.size > 0
      ? (scored.find(
          (a) =>
            !usedIds.has(titleIdentity(a)) &&
            (a.match ?? 0) >= NEUTRAL &&
            a.genres.length > 0 &&
            a.genres.every((g) => !usualGenres.has(g.toLowerCase())),
        ) ?? null)
      : null;
  if (wildcard) usedIds.add(titleIdentity(wildcard));

  // Worth Watching is the scored overflow beyond the lead, the top cases and
  // the wildcard — each title argues from exactly one personalized section.
  const worthWatching = scored
    .filter((a) => !usedIds.has(titleIdentity(a)) && (a.match ?? 0) >= NEUTRAL)
    .slice(0, WORTH_CAP);

  // SCHEDULE SECTIONS — provider facts only. Tonight (19:00–22:59 local) and
  // the Late-Night File (23:00 to the day's literal end) are disjoint.
  const upcoming = pool.filter((a) => startOf(a) >= nowMs);
  const tonightsDocket = upcoming.filter((a) => {
    const h = localHour(startOf(a), tz);
    return h >= 19 && h < 23;
  });
  const lateNightFile = upcoming.filter((a) => localHour(startOf(a), tz) >= 23);
  const moviesOnTheDocket = pool.filter((a) => a.showType === 'Movie').sort(byMatchDesc);
  const liveAndSports = pool.filter((a) => a.showType === 'Sports');
  const newAndPremieres = pool.filter((a) => a.isPremiere === true);

  return {
    dayKey,
    channel,
    poolCount: pool.length,
    leadCase,
    topCases,
    tonightsDocket: tonightsDocket.slice(0, SECTION_CAP),
    moviesOnTheDocket: moviesOnTheDocket.slice(0, SECTION_CAP),
    liveAndSports: liveAndSports.slice(0, SECTION_CAP),
    newAndPremieres: newAndPremieres.slice(0, SECTION_CAP),
    worthWatching,
    lateNightFile: lateNightFile.slice(0, LATE_CAP),
    wildcard,
    channels,
  };
}
