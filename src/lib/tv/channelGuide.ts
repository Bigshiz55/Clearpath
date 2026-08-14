/**
 * THE CHANNEL GUIDE — the cable-box view of an ingested lineup.
 *
 * The Gracenote-fed `tv_grid` table this was originally built against is
 * retired (that public endpoint is now WAF-blocked and not worked around —
 * see docs/SCHEDULE_PROVIDERS.md). This module itself is provider-agnostic:
 * it turns whatever flat list of airings it's given into a browsable guide,
 * one row per channel — rather than the old one-channel-at-a-time "Lifetime
 * movies tonight" style question. A person with 300 channels does not browse
 * by interrogation; they open the guide and scan.
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
  /** The station's verified mark, when the ingest source licensed one. */
  networkLogoUrl?: string | null;
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
    // The logo travels with the channel, not the programme: every airing on a
    // row is the same station, so the first one that carries a licensed mark
    // speaks for the row. Absent stays absent — never a borrowed asset.
    const networkLogoUrl = list.find((a) => a.networkLogoUrl)?.networkLogoUrl ?? null;
    rows.push({ network, networkLogoUrl, onNow, progress, upNext });
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
 * WHY IS "MOVIES" EMPTY? — the smoke distinction the guide owes its reader.
 *
 * "0 channels with listings" under the Movies chip is FOUR different truths
 * wearing one sentence, and only one of them is about the world:
 *
 *   true-empty          — a LICENSED FULL GRID is supplying and it holds no
 *                         movie in the window. Only then is "that's the
 *                         schedule" a claim the data can back.
 *   coverage-unprovable — no licensed full-grid provider is supplying, so
 *                         the absence of movie-classified listings proves
 *                         NOTHING about the schedule. TVmaze is an episode
 *                         database, not an EPG: measured live (see
 *                         docs/tv-coverage/SOURCE_AND_CHANNEL_REPORT.md),
 *                         Hallmark/LMN/TCM are absent from it ENTIRELY and
 *                         movie blocks have near-zero coverage — a window
 *                         with no visible movies is the SOURCE's blind spot,
 *                         not an empty schedule, and saying otherwise was
 *                         the production failure this kind exists to end.
 *   filtered-out        — movie listings EXIST in the window, but the active
 *                         combination (a category chip, a search) removed the
 *                         channels carrying them. The media filter alone
 *                         cannot produce this: it keeps every channel with
 *                         any movie.
 *   unprovable-now      — listings classified as movies exist, but every one
 *                         already started and carries NO runtime, so the
 *                         guide cannot honestly claim it is still on
 *                         (`onNowOf` refuses) and it appears nowhere. The
 *                         failing boundary is the SOURCE's runtime field — a
 *                         pipeline gap, named, never papered over by showing
 *                         the row anyway.
 *
 * Pure; the component renders the right sentence per kind and NEVER
 * auto-switches the filter, disables the chip, or pads with unrelated
 * channels to avoid a zero. The coverage input is the page's
 * `hasLiveFullGridProvider()` — the same signal the coverage banner runs on,
 * so the two can never disagree. STRUCTURALLY, `true-empty` cannot be
 * produced without it: no copy change can bring "that's the schedule" back
 * to an unproven window without failing the tests that pin this function.
 */
export interface GuideCoverage {
  /** True only while a licensed full-grid provider is actually supplying.
   *  A premiere feed with rows is NOT coverage, however many rows it has. */
  fullGridProviderLive: boolean;
}

export type MoviesEmptyDiagnosis =
  | { kind: 'true-empty'; channelsWithListings: number }
  | { kind: 'coverage-unprovable'; channelsWithListings: number }
  | { kind: 'filtered-out'; moviesInWindow: number }
  | { kind: 'unprovable-now'; startedNoRuntime: number };

export function diagnoseMoviesEmpty(
  allRows: readonly ChannelRow[],
  airings: readonly Airing[],
  nowMs: number,
  coverage: GuideCoverage,
): MoviesEmptyDiagnosis {
  const moviesInWindow = guideSummary(allRows).movies;
  if (moviesInWindow > 0) return { kind: 'filtered-out', moviesInWindow };
  const startedNoRuntime = airings.filter(
    (a) =>
      a.showType === 'Movie' &&
      Number.isFinite(Date.parse(a.airstamp)) &&
      Date.parse(a.airstamp) <= nowMs &&
      (a.runtime == null || a.runtime <= 0),
  ).length;
  if (startedNoRuntime > 0) return { kind: 'unprovable-now', startedNoRuntime };
  if (!coverage.fullGridProviderLive) {
    return { kind: 'coverage-unprovable', channelsWithListings: allRows.length };
  }
  return { kind: 'true-empty', channelsWithListings: allRows.length };
}

/**
 * STRUCTURED OBSERVABILITY for the Movies question — the numbers behind
 * whichever sentence renders, kept queryable instead of buried in copy:
 * where the listings came from (in coverage terms), what the window held,
 * what was classified as what, and why anything classified as a movie is
 * not on screen. Pure; rendered as data-attributes at the empty state and
 * available to health surfaces.
 */
export interface MoviesDiagnostics {
  /** Coverage status: a licensed grid, or an episode database only. */
  coverage: 'licensed-grid' | 'episode-db-only';
  channelsWithListings: number;
  listingsInWindow: number;
  /** Airings whose NORMALIZED type is Movie, before visibility rules. */
  movieListings: number;
  /** Movies actually visible through the guide (on now / up next). */
  moviesVisible: number;
  /** Movie listings hidden because they started with no runtime. */
  startedNoRuntime: number;
  /** Normalized showType → count, the raw-vs-normalized evidence trail. */
  showTypeHistogram: Record<string, number>;
}

export function moviesDiagnostics(
  allRows: readonly ChannelRow[],
  airings: readonly Airing[],
  nowMs: number,
  coverage: GuideCoverage,
): MoviesDiagnostics {
  const showTypeHistogram: Record<string, number> = {};
  for (const a of airings) {
    const t = a.showType || '(none)';
    showTypeHistogram[t] = (showTypeHistogram[t] ?? 0) + 1;
  }
  return {
    coverage: coverage.fullGridProviderLive ? 'licensed-grid' : 'episode-db-only',
    channelsWithListings: allRows.length,
    listingsInWindow: airings.length,
    movieListings: airings.filter((a) => a.showType === 'Movie').length,
    moviesVisible: guideSummary(allRows).movies,
    startedNoRuntime: airings.filter(
      (a) =>
        a.showType === 'Movie' &&
        Number.isFinite(Date.parse(a.airstamp)) &&
        Date.parse(a.airstamp) <= nowMs &&
        (a.runtime == null || a.runtime <= 0),
    ).length,
    showTypeHistogram,
  };
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

export type RepeatStatus = 'new-episode' | 'repeat' | 'unknown';

/**
 * When the SAME show appears back-to-back in a channel's listings, is the
 * later slot a new episode, the earlier one repeated, or can we not tell?
 * Season+episode number is the only honest signal — a title-only match can't
 * distinguish a rerun from a same-named new episode, and a case name alone
 * (True Crime) doesn't carry a season/number either. Missing either side is
 * `'unknown'`, never guessed toward one answer or the other. `null` when the
 * two airings aren't even the same show — nothing to report.
 */
export function repeatStatusFor(prev: Airing, cur: Airing): RepeatStatus | null {
  if (prev.showId !== cur.showId) return null;
  const prevKnown = prev.season != null && prev.number != null;
  const curKnown = cur.season != null && cur.number != null;
  if (!prevKnown || !curKnown) return 'unknown';
  return prev.season === cur.season && prev.number === cur.number ? 'repeat' : 'new-episode';
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
