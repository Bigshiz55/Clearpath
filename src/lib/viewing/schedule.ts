/**
 * PROVIDER-AGNOSTIC SCHEDULE LAYER.
 *
 * The product was coupled to two sources that cannot carry a national grid:
 * TVmaze (an episode-PREMIERE feed — 42 rows for an entire US day across 20
 * networks) and Gracenote's public grid (now behind an AWS WAF challenge). One
 * was mistaken for a listings grid; the other failed silently into `[]`.
 *
 * This module owns the parts that are independent of any provider — the
 * canonical time pipeline, availability filtering, correct deduplication and
 * ranking — so swapping in Schedules Direct, Gracenote/Xperi, TMS, XMLTV or a
 * per-network API changes only an adapter, never this logic.
 *
 * The three layers are kept strictly separate, in this order:
 *   AVAILABILITY  what is genuinely on  (never depends on enrichment)
 *   RANKING       what order to show it (never removes anything)
 *   RECOMMENDATION which one to highlight (an index, never a filter)
 */
import type { SourceStatus } from './status';
import type { RankingMethod, StageCount } from './contract';

/** One airing, normalised. Only the first five fields are required — a listing
 *  with no poster, rating, synopsis or episode data is still a valid listing. */
export interface ScheduleListing {
  /** Stable identity from the provider: channel + start + program. */
  listingId: string;
  channelId: string;
  channelName: string;
  /** Program start, ALWAYS a UTC instant. */
  startUtc: string;
  /** Program end, UTC. Null when the provider gives no duration. */
  endUtc: string | null;
  title: string;
  // --- everything below is enrichment: optional, never a filter ---
  episodeTitle?: string | null;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
  /** Provider's program id — distinguishes episodes sharing a series title. */
  programId?: string | null;
  contentType?: ContentType;
  genres?: string[];
  /** Only set when the PROVIDER flags it. Never inferred. */
  isNew?: boolean;
  isLive?: boolean;
  rating?: number | null;
  ratingSource?: string | null;
  posterUrl?: string | null;
  summary?: string | null;
  year?: number | null;
  tmdbId?: number | null;
  channelNumber?: string | null;
}

export type ContentType = 'movie' | 'series' | 'sports' | 'kids' | 'news' | 'special' | 'other';

/** What an adapter is asked for. */
export interface ScheduleRequest {
  region: string;
  /** Postal code or lineup id, when the provider needs one for local channels. */
  postalCode?: string | null;
  lineupId?: string | null;
  windowStartUtc: number;
  windowEndUtc: number;
  /** Optional channel narrowing, applied by the adapter when it can. */
  channels?: string[] | null;
}

/** What an adapter returns. Never a bare array — status always travels with it. */
export interface ScheduleResponse {
  providerId: string;
  status: SourceStatus;
  listings: ScheduleListing[];
  /** Rows the upstream handed over, before our normalisation. */
  totalRaw: number;
  totalNormalized: number;
  fetchedAt: string;
  /** Present for cached reads. */
  cachedAt?: string;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * A schedule source. Implement this and register it — nothing else changes.
 *
 * `isConfigured()` is separate from `fetch()` on purpose: a provider with no
 * credentials must report `misconfigured` up front rather than being tried and
 * failing, so the UI can say "no provider is configured" instead of "the
 * provider is down".
 */
export interface ScheduleAdapter {
  readonly providerId: string;
  /** Lower runs first. The primary provider should be 0. */
  readonly priority: number;
  isConfigured(): boolean;
  fetch(req: ScheduleRequest): Promise<ScheduleResponse>;
}

// ---------------------------------------------------------------------------
// CANONICAL TIME PIPELINE
// ---------------------------------------------------------------------------

/**
 * Parse a provider timestamp into a UTC instant, once.
 *
 * Rejects anything ambiguous rather than guessing. A bare "2026-07-26 20:00"
 * with no zone is NOT parsed as local server time — that is how a schedule ends
 * up shifted by hours on a server in a different region than the viewer.
 */
export function parseInstant(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const s = raw.trim();
  // Require an explicit zone: trailing Z, or ±HH:MM.
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(s)) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

/**
 * Is this airing inside [start, end]?
 *
 * A program that STARTED before the window but is still running counts as
 * available — "what's on in the next six hours" includes the film you can join
 * twenty minutes late. A program that already ended does not.
 */
export function inWindow(l: ScheduleListing, startMs: number, endMs: number): boolean {
  const s = parseInstant(l.startUtc);
  if (s == null) return false;
  const e = l.endUtc ? parseInstant(l.endUtc) : null;
  // Already finished — never show it.
  if (e != null && e <= startMs) return false;
  // Starts after the window closes.
  if (s > endMs) return false;
  // Starts inside the window, or started earlier and is still running.
  if (s >= startMs) return true;
  return e != null && e > startMs;
}

/** True when the program is on air at `atMs`. */
export function isInProgress(l: ScheduleListing, atMs: number): boolean {
  const s = parseInstant(l.startUtc);
  if (s == null || s > atMs) return false;
  const e = l.endUtc ? parseInstant(l.endUtc) : null;
  return e == null ? false : e > atMs;
}

/**
 * Display time in the VIEWER's zone — never the server's.
 *
 * `timeZone` is an IANA name ("America/Phoenix"). Intl handles DST and the
 * non-DST zones (Arizona, Hawaii) correctly; we never do arithmetic on offsets
 * ourselves, which is where hand-rolled schedule code usually breaks.
 */
export function localTime(utcIso: string, timeZone: string): string {
  const t = parseInstant(utcIso);
  if (t == null) return '';
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone,
  }).format(new Date(t));
}

/** Local calendar day for grouping ("Today"/"Tomorrow" logic lives in the UI). */
export function localDayKey(utcIso: string, timeZone: string): string {
  const t = parseInstant(utcIso);
  if (t == null) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone,
  }).format(new Date(t));
  return parts;
}

// ---------------------------------------------------------------------------
// DEDUPLICATION
// ---------------------------------------------------------------------------

/**
 * The identity of an airing.
 *
 * The old code deduped on `showId` alone, which collapsed EVERY airing of a
 * series into one row — different episodes, different channels and different
 * times all became a single card. That is a large part of why the guide looked
 * empty even when rows existed.
 *
 * A true duplicate is the same program, on the same channel, at the same
 * instant. Everything else is distinct inventory and must survive:
 *   * the same movie at 8pm and at 11pm      → two airings
 *   * the same movie on HBO and on HBO2      → two airings
 *   * different episodes of one series       → distinct programIds
 *   * an HD and an SD feed                   → distinct channelIds
 */
export function dedupeKey(l: ScheduleListing): string {
  const program = l.programId ?? [
    l.title.toLowerCase(),
    l.seasonNumber ?? '', l.episodeNumber ?? '', l.episodeTitle?.toLowerCase() ?? '',
  ].join('~');
  return `${l.channelId}|${l.startUtc}|${program}`;
}

export function dedupeListings(listings: ScheduleListing[]): ScheduleListing[] {
  const seen = new Set<string>();
  const out: ScheduleListing[] = [];
  for (const l of listings) {
    const k = l.listingId || dedupeKey(l);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(l);
  }
  return out;
}

// ---------------------------------------------------------------------------
// AVAILABILITY  (layer 1 — never consults enrichment)
// ---------------------------------------------------------------------------

export interface AvailabilityFilter {
  windowStartMs: number;
  windowEndMs: number;
  channels?: string[] | null;
  contentTypes?: ContentType[] | null;
}

/**
 * The valid inventory for a request, with a stage trace.
 *
 * Every rejection here is an AVAILABILITY rejection: outside the window, wrong
 * channel, wrong content type, or structurally invalid (no channel, no parsable
 * start). Missing posters, ratings, synopses, genres or personalization never
 * appear in this function — that is the whole point.
 */
export function selectAvailable(
  listings: ScheduleListing[],
  f: AvailabilityFilter,
): { available: ScheduleListing[]; stages: StageCount[] } {
  const stages: StageCount[] = [];
  const track = (stage: string, input: ScheduleListing[], out: ScheduleListing[], rule: string) => {
    if (out.length < input.length) stages.push({ stage, in: input.length, out: out.length, rule });
    else stages.push({ stage, in: input.length, out: out.length });
    return out;
  };

  let cur = listings;
  cur = track('structural', cur,
    cur.filter((l) => !!l.channelId && !!l.title && parseInstant(l.startUtc) != null),
    'listing must have a channel, a title and a parsable UTC start');

  cur = track('window', cur,
    cur.filter((l) => inWindow(l, f.windowStartMs, f.windowEndMs)),
    'airing must overlap the requested window');

  if (f.channels && f.channels.length > 0) {
    const want = new Set(f.channels.map((c) => c.toLowerCase()));
    cur = track('channel', cur,
      cur.filter((l) => want.has(l.channelId.toLowerCase()) || want.has(l.channelName.toLowerCase())),
      `channel must be one of: ${f.channels.join(', ')}`);
  }

  if (f.contentTypes && f.contentTypes.length > 0) {
    const want = new Set(f.contentTypes);
    cur = track('contentType', cur,
      cur.filter((l) => want.has(l.contentType ?? 'other')),
      `content type must be one of: ${f.contentTypes.join(', ')}`);
  }

  cur = track('dedupe', cur, dedupeListings(cur),
    'exact duplicate: same channel, same start, same program');

  return { available: cur, stages };
}

// ---------------------------------------------------------------------------
// RANKING  (layer 2 — reorders, never removes)
// ---------------------------------------------------------------------------

export interface RankSignals {
  /** 0..100 personalized fit, when a profile exists. */
  matchScore?: (l: ScheduleListing) => number | null;
}

/**
 * Sort the available set. Returns a NEW array of the SAME length — a ranking
 * that changes `length` is a bug, and `rankPreservesLength` in the tests pins it.
 */
export function rankListings(
  available: ScheduleListing[],
  method: RankingMethod,
  signals: RankSignals = {},
): ScheduleListing[] {
  const byTime = (a: ScheduleListing, b: ScheduleListing) =>
    (parseInstant(a.startUtc) ?? 0) - (parseInstant(b.startUtc) ?? 0);

  const out = [...available];
  switch (method) {
    case 'chronological':
      return out.sort(byTime);
    case 'highest_rated':
      // Unrated titles sort last but are NEVER dropped.
      return out.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || byTime(a, b));
    case 'best_match': {
      const score = signals.matchScore ?? (() => null);
      return out.sort((a, b) => {
        const sa = score(a), sb = score(b);
        if (sa != null && sb != null && sa !== sb) return sb - sa;
        if (sa != null && sb == null) return -1;
        if (sa == null && sb != null) return 1;
        return (b.rating ?? -1) - (a.rating ?? -1) || byTime(a, b);
      });
    }
    default:
      return out.sort(byTime);
  }
}

/**
 * RECOMMENDATION (layer 3): which index to highlight. Returns an INDEX so the
 * caller cannot accidentally replace the list with the pick.
 */
export function pickTopIndex(ranked: ScheduleListing[], signals: RankSignals = {}): number | null {
  if (ranked.length === 0) return null;
  const score = signals.matchScore;
  if (!score) return 0;
  let best = 0, bestScore = -Infinity;
  for (let i = 0; i < ranked.length; i++) {
    const s = score(ranked[i]!) ?? (ranked[i]!.rating ?? 0) * 10;
    if (s > bestScore) { bestScore = s; best = i; }
  }
  return best;
}
