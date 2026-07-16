import 'server-only';
import { serverEnv, ConfigError } from '@/lib/env';
import type {
  MediaType,
  SimilarTitle,
  TitleMetadata,
  WatchProvider,
  WatchProviders,
} from '@/lib/types';
import { computeEnglishAvailability } from './meta-helpers';

const TMDB_BASE = 'https://api.themoviedb.org/3';
export { TMDB_IMAGE_BASE, tmdbImage } from './image';

export class TmdbError extends Error {
  readonly status: number;
  readonly userMessage: string;
  constructor(status: number, userMessage: string) {
    super(userMessage);
    this.name = 'TmdbError';
    this.status = status;
    this.userMessage = userMessage;
  }
}

function authHeaders(key: string): Record<string, string> {
  // v4 read-access tokens are JWTs (start with "ey"). v3 keys are short hex.
  if (key.startsWith('ey')) {
    return { Authorization: `Bearer ${key}`, Accept: 'application/json' };
  }
  return { Accept: 'application/json' };
}

function withApiKey(url: URL, key: string): URL {
  if (!key.startsWith('ey')) url.searchParams.set('api_key', key);
  return url;
}

async function tmdbFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  let key: string;
  try {
    key = serverEnv.tmdbKey();
  } catch (e) {
    if (e instanceof ConfigError) throw new TmdbError(503, e.userMessage);
    throw e;
  }

  const url = withApiKey(new URL(`${TMDB_BASE}${path}`), key);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: authHeaders(key),
      signal: controller.signal,
      // TMDB metadata is fine to cache briefly at the edge/runtime.
      next: { revalidate: 60 * 60 },
    });
  } catch {
    throw new TmdbError(504, 'Could not reach the movie database. Please try again.');
  } finally {
    clearTimeout(timeout);
  }

  if (res.status === 401) {
    throw new TmdbError(401, 'The TMDB API key is invalid. Check your configuration.');
  }
  if (res.status === 404) {
    throw new TmdbError(404, 'That title could not be found.');
  }
  if (res.status === 429) {
    throw new TmdbError(429, 'The movie database is rate-limiting requests. Please try again shortly.');
  }
  if (!res.ok) {
    throw new TmdbError(res.status, 'The movie database returned an unexpected error.');
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface SearchResultItem {
  id: number;
  mediaType: MediaType;
  title: string;
  year: number | null;
  overview: string;
  posterPath: string | null;
  voteAverage: number | null;
  popularity: number | null;
}

interface TmdbMultiResult {
  page: number;
  results: Array<{
    id: number;
    media_type?: string;
    title?: string;
    name?: string;
    release_date?: string;
    first_air_date?: string;
    overview?: string;
    poster_path?: string | null;
    vote_average?: number;
    popularity?: number;
  }>;
}

function yearFrom(date?: string): number | null {
  if (!date) return null;
  const y = Number.parseInt(date.slice(0, 4), 10);
  return Number.isFinite(y) ? y : null;
}

type MultiRow = TmdbMultiResult['results'][number];

function toResult(r: MultiRow, forced?: MediaType): SearchResultItem | null {
  const mediaType = (forced ?? r.media_type) as MediaType;
  if (mediaType !== 'movie' && mediaType !== 'tv') return null;
  return {
    id: r.id,
    mediaType,
    title: (mediaType === 'movie' ? r.title : r.name) ?? 'Untitled',
    year: yearFrom(mediaType === 'movie' ? r.release_date : r.first_air_date),
    overview: r.overview ?? '',
    posterPath: r.poster_path ?? null,
    voteAverage: typeof r.vote_average === 'number' ? r.vote_average : null,
    popularity: typeof r.popularity === 'number' ? r.popularity : null,
  };
}

export async function searchTitles(query: string): Promise<SearchResultItem[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const params = { query: trimmed, include_adult: 'false', language: 'en-US', page: '1' };
  const data = await tmdbFetch<TmdbMultiResult>('/search/multi', params);
  let results = data.results
    .map((r) => toResult(r))
    .filter((r): r is SearchResultItem => r !== null);

  // Fallback: if multi-search finds nothing, try the dedicated movie and TV
  // endpoints (they sometimes match where multi doesn't) so we never dead-end.
  if (results.length === 0) {
    const [movies, tv] = await Promise.all([
      tmdbFetch<TmdbMultiResult>('/search/movie', params).catch(() => ({ page: 1, results: [] })),
      tmdbFetch<TmdbMultiResult>('/search/tv', params).catch(() => ({ page: 1, results: [] })),
    ]);
    const merged = [
      ...movies.results.map((r) => toResult(r, 'movie')),
      ...tv.results.map((r) => toResult(r, 'tv')),
    ].filter((r): r is SearchResultItem => r !== null);
    const seen = new Set<string>();
    results = merged.filter((r) => {
      const k = `${r.mediaType}-${r.id}`;
      return seen.has(k) ? false : (seen.add(k), true);
    });
  }

  return results.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0)).slice(0, 20);
}

// ---------------------------------------------------------------------------
// Discovery (recent releases) — used by the daily digest scan
// ---------------------------------------------------------------------------

export interface DiscoverItem {
  id: number;
  mediaType: MediaType;
  title: string;
  year: number | null;
  posterPath: string | null;
  releaseDate: string | null;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Recently released movies and TV shows in the last `days` days. */
export async function discoverRecent(region = 'US', days = 21, perType = 20): Promise<DiscoverItem[]> {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  const common = {
    language: 'en-US',
    include_adult: 'false',
    sort_by: 'popularity.desc',
    watch_region: region,
    'vote_count.gte': '20',
    page: '1',
  };
  const [movies, tv] = await Promise.all([
    tmdbFetch<TmdbMultiResult>('/discover/movie', {
      ...common,
      'primary_release_date.gte': isoDate(from),
      'primary_release_date.lte': isoDate(to),
    }).catch(() => ({ page: 1, results: [] })),
    tmdbFetch<TmdbMultiResult>('/discover/tv', {
      ...common,
      'first_air_date.gte': isoDate(from),
      'first_air_date.lte': isoDate(to),
    }).catch(() => ({ page: 1, results: [] })),
  ]);

  const mapItems = (rows: TmdbMultiResult['results'], mt: MediaType): DiscoverItem[] =>
    rows.slice(0, perType).map((r) => ({
      id: r.id,
      mediaType: mt,
      title: (mt === 'movie' ? r.title : r.name) ?? 'Untitled',
      year: yearFrom(mt === 'movie' ? r.release_date : r.first_air_date),
      posterPath: r.poster_path ?? null,
      releaseDate: (mt === 'movie' ? r.release_date : r.first_air_date) ?? null,
    }));

  return [...mapItems(movies.results, 'movie'), ...mapItems(tv.results, 'tv')];
}

/**
 * Popular, well-rated titles in the given genres — used to seed recommendations
 * from a taste profile alone (before the user has any watch history). Genres are
 * OR-matched so the pool stays broad; profile scoring narrows it down after.
 */
export async function discoverByGenres(
  mediaType: MediaType,
  genreIds: number[],
  region = 'US',
): Promise<DiscoverItem[]> {
  if (genreIds.length === 0) return [];
  const data = await tmdbFetch<TmdbMultiResult>(`/discover/${mediaType}`, {
    language: 'en-US',
    include_adult: 'false',
    sort_by: 'popularity.desc',
    watch_region: region,
    with_genres: genreIds.join('|'),
    'vote_count.gte': '200',
    'vote_average.gte': '6.4',
    page: '1',
  }).catch(() => ({ page: 1, results: [] as TmdbMultiResult['results'] }));

  return data.results.slice(0, 20).map((r) => {
    const mt = mediaType;
    return {
      id: r.id,
      mediaType: mt,
      title: (mt === 'movie' ? r.title : r.name) ?? 'Untitled',
      year: yearFrom(mt === 'movie' ? r.release_date : r.first_air_date),
      posterPath: r.poster_path ?? null,
      releaseDate: (mt === 'movie' ? r.release_date : r.first_air_date) ?? null,
    };
  });
}

export interface DiscoverOptions {
  genreIds?: number[];
  /** TMDB watch-provider ids (subscription/flatrate). */
  providerIds?: number[];
  region?: string;
  sortBy?: string;
  minVotes?: number;
  minRating?: number;
  /** Restrict to titles first released/aired within this many days (past). */
  sinceDays?: number;
  /** Restrict to titles releasing within this many days from now (future). */
  upcomingDays?: number;
  /** Movie runtime ceiling in minutes (with_runtime.lte). */
  maxRuntime?: number;
  page?: number;
}

/**
 * General-purpose discovery — genre and/or streaming-provider filtered. Used by
 * the mood finder and the "new on your services" feed. Returns only real TMDB
 * rows; on any error yields an empty list so callers degrade gracefully.
 */
export async function discoverTitles(
  mediaType: MediaType,
  opts: DiscoverOptions = {},
): Promise<DiscoverItem[]> {
  const region = opts.region ?? 'US';
  const params: Record<string, string> = {
    language: 'en-US',
    include_adult: 'false',
    sort_by: opts.sortBy ?? 'popularity.desc',
    watch_region: region,
    page: String(opts.page ?? 1),
  };
  if (opts.genreIds && opts.genreIds.length > 0) params.with_genres = opts.genreIds.join('|');
  if (opts.providerIds && opts.providerIds.length > 0) {
    params.with_watch_providers = opts.providerIds.join('|');
    params.with_watch_monetization_types = 'flatrate|free|ads';
  }
  if (opts.minVotes != null) params['vote_count.gte'] = String(opts.minVotes);
  if (opts.minRating != null) params['vote_average.gte'] = String(opts.minRating);
  if (opts.maxRuntime != null && mediaType === 'movie') params['with_runtime.lte'] = String(opts.maxRuntime);
  if (opts.sinceDays != null) {
    const from = isoDate(new Date(Date.now() - opts.sinceDays * 86_400_000));
    const to = isoDate(new Date());
    if (mediaType === 'movie') {
      params['primary_release_date.gte'] = from;
      params['primary_release_date.lte'] = to;
    } else {
      params['first_air_date.gte'] = from;
      params['first_air_date.lte'] = to;
    }
  }
  if (opts.upcomingDays != null) {
    // Strictly future: from tomorrow to now + N days, soonest-first when sorted asc.
    const from = isoDate(new Date(Date.now() + 86_400_000));
    const to = isoDate(new Date(Date.now() + opts.upcomingDays * 86_400_000));
    if (mediaType === 'movie') {
      params['primary_release_date.gte'] = from;
      params['primary_release_date.lte'] = to;
    } else {
      params['first_air_date.gte'] = from;
      params['first_air_date.lte'] = to;
    }
  }

  const data = await tmdbFetch<TmdbMultiResult>(`/discover/${mediaType}`, params).catch(
    () => ({ page: 1, results: [] as TmdbMultiResult['results'] }),
  );
  return data.results
    .filter((r) => r.poster_path)
    .map((r) => ({
      id: r.id,
      mediaType,
      title: (mediaType === 'movie' ? r.title : r.name) ?? 'Untitled',
      year: yearFrom(mediaType === 'movie' ? r.release_date : r.first_air_date),
      posterPath: r.poster_path ?? null,
      releaseDate: (mediaType === 'movie' ? r.release_date : r.first_air_date) ?? null,
    }));
}

export interface TvFreshness {
  status: string | null;
  lastAirDate: string | null;
  nextAirDate: string | null;
  name: string;
}

/** Minimal TV status/air-date lookup for the "new episodes" feed (one light call). */
export async function getTvFreshness(id: number): Promise<TvFreshness | null> {
  interface TvLite {
    name?: string;
    status?: string;
    last_air_date?: string | null;
    next_episode_to_air?: { air_date?: string | null } | null;
  }
  const d = await tmdbFetch<TvLite>(`/tv/${id}`, { language: 'en-US' }).catch(() => null);
  if (!d) return null;
  return {
    status: d.status ?? null,
    lastAirDate: d.last_air_date ?? null,
    nextAirDate: d.next_episode_to_air?.air_date ?? null,
    name: d.name ?? 'Untitled',
  };
}

/**
 * Popular, widely-recognized titles for the taste quiz — high vote counts so
 * people are likely to have an opinion. Broad across genres.
 */
export async function getPopular(
  mediaType: MediaType,
  region = 'US',
  page = 1,
): Promise<DiscoverItem[]> {
  const data = await tmdbFetch<TmdbMultiResult>(`/discover/${mediaType}`, {
    language: 'en-US',
    include_adult: 'false',
    sort_by: 'popularity.desc',
    watch_region: region,
    'vote_count.gte': mediaType === 'movie' ? '800' : '400',
    page: String(page),
  }).catch(() => ({ page: 1, results: [] as TmdbMultiResult['results'] }));

  return data.results
    .filter((r) => r.poster_path)
    .map((r) => ({
      id: r.id,
      mediaType,
      title: (mediaType === 'movie' ? r.title : r.name) ?? 'Untitled',
      year: yearFrom(mediaType === 'movie' ? r.release_date : r.first_air_date),
      posterPath: r.poster_path ?? null,
      releaseDate: (mediaType === 'movie' ? r.release_date : r.first_air_date) ?? null,
    }));
}

// ---------------------------------------------------------------------------
// Details
// ---------------------------------------------------------------------------

interface TmdbVideo { type: string; site: string; key: string; official?: boolean }
interface TmdbGenre { id: number; name: string }
interface TmdbKeyword { id: number; name: string }

interface TmdbDetail {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  genres?: TmdbGenre[];
  poster_path?: string | null;
  backdrop_path?: string | null;
  runtime?: number | null;
  episode_run_time?: number[];
  number_of_seasons?: number;
  number_of_episodes?: number;
  status?: string;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  original_language?: string;
  spoken_languages?: Array<{ english_name?: string; name?: string }>;
  belongs_to_collection?: { id: number } | null;
  videos?: { results: TmdbVideo[] };
  keywords?: { keywords?: TmdbKeyword[]; results?: TmdbKeyword[] };
  release_dates?: { results: Array<{ iso_3166_1: string; release_dates: Array<{ certification: string }> }> };
  content_ratings?: { results: Array<{ iso_3166_1: string; rating: string }> };
  external_ids?: { imdb_id?: string | null };
  imdb_id?: string | null;
  origin_country?: string[];
  production_countries?: Array<{ iso_3166_1: string }>;
  next_episode_to_air?: { air_date?: string | null } | null;
  translations?: { translations?: Array<{ iso_639_1: string }> };
}

function pickTrailer(videos?: { results: TmdbVideo[] }): string | null {
  if (!videos?.results) return null;
  const yt = videos.results.filter((v) => v.site === 'YouTube');
  const trailer =
    yt.find((v) => v.type === 'Trailer' && v.official) ??
    yt.find((v) => v.type === 'Trailer') ??
    yt.find((v) => v.type === 'Teaser');
  return trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : null;
}

function movieCert(detail: TmdbDetail, region: string): string | null {
  const results = detail.release_dates?.results ?? [];
  const match = results.find((r) => r.iso_3166_1 === region) ?? results.find((r) => r.iso_3166_1 === 'US');
  const cert = match?.release_dates.map((d) => d.certification).find((c) => c && c.trim() !== '');
  return cert && cert.trim() !== '' ? cert : null;
}

function tvCert(detail: TmdbDetail, region: string): string | null {
  const results = detail.content_ratings?.results ?? [];
  const match = results.find((r) => r.iso_3166_1 === region) ?? results.find((r) => r.iso_3166_1 === 'US');
  return match?.rating && match.rating.trim() !== '' ? match.rating : null;
}

export async function getTitle(
  mediaType: MediaType,
  id: number,
  region = 'US',
): Promise<TitleMetadata> {
  const append =
    mediaType === 'movie'
      ? 'videos,keywords,release_dates,external_ids,translations'
      : 'videos,keywords,content_ratings,external_ids,translations';
  const detail = await tmdbFetch<TmdbDetail>(`/${mediaType}/${id}`, {
    language: 'en-US',
    append_to_response: append,
  });

  const keywords =
    (detail.keywords?.keywords ?? detail.keywords?.results ?? []).map((k) => k.name);

  const episodeRuntime =
    mediaType === 'tv' && detail.episode_run_time && detail.episode_run_time.length > 0
      ? detail.episode_run_time[0]!
      : null;

  return {
    id: detail.id,
    mediaType,
    title: (mediaType === 'movie' ? detail.title : detail.name) ?? 'Untitled',
    originalTitle: mediaType === 'movie' ? detail.original_title : detail.original_name,
    year: yearFrom(mediaType === 'movie' ? detail.release_date : detail.first_air_date),
    overview: detail.overview ?? '',
    genres: (detail.genres ?? []).map((g) => g.name),
    keywords,
    posterPath: detail.poster_path ?? null,
    backdropPath: detail.backdrop_path ?? null,
    runtimeMinutes: mediaType === 'movie' ? detail.runtime ?? null : null,
    episodeRuntimeMinutes: episodeRuntime,
    numberOfSeasons: detail.number_of_seasons ?? null,
    numberOfEpisodes: detail.number_of_episodes ?? null,
    status: detail.status ?? null,
    contentRating:
      mediaType === 'movie' ? movieCert(detail, region) : tvCert(detail, region),
    voteAverage: typeof detail.vote_average === 'number' && detail.vote_average > 0 ? detail.vote_average : null,
    voteCount: detail.vote_count ?? 0,
    popularity: typeof detail.popularity === 'number' ? detail.popularity : null,
    trailerUrl: pickTrailer(detail.videos),
    originalLanguage: detail.original_language ?? null,
    spokenLanguages: (detail.spoken_languages ?? []).map((l) => l.english_name ?? l.name ?? '').filter(Boolean),
    originCountries:
      mediaType === 'tv'
        ? detail.origin_country ?? []
        : (detail.production_countries ?? []).map((c) => c.iso_3166_1),
    imdbId: detail.external_ids?.imdb_id ?? detail.imdb_id ?? null,
    imdbRating: null,
    rottenTomatoes: null,
    metascore: null,
    episodesAired: mediaType === 'tv' ? detail.number_of_episodes ?? null : null,
    episodesTotal:
      mediaType === 'tv'
        ? detail.next_episode_to_air?.air_date
          ? null // still airing — total unknown
          : detail.number_of_episodes ?? null
        : null,
    nextEpisodeDate: mediaType === 'tv' ? detail.next_episode_to_air?.air_date ?? null : null,
    englishAvailability: computeEnglishAvailability(
      detail.original_language ?? null,
      (detail.spoken_languages ?? []).map((l) => l.english_name ?? l.name ?? '').filter(Boolean),
      (detail.translations?.translations ?? []).map((t) => t.iso_639_1),
    ),
  };
}

/** "More like this" — TMDB recommendations, falling back to similar titles. */
export async function getSimilar(mediaType: MediaType, id: number): Promise<SimilarTitle[]> {
  interface Row {
    id: number;
    title?: string;
    name?: string;
    release_date?: string;
    first_air_date?: string;
    poster_path?: string | null;
    vote_average?: number;
  }
  const map = (r: Row): SimilarTitle => ({
    id: r.id,
    mediaType,
    title: (mediaType === 'movie' ? r.title : r.name) ?? 'Untitled',
    year: yearFrom(mediaType === 'movie' ? r.release_date : r.first_air_date),
    posterPath: r.poster_path ?? null,
    voteAverage: typeof r.vote_average === 'number' && r.vote_average > 0 ? r.vote_average : null,
  });
  try {
    const rec = await tmdbFetch<{ results: Row[] }>(`/${mediaType}/${id}/recommendations`, {
      language: 'en-US',
      page: '1',
    });
    let rows = rec.results ?? [];
    if (rows.length < 4) {
      const sim = await tmdbFetch<{ results: Row[] }>(`/${mediaType}/${id}/similar`, {
        language: 'en-US',
        page: '1',
      });
      rows = [...rows, ...(sim.results ?? [])];
    }
    const seen = new Set<number>();
    return rows
      .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
      .map(map)
      .filter((r) => r.posterPath)
      .slice(0, 12);
  } catch {
    return [];
  }
}

/** Returns the belongs_to_collection id (franchise) for a movie, if any. */
export async function getCollectionId(mediaType: MediaType, id: number): Promise<number | null> {
  if (mediaType !== 'movie') return null;
  const detail = await tmdbFetch<TmdbDetail>(`/movie/${id}`, { language: 'en-US' });
  return detail.belongs_to_collection?.id ?? null;
}

// ---------------------------------------------------------------------------
// Credits, people & collections (the honest "Briefing")
// ---------------------------------------------------------------------------

export interface CastCredit {
  id: number;
  name: string;
  character: string | null;
  profilePath: string | null;
}

export interface TitleCredits {
  cast: CastCredit[];
  /** Movie directors (crew job === Director). */
  directors: Array<{ id: number; name: string }>;
  /** TV creators (created_by). */
  creators: Array<{ id: number; name: string }>;
}

interface TmdbCreditsDetail extends TmdbDetail {
  created_by?: Array<{ id: number; name: string }>;
  credits?: {
    cast?: Array<{ id: number; name: string; character?: string; profile_path?: string | null; order?: number }>;
    crew?: Array<{ id: number; name: string; job?: string; department?: string }>;
  };
}

/** Cast + directors/creators for a title (one TMDB call). */
export async function getCredits(mediaType: MediaType, id: number): Promise<TitleCredits> {
  const detail = await tmdbFetch<TmdbCreditsDetail>(`/${mediaType}/${id}`, {
    language: 'en-US',
    append_to_response: 'credits',
  });
  const cast = (detail.credits?.cast ?? [])
    .slice()
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .slice(0, 8)
    .map((c) => ({
      id: c.id,
      name: c.name,
      character: c.character && c.character.trim() !== '' ? c.character : null,
      profilePath: c.profile_path ?? null,
    }));
  const directors =
    mediaType === 'movie'
      ? (detail.credits?.crew ?? [])
          .filter((c) => c.job === 'Director')
          .map((c) => ({ id: c.id, name: c.name }))
      : [];
  const creators = (detail.created_by ?? []).map((c) => ({ id: c.id, name: c.name }));
  return { cast, directors, creators };
}

export interface NotableCredit {
  id: number;
  mediaType: MediaType;
  title: string;
  year: number | null;
  voteAverage: number | null;
}

interface TmdbPersonCredits {
  cast?: Array<PersonCreditRow>;
  crew?: Array<PersonCreditRow & { job?: string }>;
}
interface PersonCreditRow {
  id: number;
  media_type?: string;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  vote_count?: number;
  vote_average?: number;
  popularity?: number;
  poster_path?: string | null;
}

/**
 * A person's best-known other titles (by popularity/vote_count), excluding the
 * current one. `role` picks cast vs. directing work. One TMDB call.
 */
export async function getPersonNotable(
  personId: number,
  role: 'cast' | 'directing',
  excludeId: number,
  limit = 3,
): Promise<NotableCredit[]> {
  const data = await tmdbFetch<TmdbPersonCredits>(`/person/${personId}/combined_credits`, {
    language: 'en-US',
  }).catch(() => ({} as TmdbPersonCredits));

  const rows: PersonCreditRow[] =
    role === 'directing'
      ? (data.crew ?? []).filter((c) => (c as { job?: string }).job === 'Director')
      : data.cast ?? [];

  const seen = new Set<number>();
  return rows
    .filter((r) => {
      const mt = r.media_type;
      return (mt === 'movie' || mt === 'tv') && r.id !== excludeId && (r.poster_path ?? null) !== null;
    })
    .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
    .sort((a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0) || (b.popularity ?? 0) - (a.popularity ?? 0))
    .slice(0, limit)
    .map((r) => {
      const mt = r.media_type as MediaType;
      return {
        id: r.id,
        mediaType: mt,
        title: (mt === 'movie' ? r.title : r.name) ?? 'Untitled',
        year: yearFrom(mt === 'movie' ? r.release_date : r.first_air_date),
        voteAverage: typeof r.vote_average === 'number' && r.vote_average > 0 ? r.vote_average : null,
      };
    });
}

export interface FilmographyItem {
  id: number;
  title: string;
  year: number | null;
}

/** A director's notable feature films (vote_count-gated so it's actually closeable). */
export async function getDirectorFilmography(personId: number): Promise<FilmographyItem[]> {
  const data = await tmdbFetch<TmdbPersonCredits>(`/person/${personId}/movie_credits`, {
    language: 'en-US',
  }).catch(() => ({} as TmdbPersonCredits));
  const seen = new Set<number>();
  return (data.crew ?? [])
    .filter((c) => (c as { job?: string }).job === 'Director')
    .filter((r) => (r.vote_count ?? 0) >= 50 && (seen.has(r.id) ? false : (seen.add(r.id), true)))
    .sort((a, b) => (a.release_date ?? '').localeCompare(b.release_date ?? ''))
    .map((r) => ({ id: r.id, title: r.title ?? 'Untitled', year: yearFrom(r.release_date) }))
    .slice(0, 12);
}

export interface CollectionPart {
  id: number;
  title: string;
  year: number | null;
  posterPath: string | null;
}

export interface Collection {
  id: number;
  name: string;
  parts: CollectionPart[];
}

/** The films in a movie's franchise/collection, in release order (one call). */
export async function getCollection(collectionId: number): Promise<Collection | null> {
  interface Row {
    id: number;
    title?: string;
    name?: string;
    release_date?: string;
    poster_path?: string | null;
  }
  const data = await tmdbFetch<{ id: number; name?: string; parts?: Row[] }>(
    `/collection/${collectionId}`,
    { language: 'en-US' },
  ).catch(() => null);
  if (!data) return null;
  const parts: CollectionPart[] = (data.parts ?? [])
    .slice()
    .sort((a, b) => (a.release_date ?? '').localeCompare(b.release_date ?? ''))
    .map((r) => ({
      id: r.id,
      title: r.title ?? r.name ?? 'Untitled',
      year: yearFrom(r.release_date),
      posterPath: r.poster_path ?? null,
    }));
  return { id: data.id, name: data.name ?? 'Collection', parts };
}

// ---------------------------------------------------------------------------
// Watch providers
// ---------------------------------------------------------------------------

interface TmdbProvidersResponse {
  results: Record<
    string,
    {
      link?: string;
      flatrate?: Array<{ provider_id: number; provider_name: string; logo_path: string | null }>;
      free?: Array<{ provider_id: number; provider_name: string; logo_path: string | null }>;
      ads?: Array<{ provider_id: number; provider_name: string; logo_path: string | null }>;
      rent?: Array<{ provider_id: number; provider_name: string; logo_path: string | null }>;
      buy?: Array<{ provider_id: number; provider_name: string; logo_path: string | null }>;
    }
  >;
}

export async function getWatchProviders(
  mediaType: MediaType,
  id: number,
  region = 'US',
): Promise<WatchProviders> {
  const data = await tmdbFetch<TmdbProvidersResponse>(`/${mediaType}/${id}/watch/providers`);
  const regionData = data.results[region];
  if (!regionData) {
    return { region, link: null, options: [], available: false };
  }
  const options: WatchProvider[] = [];
  const push = (arr: typeof regionData.flatrate, type: WatchProvider['type']) => {
    for (const p of arr ?? []) {
      options.push({
        providerId: p.provider_id,
        providerName: p.provider_name,
        logoPath: p.logo_path ?? null,
        type,
      });
    }
  };
  push(regionData.flatrate, 'flatrate');
  push(regionData.free, 'free');
  push(regionData.ads, 'ads');
  push(regionData.rent, 'rent');
  push(regionData.buy, 'buy');

  return {
    region,
    link: regionData.link ?? null,
    options,
    available: options.length > 0,
  };
}

