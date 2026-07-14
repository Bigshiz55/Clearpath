import type { MediaType } from '@/lib/types';

/**
 * Determine how reachable a title is in English from TMDB signals. This is a
 * best-effort classification — TMDB does not track per-provider dub audio, so
 * "available" means an English version/track exists somewhere, not a guarantee
 * that a given streaming service offers an English dub.
 */
export function computeEnglishAvailability(
  originalLanguage: string | null,
  spokenLanguages: string[],
  translationLanguages: string[],
): 'native' | 'available' | 'subtitles' | 'unknown' {
  if (originalLanguage === 'en') return 'native';
  const spoken = spokenLanguages.map((l) => l.toLowerCase());
  const trans = translationLanguages.map((l) => l.toLowerCase());
  const hasEnglish = spoken.includes('english') || trans.includes('en');
  if (!originalLanguage && spoken.length === 0) return 'unknown';
  return hasEnglish ? 'available' : 'subtitles';
}

/** A search deep-link into Decider's "Stream It or Skip It" reviews. */
export function deciderSearchUrl(title: string, year: number | null): string {
  const q = year ? `${title} ${year}` : title;
  return `https://decider.com/?s=${encodeURIComponent(q)}`;
}

/** Human summary of TV episode progress. */
export function episodeSummary(
  mediaType: MediaType,
  aired: number | null,
  total: number | null,
  nextDate: string | null,
): string | null {
  if (mediaType !== 'tv' || aired == null) return null;
  if (total != null && total === aired) {
    return `${aired} of ${total} episodes released · complete`;
  }
  if (nextDate) {
    return `${aired} episode${aired === 1 ? '' : 's'} out · ongoing (next ${nextDate})`;
  }
  return `${aired} episode${aired === 1 ? '' : 's'} released`;
}
