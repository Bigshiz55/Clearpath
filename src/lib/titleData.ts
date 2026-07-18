import 'server-only';
import { unstable_cache } from 'next/cache';
import type { MediaType, TitleMetadata, WatchProviders, SimilarTitle } from '@/lib/types';
import { getTitle, getWatchProviders, getCollectionId, getSimilar } from '@/lib/tmdb/client';
import { getCriticRatings } from '@/lib/omdb';
import { getMdbRatings } from '@/lib/mdblist';
import { getWatchmodeProviders, mergeWatchmode } from '@/lib/watchmode/client';
import { getBriefing, type Briefing } from '@/lib/briefing';

/** Availability = TMDB providers, with Watchmode's deep links + fresher sources
 *  merged in when WATCHMODE_API_KEY is set (dormant/no-op otherwise). */
async function resolveAvailability(mediaType: MediaType, id: number, region: string): Promise<WatchProviders | null> {
  const [tmdb, wm] = await Promise.all([
    getWatchProviders(mediaType, id, region).catch(() => null),
    getWatchmodeProviders(mediaType, id, region).catch(() => null),
  ]);
  return mergeWatchmode(tmdb, wm);
}

/** Adds the Rotten Tomatoes audience (Popcorn) score from MDBList, and backfills
 *  any critic value OMDb didn't return. No-op without MDBLIST_API_KEY. */
async function mergeMdbRatings(meta: TitleMetadata): Promise<void> {
  const mdb = await getMdbRatings(meta.id, meta.mediaType, meta.imdbId).catch(() => null);
  if (!mdb) return;
  if (mdb.rtAudience != null) meta.rtAudience = mdb.rtAudience;
  if (meta.rottenTomatoes == null && mdb.rtCritic != null) meta.rottenTomatoes = mdb.rtCritic;
  if (meta.imdbRating == null && mdb.imdb != null) meta.imdbRating = mdb.imdb;
  if (meta.metascore == null && mdb.metacritic != null) meta.metascore = mdb.metacritic;
  // Extra community/critic feeds — display-only, so always take what MDBList has.
  if (mdb.metacriticUser != null) meta.metacriticUser = mdb.metacriticUser;
  if (mdb.trakt != null) meta.trakt = mdb.trakt;
  if (mdb.letterboxd != null) meta.letterboxd = mdb.letterboxd;
  if (mdb.rogerEbert != null) meta.rogerEbert = mdb.rogerEbert;
}

export interface SharedTitleData {
  meta: TitleMetadata;
  providers: WatchProviders | null;
  collectionId: number | null;
  similar: SimilarTitle[];
  briefing: Briefing;
}

// 12h: metadata, ratings, availability and credits change slowly. Long enough to
// collapse thousands of views into one hydration; short enough to stay fresh.
const TTL_SECONDS = 60 * 60 * 12;

const EMPTY_BRIEFING: Briefing = { leads: [], cast: [], franchise: null };

async function hydrate(mediaType: MediaType, id: number, region: string): Promise<SharedTitleData> {
  const [meta, providers, collectionId, similar, briefing] = await Promise.all([
    getTitle(mediaType, id, region),
    resolveAvailability(mediaType, id, region),
    getCollectionId(mediaType, id).catch(() => null),
    getSimilar(mediaType, id).catch(() => []),
    getBriefing(mediaType, id).catch(() => EMPTY_BRIEFING),
  ]);
  // Critic aggregators depend on the imdbId we just fetched.
  const critics = await getCriticRatings(meta.imdbId).catch(() => null);
  if (critics) {
    meta.imdbRating = critics.imdbRating;
    meta.rottenTomatoes = critics.rottenTomatoes;
    meta.metascore = critics.metascore;
  }
  await mergeMdbRatings(meta);
  return { meta, providers, collectionId, similar, briefing };
}

/**
 * User-agnostic title data — TMDB metadata + critic ratings + streaming
 * availability + franchise + "more like this" + the Dossier — cached across ALL
 * users and requests for 12h. The per-user scoring layer runs on top of this
 * (cheap, pure, uncached), so one expensive hydration serves everyone who opens
 * a title instead of re-fanning-out on every view. This is the core scale lever:
 * OMDb/OpenAI-adjacent work and the ~10-call fan-out collapse to a single cached
 * unit per title. Throwing on a hard TMDB error still propagates (uncached).
 */
export function getSharedTitleData(
  mediaType: MediaType,
  id: number,
  region: string,
): Promise<SharedTitleData> {
  return unstable_cache(() => hydrate(mediaType, id, region), ['shared-title', mediaType, String(id), region], {
    revalidate: TTL_SECONDS,
    tags: [`title:${mediaType}:${id}`],
  })();
}

export interface ScoringData {
  meta: TitleMetadata;
  providers: WatchProviders | null;
}

async function hydrateScoring(mediaType: MediaType, id: number, region: string): Promise<ScoringData> {
  const [meta, providers] = await Promise.all([
    getTitle(mediaType, id, region),
    getWatchProviders(mediaType, id, region).catch(() => null),
  ]);
  const critics = await getCriticRatings(meta.imdbId).catch(() => null);
  if (critics) {
    meta.imdbRating = critics.imdbRating;
    meta.rottenTomatoes = critics.rottenTomatoes;
    meta.metascore = critics.metascore;
  }
  // Also pull the RT audience/Popcorn from MDBList here, so the card ratings
  // endpoint (/api/ratings) gets it too — not just the full title page.
  await mergeMdbRatings(meta);
  return { meta, providers };
}

/**
 * A lean, cached hydration for scoring many candidates (the Finder, recs) —
 * metadata + critic ratings + providers only, skipping the Dossier's expensive
 * person lookups. 12h shared cache like getSharedTitleData.
 */
export function getScoringData(mediaType: MediaType, id: number, region: string): Promise<ScoringData> {
  return unstable_cache(() => hydrateScoring(mediaType, id, region), ['scoring-data', mediaType, String(id), region], {
    revalidate: TTL_SECONDS,
    tags: [`title:${mediaType}:${id}`],
  })();
}
