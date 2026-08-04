import 'server-only';
import { matchChannel, TVMAZE_CHANNELS, type TvmazeChannelDef } from './tvmazeChannels';
import { normalizeAiring } from './normalizeTime';
import { hashPayload, type FetchedAiring } from './reconcile';

/**
 * TVMAZE INGEST — fetch, match, classify, premiere-detect.
 *
 * Split from the DB-facing writer (`tvmazeWriter.ts`) on purpose: everything
 * here is either pure or a single narrow fetch, so the matching/classification/
 * premiere logic is unit-testable without a network call or a database.
 */

// ---------------------------------------------------------------------------
// Raw TVmaze shapes (only the fields we read)
// ---------------------------------------------------------------------------

export interface TvmazeShow {
  id: number;
  name: string;
  type?: string | null;
  genres?: string[];
  runtime?: number | null;
  contentRating?: unknown;
  image?: { medium?: string | null; original?: string | null } | null;
  summary?: string | null;
  network?: { name?: string | null } | null;
  webChannel?: { name?: string | null } | null;
}

export interface TvmazeScheduleEpisode {
  id: number; // TVmaze EPISODE id — stable per episode, reused across reruns
  name?: string | null;
  season?: number | null;
  number?: number | null;
  airdate?: string | null; // this broadcast's date, "YYYY-MM-DD"
  airtime?: string | null; // "HH:MM", station-local
  airstamp?: string | null; // full ISO instant with offset
  runtime?: number | null;
  show?: TvmazeShow | null;
}

// ---------------------------------------------------------------------------
// Programme type classification (mirrors adapters/tvmaze.ts's `classify`,
// duplicated rather than imported: that file serves the request-time
// ScheduleAdapter contract with a different ContentType vocabulary, and DO
// NOT TOUCH keeps this ingest path from reaching into it).
// ---------------------------------------------------------------------------

/** `tv_programmes.programme_type` — documented vocabulary from 0032's own
 *  comment (movie|series|sports|news|kids|special); 'special' is the
 *  documented catch-all, used here for anything that doesn't fit the rest. */
export function classifyProgrammeType(show: Pick<TvmazeShow, 'type' | 'genres'>): string {
  const t = (show.type ?? '').toLowerCase();
  const g = (show.genres ?? []).map((x) => x.toLowerCase());
  if (t === 'movie') return 'movie';
  if (t === 'sports' || g.includes('sports')) return 'sports';
  if (t === 'news') return 'news';
  if (g.includes('children') || g.includes('family')) return 'kids';
  if (t === 'scripted' || t === 'animation' || t === 'reality') return 'series';
  return 'special';
}

const stripHtml = (h: string | null | undefined): string | null => {
  if (!h) return null;
  const t = h.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  return t.length > 0 ? t : null;
};

// ---------------------------------------------------------------------------
// Premiere / repeat detection
//
// TVmaze's /schedule endpoint has no "is this a rerun" flag. What it DOES
// carry, from two of its own endpoints, is comparable: the broadcast instance's
// own `airdate` (this specific airing), and the episode's canonical original
// `airdate` from /shows/{id}/episodes (when it first aired). A rerun is a
// broadcast whose instance airdate is LATER than the episode's original
// airdate; a premiere is a broadcast whose instance airdate EQUALS it.
//
// This is a derivation, not a raw provider flag — see the caveat in the
// commit message and PREMIERE_UNRELIABLE_NOTE below for where it can't run
// (fetch failure) or is meaningless (news/talk shows without a stable
// "original" concept).
// ---------------------------------------------------------------------------

export interface PremiereStatus {
  isPremiere: boolean | null;
  isRepeat: boolean | null;
  /** Set when the comparison could not be made or is not meaningful. */
  reason?: string;
}

export function premiereStatusFor(
  broadcastAirdate: string | null | undefined,
  originalAirdate: string | null | undefined,
): PremiereStatus {
  if (!broadcastAirdate) return { isPremiere: null, isRepeat: null, reason: 'no broadcast airdate' };
  if (!originalAirdate) {
    return { isPremiere: null, isRepeat: null, reason: 'original airdate unknown (episode index unavailable)' };
  }
  if (broadcastAirdate === originalAirdate) return { isPremiere: true, isRepeat: false };
  if (broadcastAirdate > originalAirdate) return { isPremiere: false, isRepeat: true };
  // A broadcast BEFORE the recorded "original" airdate is a data inconsistency
  // (e.g. a preview/early screening, or a since-corrected TVmaze record) —
  // honestly unknown rather than guessed either way.
  return { isPremiere: null, isRepeat: null, reason: 'broadcast airdate precedes recorded original airdate' };
}

// ---------------------------------------------------------------------------
// Row shaping — raw TVmaze data -> the shapes the writer persists
// ---------------------------------------------------------------------------

export interface MatchedAiring {
  channel: TvmazeChannelDef;
  episode: TvmazeScheduleEpisode;
  show: TvmazeShow;
}

/** Every configured-channel episode in one day's national schedule. Rows for
 *  channels TVmaze doesn't carry simply never appear here — the caller is
 *  responsible for reporting that against the full configured list. */
export function matchDay(episodes: TvmazeScheduleEpisode[]): MatchedAiring[] {
  const out: MatchedAiring[] = [];
  for (const ep of episodes) {
    const show = ep.show;
    if (!show) continue;
    const networkName = show.network?.name ?? show.webChannel?.name ?? null;
    const channel = matchChannel(networkName, show.name ?? null);
    if (channel) out.push({ channel, episode: ep, show });
  }
  return out;
}

export interface ProgrammeRow {
  providerProgrammeId: string;
  title: string;
  episodeTitle: string | null;
  programmeType: string;
  seasonNumber: number | null;
  episodeNumber: number | null;
  genres: string[];
  description: string | null;
  runtimeMinutes: number | null;
  artworkUrl: string | null;
}

export function buildProgrammeRow(m: MatchedAiring): ProgrammeRow {
  return {
    providerProgrammeId: String(m.show.id),
    title: m.show.name,
    episodeTitle: m.episode.name ?? null,
    programmeType: classifyProgrammeType(m.show),
    seasonNumber: m.episode.season ?? null,
    episodeNumber: m.episode.number ?? null,
    genres: m.show.genres ?? [],
    // TVmaze's own summary is licensed for this use per their API terms
    // (attribution required — see the on-screen credit this ships with).
    description: stripHtml(m.show.summary),
    runtimeMinutes: m.episode.runtime ?? m.show.runtime ?? null,
    // Hotlinked directly to TVmaze's own CDN URL — never downloaded, never
    // re-hosted. See CHANGES §7.
    artworkUrl: m.show.image?.original ?? m.show.image?.medium ?? null,
  };
}

export interface AiringRow {
  providerAiringId: string;
  stationKey: string;
  programmeProviderId: string;
  startAtUtc: string | null;
  endAtUtc: string | null;
  isComplete: boolean;
  startConfidence: string;
  isPremiere: boolean | null;
  isRepeat: boolean | null;
  premiereReason?: string;
  rawHash: string;
}

/**
 * One matched airing -> the row the writer persists.
 *
 * `providerAiringId` deliberately encodes both the episode id AND the
 * broadcast date: TVmaze's episode id is stable across every rerun of that
 * episode, so using it alone would collide with `tv_airings`'s
 * `(lineup_id, provider_airing_id)` uniqueness the moment the same episode
 * airs twice in the ingested window — exactly the rerun case this ingest
 * must represent as two distinct rows, not one.
 */
export function buildAiringRow(m: MatchedAiring, originalAirdate: string | null): AiringRow {
  const { episode } = m;
  const premiere = premiereStatusFor(episode.airdate, originalAirdate);
  const normalized = normalizeAiring(episode.airstamp, null, {
    durationMinutes: episode.runtime ?? m.show.runtime ?? null,
  });
  const rawHash = hashPayload({
    id: episode.id, name: episode.name, season: episode.season, number: episode.number,
    airdate: episode.airdate, airtime: episode.airtime, airstamp: episode.airstamp,
    runtime: episode.runtime, showName: m.show.name, showId: m.show.id,
  });
  return {
    providerAiringId: `tvmaze:${episode.id}:${episode.airdate ?? 'unknown'}`,
    stationKey: m.channel.key,
    programmeProviderId: String(m.show.id),
    startAtUtc: normalized.startUtcMs != null ? new Date(normalized.startUtcMs).toISOString() : null,
    endAtUtc: normalized.endUtcMs != null ? new Date(normalized.endUtcMs).toISOString() : null,
    isComplete: normalized.complete,
    startConfidence: normalized.startConfidence,
    isPremiere: premiere.isPremiere,
    isRepeat: premiere.isRepeat,
    premiereReason: premiere.reason,
    rawHash,
  };
}

/** Shape a matched airing into the pure `reconcile()` input, once its station
 *  and programme have real DB ids (assigned by the writer). */
export function toFetchedAiring(row: AiringRow, stationDbId: string, programmeDbId: string): FetchedAiring | null {
  if (!row.startAtUtc) return null; // no usable start — never stored
  return {
    providerAiringId: row.providerAiringId,
    stationId: stationDbId,
    programmeId: programmeDbId,
    startAtUtc: row.startAtUtc,
    endAtUtc: row.endAtUtc,
    rawHash: row.rawHash,
    isNew: row.isPremiere ?? undefined,
    isRepeat: row.isRepeat ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Network I/O — thin, no branching logic beyond parsing/error shape
// ---------------------------------------------------------------------------

const TVMAZE_BASE = 'https://api.tvmaze.com';

export interface FetchResult<T> {
  ok: boolean;
  data: T | null;
  status: number | null;
  error?: string;
}

// A hung TVmaze request used to be able to hang the whole ingest — and since
// the Pack page's own request runs the ingest inline (see lazyIngest.ts), a
// visitor's page load with it. Every call here is bounded so a stall fails
// fast (as a normal FetchResult.ok=false) instead of hanging indefinitely.
const FETCH_TIMEOUT_MS = 10_000;

async function getJson<T>(url: string): Promise<FetchResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!res.ok) return { ok: false, data: null, status: res.status, error: `HTTP ${res.status}` };
    const data = (await res.json()) as T;
    return { ok: true, data, status: res.status };
  } catch (e) {
    return { ok: false, data: null, status: null, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

/** One day of the US national schedule. */
export function fetchScheduleDay(date: string, country = 'US'): Promise<FetchResult<TvmazeScheduleEpisode[]>> {
  return getJson<TvmazeScheduleEpisode[]>(
    `${TVMAZE_BASE}/schedule?country=${encodeURIComponent(country)}&date=${encodeURIComponent(date)}`,
  );
}

interface TvmazeEpisodeRecord {
  id: number;
  airdate?: string | null;
}

/**
 * A show's full episode list, reduced to {episodeId -> original airdate}.
 * Fetched once per show per run (the caller is responsible for caching
 * across the days it iterates) — this is the one extra call premiere
 * detection costs, and it is genuinely necessary: nothing on the /schedule
 * response itself distinguishes a premiere from a rerun.
 */
export async function fetchShowOriginalAirdates(showId: number): Promise<Map<number, string> | null> {
  const res = await getJson<TvmazeEpisodeRecord[]>(`${TVMAZE_BASE}/shows/${showId}/episodes`);
  if (!res.ok || !res.data) return null;
  const map = new Map<number, string>();
  for (const ep of res.data) {
    if (ep.airdate) map.set(ep.id, ep.airdate);
  }
  return map;
}

export { TVMAZE_CHANNELS };
