import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Airing } from '@/lib/onTv';

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
  stationName: string;
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
    showName: row.title,
    showId: Number.isFinite(parsedShowId) ? parsedShowId : stableIntId(row.programmeProviderId ?? row.title),
    episodeName: row.episodeTitle,
    season: row.seasonNumber,
    number: row.episodeNumber,
    showType: PROGRAMME_TYPE_TO_SHOW_TYPE[row.programmeType] ?? 'Special',
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
}
interface RawStation {
  id: string;
  name: string;
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

/**
 * Every ingested airing whose start falls in a window that opens
 * `lookbackMs` before `nowMs` (so a movie already running still shows as
 * "on now" — the same reason the live path fetches whole days and lets
 * `buildChannelGuide`'s `onNowOf` do the real windowing from each airing's
 * own runtime) through `nowMs + windowMs`.
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
    .select('station_id, programme_id, start_at_utc, provider_airing_id')
    .gte('start_at_utc', rangeStart)
    .lt('start_at_utc', rangeEnd)
    .order('start_at_utc', { ascending: true })
    .limit(1000);
  if (airingsError || !airings || airings.length === 0) {
    if (airingsError) console.error('[ingestedGuide] tv_airings query failed', airingsError.message);
    return [];
  }
  const rows = airings as RawAiring[];

  const stationIds = [...new Set(rows.map((r) => r.station_id))];
  const programmeIds = [...new Set(rows.map((r) => r.programme_id))];

  const [{ data: stations, error: stationsError }, { data: programmes, error: programmesError }] = await Promise.all([
    supabase.from('tv_stations').select('id, name').in('id', stationIds),
    supabase
      .from('tv_programmes')
      .select('id, provider_programme_id, title, episode_title, programme_type, season_number, episode_number, genres, description, runtime_minutes, artwork_url')
      .in('id', programmeIds),
  ]);
  if (stationsError || programmesError) {
    console.error('[ingestedGuide] station/programme lookup failed', stationsError?.message, programmesError?.message);
    return [];
  }

  const stationById = new Map((stations as RawStation[] | null ?? []).map((s) => [s.id, s]));
  const programmeById = new Map((programmes as RawProgramme[] | null ?? []).map((p) => [p.id, p]));

  return rows.flatMap((r) => {
    const station = stationById.get(r.station_id);
    const programme = programmeById.get(r.programme_id);
    if (!station || !programme) return [];
    return [
      ingestedRowToAiring({
        startAtUtc: r.start_at_utc,
        providerAiringId: r.provider_airing_id,
        stationName: station.name,
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
