import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { runFinder, type FinderQuery } from '@/lib/finder';
import { EMPTY_QUERY } from '@/lib/finderParse';
import { getMyServices } from '@/lib/profile';
import { tmdbImage } from '@/lib/tmdb/image';
import { type EasyContent, type EasyEra, type EasyPick, type EasyPrefs } from '@/lib/easyTypes';

// Re-export the client-safe types/constants so existing server imports keep working.
export type { EasyAudience, EasyContent, EasyEra, EasyPick, EasyPrefs } from '@/lib/easyTypes';
export { EASY_ERAS, EASY_CONTENT, DEFAULT_PREFS } from '@/lib/easyTypes';

// Family genres only — Family + Animation + Adventure.
const FAMILY_GENRES = [10751, 16, 12];
const HORROR = 27;
const THRILLER = 53;
const WAR = 10752;

/** Year window for each era choice. */
function eraBounds(era: EasyEra): { minYear?: number; maxYear?: number } {
  switch (era) {
    case 'y2020s': return { minYear: 2020 };
    case 'y2000s': return { minYear: 2000, maxYear: 2019 };
    case 'y80s90s': return { minYear: 1980, maxYear: 1999 };
    case 'y60s70s': return { minYear: 1960, maxYear: 1979 };
    case 'ypre60': return { maxYear: 1959 };
    default: return {};
  }
}

/**
 * Three picks for tonight — customizable and taste-aware. Every preference maps
 * onto the same deterministic verdict engine (runFinder), so the picks stay
 * honest and explainable. Favorite actors bias the candidate pool; era and
 * length constrain it; the family/content-safe flag keeps it appropriate.
 */
export async function getEasyPicks(supabase: SupabaseClient, userId: string, prefs: EasyPrefs): Promise<EasyPick[]> {
  if (!userId) return [];
  const services = await getMyServices(supabase, userId);
  // Watching with the family forces the strictest content setting.
  const content: EasyContent = prefs.audience === 'family' ? 'family' : prefs.content;

  // Content: 'family' picks kid-safe genres; 'clean'/'mild' exclude harsh ones;
  // otherwise tonight's mood (from the quiz) leads.
  const genreIds = content === 'family' ? FAMILY_GENRES : prefs.moodGenres ?? [];
  const excludeGenreIds =
    content === 'clean' ? [HORROR, THRILLER, WAR] : content === 'mild' ? [HORROR] : [];
  const { minYear, maxYear } = eraBounds(prefs.era);

  const query: FinderQuery = {
    ...EMPTY_QUERY,
    mediaType: prefs.mediaType,
    genreIds,
    excludeGenreIds,
    maxRuntime: prefs.maxRuntime,
    minYear: minYear ?? null,
    maxYear: maxYear ?? null,
    onMyServices: services.length > 0,
    minMatch: null,
    castIds: prefs.actorIds.length > 0 ? prefs.actorIds : undefined,
  };

  const res = await runFinder(supabase, userId, query);
  const exclude = new Set(prefs.excludeKeys);

  return res.items
    .filter((i) => !exclude.has(`${i.mediaType}-${i.id}`))
    .slice(0, 3)
    .map((i) => ({
      id: i.id,
      mediaType: i.mediaType,
      title: i.title,
      year: i.year,
      posterUrl: tmdbImage(i.posterPath, 'w500'),
      primaryCall: i.primaryCall,
      matchScore: i.matchScore,
      reason: i.reason,
      where: i.where,
      // With actor filtering, movie candidates all contain a favorite (OR match).
      featuresFavorite: prefs.actorIds.length > 0 && i.mediaType === 'movie',
      ratings: i.ratings,
    }));
}
