import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MediaType } from '@/lib/types';
import { getPerson } from '@/lib/tmdb/client';
import { getScoringData } from '@/lib/titleData';
import { buildVerdict } from '@/lib/scoring';
import { getProfile, getPersonalContext, regionFor } from '@/lib/profile';
import { tileRatingsFromScore, type TileRatings } from '@/lib/ratings';
import { tmdbImage } from '@/lib/tmdb/image';

export interface PersonWork {
  id: number;
  mediaType: MediaType;
  title: string;
  year: number | null;
  posterPath: string | null;
  posterUrl: string | null;
  role: string; // "Director" or the character / "Cast"
  matchScore: number;
  primaryCall: string;
  ratings: TileRatings;
}

export interface PersonView {
  id: number;
  name: string;
  profileUrl: string | null;
  department: string | null;
  biography: string | null;
  actedCount: number;
  directedCount: number;
  works: PersonWork[]; // best-for-you first
}

const TOP_TO_SCORE = 18;

/**
 * A person page, scored for the user: their most-notable filmography run through
 * the deterministic verdict engine, best-for-you first. Real TMDB credits only;
 * null when the person is unknown.
 */
export async function getPersonForUser(
  supabase: SupabaseClient,
  userId: string,
  id: number,
): Promise<PersonView | null> {
  const person = await getPerson(id).catch(() => null);
  if (!person) return null;

  const profile = userId ? await getProfile(supabase, userId) : null;
  const region = regionFor(profile);
  const personal = userId ? await getPersonalContext(supabase, userId, null) : null;

  // Score the most-recognized credits (a vote floor keeps out fan-edit noise).
  const top = person.credits.filter((c) => c.voteCount >= 20).slice(0, TOP_TO_SCORE);
  const scored = await Promise.all(
    top.map(async (c) => {
      try {
        const { meta, providers } = await getScoringData(c.mediaType, c.id, region);
        const report = buildVerdict({
          meta,
          providers,
          personal: personal ? { ...personal, collectionId: null } : { label: 'Your match', rules: [], likedFranchiseIds: [], collectionId: null },
        });
        return {
          id: c.id,
          mediaType: c.mediaType,
          title: meta.title,
          year: meta.year,
          posterPath: meta.posterPath,
          posterUrl: tmdbImage(meta.posterPath, 'w342'),
          role: c.asDirector ? 'Director' : c.character ?? 'Cast',
          matchScore: report.personal.score,
          primaryCall: report.primaryCall,
          ratings: tileRatingsFromScore(report.general),
        } as PersonWork;
      } catch {
        return null;
      }
    }),
  );

  const works = scored.filter((x): x is PersonWork => x !== null).sort((a, b) => b.matchScore - a.matchScore);

  return {
    id: person.id,
    name: person.name,
    profileUrl: tmdbImage(person.profilePath, 'w342'),
    department: person.department,
    biography: person.biography,
    actedCount: person.credits.filter((c) => !c.asDirector).length,
    directedCount: person.credits.filter((c) => c.asDirector).length,
    works,
  };
}
