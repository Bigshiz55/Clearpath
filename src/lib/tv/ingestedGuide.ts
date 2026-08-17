import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { selectUpcomingAirings, usBroadcastDate, UPCOMING_TV_HORIZON_MS, type Airing } from '@/lib/onTv';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Below this many ingested rows a guide surface treats the canonical (ingested)
 * source as too thin to trust and falls back to the live TVmaze fetch, so no
 * surface is ever blank. Shared by every caller so the fallback threshold is
 * defined in exactly one place.
 */
export const INGESTED_MIN = 3;

/**
 * THE FULL GUIDE'S OWN CHANNELS — real listings from the TVmaze ingest tables
 * that back the Packs feature (src/lib/viewing/ingest/), not the live-fetch
 * path the Highlights/Movies tabs use. Only the channels actually configured
 * there (see tvmazeChannels.ts) can ever appear — a handful of Hallmark,
 * Lifetime and true-crime cable networks, not a full national grid. That is
 * an honest, if narrow, set of REAL rows; the page's own coverage banner
 * already reflects exactly how narrow from this same data (gridLive), so
 * nothing here needs to claim more than it has.
 *
 * Fields the ingest schema doesn't capture (critic rating, imdb id) are left
 * null — never guessed — exactly like a live-fetch movie with no imdb id
 * already renders in this same `Airing` shape.
 */

// F4 timezone seam: the ingest layer bakes an Eastern-anchored `time` string
// into each Airing (see `localTimeParts` / `ingestedRowToAiring` below). This
// is a FALLBACK ONLY — the client re-derives the display time from `airstamp`
// (the authoritative ISO-UTC instant) in the viewer's own zone, exactly as it
// does for the live-fetch path. Keeping the field Eastern-anchored matches the
// live path's own "provider airtimes are Eastern" convention (see
// `usBroadcastDate` in onTv.ts); it is intentionally NOT a naive-`Date` local
// conversion, so no server-zone timezone bug can leak in here.
const NETWORK_TZ = 'America/New_York';

const PROGRAMME_TYPE_TO_SHOW_TYPE: Record<string, string> = {
  movie: 'Movie',
  series: 'Scripted',
  sports: 'Sports',
  news: 'News',
  kids: 'Kids',
  special: 'Special',
};

/**
 * `tv_programmes.programme_type` → the guide's `showType`, NORMALIZED at the
 * boundary. The writers' documented vocabulary is lowercase, but this reader
 * outlives any one writer — and an exact-match lookup silently turned every
 * case/whitespace variant a past or future ingest stored ('Movie', ' movie')
 * into 'Special', which is invisible to the Movies filter, the movies count
 * AND the movie-only selector at once. Trim + lowercase is normalization of
 * the DECLARED vocabulary, not a guess at an undeclared one: an unknown type
 * still lands on the documented 'Special' catch-all.
 */
export function showTypeForProgrammeType(programmeType: string | null | undefined): string {
  return PROGRAMME_TYPE_TO_SHOW_TYPE[(programmeType ?? '').trim().toLowerCase()] ?? 'Special';
}

/**
 * Deterministic positive integer from a string (FNV-1a over a 32-bit space) —
 * stable across renders and page loads, so a "remind me" set on one visit
 * still reads as set on the next. `tv_airings` has no numeric id of its own
 * (it's a uuid); this is seeded from `provider_airing_id`, which TVmaze's own
 * ingest already builds as `tvmaze:<episodeId>:<airdate>` specifically so two
 * broadcasts of the same episode on different days never collide (see
 * buildAiringRow's own comment in tvmazeIngest.ts) — hashing that same string
 * carries the same guarantee here.
 */
function stableIntId(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function localTimeParts(iso: string): { time: string; minutes: number } {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: NETWORK_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const hh = Number(parts.find((p) => p.type === 'hour')?.value ?? '0') % 24;
  const mm = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return { time: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, minutes: hh * 60 + mm };
}

export interface IngestedAiringRow {
  startAtUtc: string;
  providerAiringId: string | null;
  /** `tv_airings.is_premiere` — provider-flagged first showing, or null. */
  isPremiere?: boolean | null;
  stationName: string;
  /** `tv_stations.logo_url` — a licensed station mark, or null. Never guessed. */
  stationLogoUrl?: string | null;
  programmeProviderId: string | null;
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

/** Pure — one ingested-table row to the same `Airing` type the live TVmaze
 *  fetch produces, so the guide (and reminders, saves, scoring) treat both
 *  sources identically. */
export function ingestedRowToAiring(row: IngestedAiringRow): Airing {
  const { time, minutes } = localTimeParts(row.startAtUtc);
  const idSeed = row.providerAiringId ?? `${row.programmeProviderId ?? row.title}:${row.startAtUtc}`;
  const parsedShowId = row.programmeProviderId ? Number(row.programmeProviderId) : NaN;
  return {
    id: stableIntId(idSeed),
    time,
    minutes,
    airstamp: row.startAtUtc,
    runtime: row.runtimeMinutes,
    network: row.stationName,
    networkLogoUrl: row.stationLogoUrl ?? null,
    showName: row.title,
    showId: Number.isFinite(parsedShowId) ? parsedShowId : stableIntId(row.programmeProviderId ?? row.title),
    episodeName: row.episodeTitle,
    season: row.seasonNumber,
    number: row.episodeNumber,
    showType: showTypeForProgrammeType(row.programmeType),
    isPremiere: row.isPremiere ?? null,
    genres: row.genres,
    rating: null,
    image: row.artworkUrl,
    summary: row.description,
    imdb: null,
  };
}

interface RawAiring {
  station_id: string;
  programme_id: string;
  start_at_utc: string;
  provider_airing_id: string | null;
  is_premiere: boolean | null;
}
interface RawStation {
  id: string;
  name: string;
  /** Licensed station mark, where the ingest source provided one. Migration
   *  0032 declares it ("only where licensed"); nothing writes it today, so the
   *  guide keeps its own monogram until a licensed source lands. */
  logo_url: string | null;
}
interface RawProgramme {
  id: string;
  provider_programme_id: string | null;
  title: string;
  episode_title: string | null;
  programme_type: string;
  season_number: number | null;
  episode_number: number | null;
  genres: string[] | null;
  description: string | null;
  runtime_minutes: number | null;
  artwork_url: string | null;
}

/** `.in()` id-lookup batch size — keeps each PostgREST filter URL short and
 *  every response under the server's own row cap, however many distinct
 *  programmes a full national day carries. */
const IN_CHUNK = 200;
/** PostgREST caps any single response at 1000 rows; paging respects it. */
const PAGE_ROWS = 1000;
/** Hard ceiling on one day-read — far above any real lineup's day (~4,500
 *  airings on the largest measured feed), a runaway backstop, not a budget. */
const DAY_READ_CAP = 20_000;

/** Fetch rows for `ids` in IN_CHUNK batches. Null on any batch error — the
 *  caller degrades to [] exactly as a single failed lookup always has. */
async function chunkedByIds<T>(
  ids: string[],
  fetchChunk: (chunk: string[]) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T[] | null> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data, error } = await fetchChunk(ids.slice(i, i + IN_CHUNK));
    if (error) {
      console.error('[ingestedGuide] id lookup chunk failed', error.message);
      return null;
    }
    out.push(...((data as T[] | null) ?? []));
  }
  return out;
}

/** The shared join half of every reader here: raw airing rows → `Airing[]`
 *  via their station and programme rows. Fail-open: any lookup error → []. */
async function hydrateAiringRows(supabase: SupabaseClient, rows: RawAiring[]): Promise<Airing[]> {
  if (rows.length === 0) return [];
  const stationIds = [...new Set(rows.map((r) => r.station_id))];
  const programmeIds = [...new Set(rows.map((r) => r.programme_id))];

  const [stations, programmes] = await Promise.all([
    chunkedByIds<RawStation>(stationIds, (chunk) => supabase.from('tv_stations').select('id, name, logo_url').in('id', chunk)),
    chunkedByIds<RawProgramme>(programmeIds, (chunk) =>
      supabase
        .from('tv_programmes')
        .select('id, provider_programme_id, title, episode_title, programme_type, season_number, episode_number, genres, description, runtime_minutes, artwork_url')
        .in('id', chunk),
    ),
  ]);
  if (!stations || !programmes) return [];

  const stationById = new Map(stations.map((s) => [s.id, s]));
  const programmeById = new Map(programmes.map((p) => [p.id, p]));

  return rows.flatMap((r) => {
    const station = stationById.get(r.station_id);
    const programme = programmeById.get(r.programme_id);
    if (!station || !programme) return [];
    return [
      ingestedRowToAiring({
        startAtUtc: r.start_at_utc,
        providerAiringId: r.provider_airing_id,
        isPremiere: r.is_premiere,
        stationName: station.name,
        stationLogoUrl: station.logo_url ?? null,
        programmeProviderId: programme.provider_programme_id,
        title: programme.title,
        episodeTitle: programme.episode_title,
        programmeType: programme.programme_type,
        seasonNumber: programme.season_number,
        episodeNumber: programme.episode_number,
        genres: programme.genres ?? [],
        description: programme.description,
        runtimeMinutes: programme.runtime_minutes,
        artworkUrl: programme.artwork_url,
      }),
    ];
  });
}

/**
 * Every ingested airing whose start falls in a window that opens
 * `lookbackMs` before `nowMs` (so a movie already running still shows as
 * "on now" — the same reason the live path fetches whole days and lets
 * `buildChannelGuide`'s `onNowOf` do the real windowing from each airing's
 * own runtime) through `nowMs + windowMs`. One page: the first 1000 rows of
 * the window — the guide's 6-hour windows fit; whole-day reads over a full
 * national lineup do not, and use `getIngestedDayAirings` below.
 */
export async function getIngestedGuideAirings(
  supabase: SupabaseClient,
  nowMs: number,
  windowMs: number,
  lookbackMs = 6 * 60 * 60 * 1000,
): Promise<Airing[]> {
  const rangeStart = new Date(nowMs - lookbackMs).toISOString();
  const rangeEnd = new Date(nowMs + windowMs).toISOString();

  const { data: airings, error: airingsError } = await supabase
    .from('tv_airings')
    .select('station_id, programme_id, start_at_utc, provider_airing_id, is_premiere')
    .gte('start_at_utc', rangeStart)
    .lt('start_at_utc', rangeEnd)
    .order('start_at_utc', { ascending: true })
    .limit(1000);
  if (airingsError || !airings || airings.length === 0) {
    if (airingsError) console.error('[ingestedGuide] tv_airings query failed', airingsError.message);
    return [];
  }
  return hydrateAiringRows(supabase, airings as RawAiring[]);
}

/**
 * EVERY ingested airing starting in [rangeStartMs, rangeEndMs) — paged, so a
 * full national day (measured ~4,500 airings on the largest real feed) comes
 * back whole instead of silently truncating at PostgREST's 1000-row response
 * cap. Order is (start_at_utc, id) — the id tiebreak keeps page boundaries
 * stable when hundreds of channels start programmes at the same instant.
 * Fail-open: a failed page logs and returns what was already read.
 */
export async function getIngestedDayAirings(
  supabase: SupabaseClient,
  rangeStartMs: number,
  rangeEndMs: number,
): Promise<Airing[]> {
  const rangeStart = new Date(rangeStartMs).toISOString();
  const rangeEnd = new Date(rangeEndMs).toISOString();
  const all: RawAiring[] = [];
  for (let offset = 0; offset < DAY_READ_CAP; offset += PAGE_ROWS) {
    const { data, error } = await supabase
      .from('tv_airings')
      .select('station_id, programme_id, start_at_utc, provider_airing_id, is_premiere')
      .gte('start_at_utc', rangeStart)
      .lt('start_at_utc', rangeEnd)
      .order('start_at_utc', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_ROWS - 1);
    if (error) {
      console.error('[ingestedGuide] day page read failed', error.message);
      break;
    }
    const page = (data as RawAiring[] | null) ?? [];
    all.push(...page);
    if (page.length < PAGE_ROWS) break;
  }
  if (all.length >= DAY_READ_CAP) {
    console.warn(`[ingestedGuide] day read hit the ${DAY_READ_CAP}-row backstop — tail truncated`);
  }
  return hydrateAiringRows(supabase, all);
}

/**
 * "Coming up on TV", read from the INGESTED tables instead of the live TVmaze
 * fetch — the canonical guide source now that the ingest carries national
 * breadth. Mirrors `getUpcomingTv`'s contract exactly: it reads the ingested
 * airings over the horizon window and hands them to the SAME pure selector
 * (`selectUpcomingAirings`) the live path uses, so the noise/genre/network/
 * movie filters, rating rank, showId dedupe and time ordering are identical and
 * the returned `Airing[]` is indistinguishable in shape from the live result.
 *
 * The ingested lineup is the US national grid, so this is a no-op (returns [])
 * for any non-US region — callers fall back to the live `getUpcomingTv(region…)`
 * path, which is region-aware. It never throws: a query failure degrades to []
 * so the caller's never-blank fallback takes over.
 */
export async function getUpcomingTvIngested(
  supabase: SupabaseClient,
  region: string,
  nowMs: number,
  horizonMs: number = UPCOMING_TV_HORIZON_MS,
  genre: string | null = null,
  network: string | null = null,
  movieOnly = false,
): Promise<Airing[]> {
  if (region !== 'US') return [];
  const clampedHorizon = Math.max(HOUR_MS, Math.min(horizonMs, UPCOMING_TV_HORIZON_MS));
  const airings = await getIngestedGuideAirings(supabase, nowMs, clampedHorizon).catch((e) => {
    console.error('[ingestedGuide] getUpcomingTvIngested read failed', e instanceof Error ? e.message : e);
    return [] as Airing[];
  });
  return selectUpcomingAirings(airings, nowMs, horizonMs, genre, network, movieOnly);
}

/**
 * PURE: the airings on the SAME US-Eastern calendar day as `nowMs`, in
 * time-of-day order — the exact contract `getOnTvToday` returns (a full day,
 * every airing, not a curated/deduped subset), so `OnTvGuide` (which shows a
 * `{count} airings` total and does its own now-&-next curation) behaves
 * identically no matter which source fed it. `usBroadcastDate` is the same
 * Eastern day key `getOnTvToday` uses, so the two sources agree on "today"
 * (DST-safe: it is an Intl Eastern format, never `+24h` arithmetic).
 */
export function selectTodayAirings(airings: Airing[], nowMs: number): Airing[] {
  const todayEastern = usBroadcastDate(nowMs);
  return airings
    .filter((a) => {
      // Guard an unparseable airstamp: Date.parse → NaN, and usBroadcastDate
      // would throw on `new Date(NaN)`. A row with no usable start is dropped,
      // never crashes the guide (matches `toAiring`'s own no-airstamp guard).
      const ms = Date.parse(a.airstamp);
      return Number.isFinite(ms) && usBroadcastDate(ms) === todayEastern;
    })
    .sort((a, b) => a.minutes - b.minutes);
}

/**
 * "On TV today", read from the INGESTED tables — the like-for-like ingested
 * counterpart of the live `getOnTvToday(region, date)`. It reads a window that
 * comfortably brackets the US-Eastern calendar day around `nowMs` (a day of
 * lookback + a day ahead) and keeps only that day's airings, so a viewer late
 * in the evening still sees the whole day and one early the next morning does
 * not bleed into it. Returns the FULL day's set (no rank/dedupe/noise filter),
 * matching `getOnTvToday`'s contract exactly.
 *
 * US-only (the ingested lineup is the US national grid) → non-US returns [] so
 * the caller falls back to the region-aware live path. Never throws: a query
 * failure degrades to [] and the caller's never-blank fallback takes over.
 */
export async function getOnTvTodayIngested(
  supabase: SupabaseClient,
  region: string,
  nowMs: number,
): Promise<Airing[]> {
  if (region !== 'US') return [];
  // Bracket the Eastern day: up to ~24h of it may already be in the past when
  // it is late evening, and up to ~24h ahead when it is early morning.
  const airings = await getIngestedGuideAirings(supabase, nowMs, DAY_MS, DAY_MS).catch((e) => {
    console.error('[ingestedGuide] getOnTvTodayIngested read failed', e instanceof Error ? e.message : e);
    return [] as Airing[];
  });
  return selectTodayAirings(airings, nowMs);
}
