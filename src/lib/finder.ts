import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MediaType } from '@/lib/types';
import { discoverTitles } from '@/lib/tmdb/client';
import { getScoringData } from '@/lib/titleData';
import { buildVerdict } from '@/lib/scoring';
import { getProfile, getPersonalContext, regionFor, getMyServices, personalLabelFor } from '@/lib/profile';
import { includedServiceNames, streamingNames } from '@/lib/services';

export interface FinderQuery {
  mediaType: 'any' | 'movie' | 'tv';
  genreIds: number[];
  maxRuntime: number | null;
  sinceMonths: number | null;
  minAudience: number | null; // 0..100
  englishAudioOnly: boolean;
  onMyServices: boolean;
  minMatch: number | null; // 0..100
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
): Promise<FinderResult> {
  const profile = await getProfile(supabase, userId);
  const region = regionFor(profile);
  const scoredFor = profile ? personalLabelFor(profile) : 'Your match';
  const services = q.onMyServices ? await getMyServices(supabase, userId) : [];
  const basePersonal = await getPersonalContext(supabase, userId, null);

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
          minVotes: 80,
          sinceDays,
          maxRuntime: q.maxRuntime ?? undefined,
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
        // Runtime (movies).
        if (q.maxRuntime != null && meta.mediaType === 'movie') {
          if ((meta.runtimeMinutes ?? 9999) > q.maxRuntime) return null;
          const rt = fmtRuntime(meta.runtimeMinutes);
          if (rt) receipts.push(rt);
        }
        // Recency.
        if (q.sinceMonths != null && meta.year != null) {
          const cutoff = new Date().getUTCFullYear() - Math.ceil(q.sinceMonths / 12);
          if (meta.year < cutoff) return null;
        }
        if (meta.year != null) receipts.push(String(meta.year));
        // Audience.
        if (q.minAudience != null) {
          const aud = meta.voteAverage != null ? Math.round(meta.voteAverage * 10) : null;
          if (aud == null || aud < q.minAudience) return null;
          receipts.push(`${aud}% audience`);
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
    const r = await runFinder(supabase, userId, relaxedQ);
    items = r.items;
  }

  return { items: items.slice(0, 8), scoredFor, relaxed, total: items.length };
}
