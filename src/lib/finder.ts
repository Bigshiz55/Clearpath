import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MediaType } from '@/lib/types';
import type { PreferenceTrait } from '@/lib/types';
import { discoverTitles } from '@/lib/tmdb/client';
import { getScoringData } from '@/lib/titleData';
import { buildVerdict, avoidRule, loveRule } from '@/lib/scoring';
import { getProfile, getPersonalContext, regionFor, getMyServices, personalLabelFor } from '@/lib/profile';
import { includedServiceNames, streamingNames } from '@/lib/services';
import { deciderSearchUrl } from '@/lib/tmdb/meta-helpers';
import { tileRatingsFromScore, type TileRatings } from '@/lib/ratings';
import type { PersonalContext } from '@/lib/scoring/personal';
import type { TitleMetadata } from '@/lib/types';

const FAST_GENRES = ['action', 'thriller', 'adventure', 'crime', 'war', 'horror', 'science fiction'];
const SLOW_GENRES = ['drama', 'romance', 'history', 'documentary', 'mystery', 'music'];

/** Rough pace estimate (0 slow-burn .. 100 adrenaline) from genre + runtime. Heuristic, labeled as such in the UI. */
export function paceScore(meta: TitleMetadata): number {
  const g = meta.genres.map((x) => x.toLowerCase());
  let s = 50;
  for (const x of g) {
    if (FAST_GENRES.includes(x)) s += 14;
    if (SLOW_GENRES.includes(x)) s -= 12;
  }
  if (meta.mediaType === 'movie' && meta.runtimeMinutes) {
    if (meta.runtimeMinutes >= 150) s -= 10;
    else if (meta.runtimeMinutes <= 95) s += 8;
  }
  return Math.max(0, Math.min(100, Math.round(s)));
}

/** TV: is every episode of the current season out (no imminent next episode)? Movies are always "bingeable". */
function isBingeable(meta: TitleMetadata): boolean {
  if (meta.mediaType !== 'tv') return true;
  const status = (meta.status ?? '').toLowerCase();
  if (status.includes('ended') || status.includes('cancel')) return true;
  return !meta.nextEpisodeDate;
}

/** A specific person to score for (a crew member / guest), instead of "you". */
export interface Watcher {
  name: string;
  love: string[];
  avoid: string[];
}

export interface FinderQuery {
  mediaType: 'any' | 'movie' | 'tv';
  genreIds: number[];
  maxRuntime: number | null;
  sinceMonths: number | null;
  minAudience: number | null; // 0..100 — TMDB crowd score
  minImdb: number | null; // 0..10 — minimum IMDb rating
  englishAudioOnly: boolean;
  onMyServices: boolean;
  minMatch: number | null; // 0..100
  /** Only titles our verdict rules WATCH IT ("Stream It"). */
  streamItOnly: boolean;
  /** TV only: every episode of the latest season is out (bingeable now). */
  bingeableOnly: boolean;
  /** Desired pace 0 (slow burn) .. 100 (adrenaline); null = any. */
  pace: number | null;
  /** Bias candidates toward titles featuring these TMDB people (with_cast). */
  castIds?: number[];
  /** Only titles released no later than this year (for "classics"). */
  maxYear?: number | null;
}

export interface FinderItem {
  id: number;
  mediaType: MediaType;
  title: string;
  year: number | null;
  posterPath: string | null;
  matchScore: number;
  generalScore: number;
  primaryCall: string;
  reason: string;
  where: string | null;
  receipts: string[];
  deciderUrl: string;
  ratings: TileRatings;
}

export interface FinderResult {
  items: FinderItem[];
  scoredFor: string;
  /** Set when we had to relax a constraint to return anything. */
  relaxed: string | null;
  total: number;
}

const CANDIDATE_CAP = 16;

function fmtRuntime(min: number | null): string | null {
  if (!min) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * The Finder: turn a set of hard constraints into a ranked list of real titles,
 * each scored for the user and annotated with exactly which constraints it
 * satisfies. Unlike a chat that returns one vibe-matched guess, this honors the
 * filters and returns a set — and never invents anything.
 */
export async function runFinder(
  supabase: SupabaseClient,
  userId: string,
  q: FinderQuery,
  watcher?: Watcher | null,
): Promise<FinderResult> {
  const profile = await getProfile(supabase, userId);
  const region = regionFor(profile);
  const services = q.onMyServices ? await getMyServices(supabase, userId) : [];

  let basePersonal: PersonalContext;
  let scoredFor: string;
  if (watcher) {
    basePersonal = {
      label: `${watcher.name} match`,
      rules: [
        ...watcher.avoid.map((t) => avoidRule(t as PreferenceTrait)),
        ...watcher.love.map((t) => loveRule(t as PreferenceTrait)),
      ],
      likedFranchiseIds: [],
      collectionId: null,
    };
    scoredFor = `${watcher.name} match`;
  } else {
    basePersonal = await getPersonalContext(supabase, userId, null);
    scoredFor = profile ? personalLabelFor(profile) : 'Your match';
  }

  const types: MediaType[] = q.mediaType === 'any' ? ['movie', 'tv'] : [q.mediaType];
  const sinceDays = q.sinceMonths ? q.sinceMonths * 30 : undefined;
  const minRating = q.minAudience != null ? q.minAudience / 10 : undefined; // % → 0..10

  // Exclude what the user has already dealt with.
  const { data: wl } = await supabase
    .from('watchlist_items')
    .select('tmdb_id, media_type, status')
    .eq('user_id', userId);
  const seen = new Set(
    (wl ?? [])
      .filter((r) => r.status === 'watched' || r.status === 'dropped')
      .map((r) => `${r.media_type}-${r.tmdb_id}`),
  );

  // Pull candidates per type (two pages for depth).
  const pools = await Promise.all(
    types.flatMap((mt) =>
      [1, 2].map((page) =>
        discoverTitles(mt, {
          genreIds: q.genreIds,
          providerIds: q.onMyServices && services.length > 0 ? services : undefined,
          region,
          minRating,
          minVotes: q.castIds && q.castIds.length > 0 ? 20 : 80, // actor pools are smaller
          sinceDays,
          maxRuntime: q.maxRuntime ?? undefined,
          castIds: q.castIds,
          maxYear: q.maxYear ?? undefined,
          sortBy: 'popularity.desc',
          page,
        }),
      ),
    ),
  );
  const candMap = new Map<string, { id: number; mediaType: MediaType }>();
  for (const pool of pools) {
    for (const c of pool) {
      const key = `${c.mediaType}-${c.id}`;
      if (seen.has(key) || candMap.has(key)) continue;
      candMap.set(key, { id: c.id, mediaType: c.mediaType });
    }
  }
  const candidates = Array.from(candMap.values()).slice(0, CANDIDATE_CAP);

  // Hydrate + score + hard-filter each candidate.
  const scored = await Promise.all(
    candidates.map(async ({ id, mediaType }) => {
      try {
        const { meta, providers } = await getScoringData(mediaType, id, region);
        const report = buildVerdict({
          meta,
          providers,
          personal: { ...basePersonal, collectionId: null },
        });

        const receipts: string[] = [];
        // Runtime — movies by feature length, TV by per-episode length. For TV we
        // only filter when the episode runtime is actually known (never guess).
        if (q.maxRuntime != null && meta.mediaType === 'movie') {
          if ((meta.runtimeMinutes ?? 9999) > q.maxRuntime) return null;
          const rt = fmtRuntime(meta.runtimeMinutes);
          if (rt) receipts.push(rt);
        } else if (q.maxRuntime != null && meta.mediaType === 'tv') {
          const ep = meta.episodeRuntimeMinutes ?? 0;
          if (ep > 0 && ep > q.maxRuntime) return null;
          if (ep > 0) receipts.push(`${ep}m episodes`);
        }
        // Recency.
        if (q.sinceMonths != null && meta.year != null) {
          const cutoff = new Date().getUTCFullYear() - Math.ceil(q.sinceMonths / 12);
          if (meta.year < cutoff) return null;
        }
        // Era ceiling ("classics").
        if (q.maxYear != null && meta.year != null && meta.year > q.maxYear) return null;
        if (meta.year != null) receipts.push(String(meta.year));
        // Audience (TMDB crowd score).
        if (q.minAudience != null) {
          const aud = meta.voteAverage != null ? Math.round(meta.voteAverage * 10) : null;
          if (aud == null || aud < q.minAudience) return null;
          receipts.push(`${aud}% audience`);
        }
        // IMDb rating (from OMDb, when we have it).
        if (q.minImdb != null) {
          if (meta.imdbRating == null || meta.imdbRating < q.minImdb) return null;
          receipts.push(`IMDb ${meta.imdbRating.toFixed(1)}`);
        }
        // English audio.
        if (q.englishAudioOnly && !(meta.englishAvailability === 'native' || meta.englishAvailability === 'available')) {
          return null;
        }
        if (q.englishAudioOnly) receipts.push('English audio');
        // On my services.
        const included = providers ? includedServiceNames(providers.options, services) : [];
        if (q.onMyServices) {
          if (included.length === 0) return null;
          receipts.push(`on ${included[0]}`);
        }
        // Stream It only (our WATCH IT verdict).
        if (q.streamItOnly && report.primaryCall !== 'WATCH IT') return null;
        if (q.streamItOnly) receipts.push('Stream It');
        // Bingeable now (TV, all episodes of the current season out).
        if (q.bingeableOnly && meta.mediaType === 'tv') {
          if (!isBingeable(meta)) return null;
          receipts.push('all episodes out');
        }
        // Pace band.
        if (q.pace != null) {
          const p = paceScore(meta);
          if (Math.abs(p - q.pace) > 35) return null;
          receipts.push(p >= 66 ? 'fast-paced' : p <= 33 ? 'slow burn' : 'balanced pace');
        }
        // Match threshold.
        if (q.minMatch != null && report.personal.score < q.minMatch) return null;
        receipts.unshift(`${scoredFor.split(' ')[0]} ${report.personal.score}`);

        const where =
          included[0] ?? (providers ? streamingNames(providers.options)[0] ?? null : null);

        return {
          id,
          mediaType,
          title: meta.title,
          year: meta.year,
          posterPath: meta.posterPath,
          matchScore: report.personal.score,
          generalScore: report.general.score,
          primaryCall: report.primaryCall,
          reason: report.oneLiner,
          where,
          receipts,
          deciderUrl: deciderSearchUrl(meta.title, meta.year),
          ratings: tileRatingsFromScore(report.general),
        } as FinderItem;
      } catch {
        return null;
      }
    }),
  );

  let items = scored.filter((x): x is FinderItem => x !== null).sort((a, b) => b.matchScore - a.matchScore);
  let relaxed: string | null = null;

  // Honest fallback: if nothing hit every constraint, relax match, then services.
  if (items.length === 0 && (q.minMatch != null || q.onMyServices)) {
    const relaxedQ: FinderQuery = { ...q, minMatch: null, onMyServices: false };
    relaxed = q.onMyServices
      ? 'Nothing matched all of that on your services — here are the closest picks anywhere.'
      : 'Nothing cleared your match bar — here are the closest, honestly labeled.';
    const r = await runFinder(supabase, userId, relaxedQ, watcher);
    items = r.items;
  }

  return { items: items.slice(0, 8), scoredFor, relaxed, total: items.length };
}
