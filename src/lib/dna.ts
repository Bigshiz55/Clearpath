import 'server-only';
import { unstable_cache } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MediaType, TitleMetadata } from '@/lib/types';
import { embed } from '@/lib/embeddings';
import { getScoringData } from '@/lib/titleData';
import { buildTasteDna, dnaScore, type TasteDna, type DnaResult } from '@/lib/scoring/dna';

/** The text we embed for a title's "vibe vector" — its meaning, not its tags. */
function vibeText(meta: TitleMetadata): string {
  return [
    `${meta.title}${meta.year ? ` (${meta.year})` : ''}`,
    meta.genres?.length ? meta.genres.join(', ') : '',
    meta.overview ?? '',
    meta.keywords?.length ? `Themes: ${meta.keywords.slice(0, 14).join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('. ');
}

async function computeTitleVector(mediaType: MediaType, id: number): Promise<number[] | null> {
  try {
    const { meta } = await getScoringData(mediaType, id, 'US');
    return await embed(vibeText(meta));
  } catch {
    return null;
  }
}

/** A title's vibe vector, cached 30 days (a title's meaning doesn't change). */
export function getTitleVector(mediaType: MediaType, id: number): Promise<number[] | null> {
  return unstable_cache(() => computeTitleVector(mediaType, id), ['dna-vec', mediaType, String(id)], {
    revalidate: 60 * 60 * 24 * 30,
    tags: [`dna:${mediaType}:${id}`],
  })();
}

async function computeTasteDna(rated: Array<{ media_type: MediaType; tmdb_id: number; rating: number }>): Promise<TasteDna> {
  const withVecs = await Promise.all(
    rated.map(async (r) => {
      const vector = await getTitleVector(r.media_type, r.tmdb_id);
      return vector ? { vector, rating: r.rating } : null;
    }),
  );
  return buildTasteDna(withVecs.filter((x): x is { vector: number[]; rating: number } => x != null));
}

const EMPTY_DNA: TasteDna = { liked: null, disliked: null, sampleSize: 0 };

/**
 * A user's Taste-DNA — built from the titles they've rated (strongest opinions
 * first, capped for cost). Cached per user + a signature that busts when they
 * rate more, so it refreshes as they use the app.
 */
export async function getUserTasteDna(supabase: SupabaseClient, userId: string): Promise<TasteDna> {
  if (!userId) return EMPTY_DNA;
  const { data } = await supabase
    .from('watchlist_items')
    .select('tmdb_id, media_type, rating')
    .eq('user_id', userId)
    .not('rating', 'is', null)
    .order('rating', { ascending: false })
    .limit(80);
  const rated = (data ?? [])
    .filter((r) => r.rating != null)
    .map((r) => ({ media_type: (r.media_type === 'tv' ? 'tv' : 'movie') as MediaType, tmdb_id: r.tmdb_id as number, rating: r.rating as number }));
  if (rated.length === 0) return EMPTY_DNA;
  const sig = String(rated.length);
  return unstable_cache(() => computeTasteDna(rated), ['dna-taste', userId, sig], {
    revalidate: 60 * 60 * 6,
  })();
}

export interface UserDnaResult extends DnaResult {
  available: boolean; // whether we had a title vibe vector (needs OPENAI key)
  sampleSize: number; // rated titles feeding the model
}

/** The DNA Score for one title, for one user. */
export async function getUserDnaForTitle(
  supabase: SupabaseClient,
  userId: string,
  mediaType: MediaType,
  id: number,
  objectiveScore: number,
): Promise<UserDnaResult> {
  const [titleVector, dna] = await Promise.all([getTitleVector(mediaType, id), getUserTasteDna(supabase, userId)]);
  const result = dnaScore(titleVector, dna, objectiveScore);
  return { ...result, available: titleVector != null, sampleSize: dna.sampleSize };
}
