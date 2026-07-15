import 'server-only';
import type { MediaType } from '@/lib/types';
import {
  getCredits,
  getPersonNotable,
  getCollectionId,
  getCollection,
  type NotableCredit,
  type CollectionPart,
} from '@/lib/tmdb/client';

export interface BriefingPerson {
  id: number;
  name: string;
  /** "Director", "Creator", or the character they play. */
  role: string;
  profilePath: string | null;
  /** Their best-known other titles (real TMDB credits). */
  notableFor: NotableCredit[];
}

export interface Briefing {
  /** Director(s) / creator(s), each with a couple of their notable other titles. */
  leads: BriefingPerson[];
  /** Top-billed cast (name + character), with notable roles for the first few. */
  cast: BriefingPerson[];
  franchise: { id: number; name: string; parts: CollectionPart[] } | null;
}

const EMPTY: Briefing = { leads: [], cast: [], franchise: null };

/**
 * An honest per-title briefing built entirely from real TMDB data: who made it,
 * who's in it, what else those people are known for, and the franchise it
 * belongs to. Never fabricates — missing pieces are simply omitted. Bounded to a
 * handful of extra API calls (cached at the fetch layer).
 */
export async function getBriefing(mediaType: MediaType, id: number): Promise<Briefing> {
  const [credits, collectionId] = await Promise.all([
    getCredits(mediaType, id).catch(() => null),
    getCollectionId(mediaType, id).catch(() => null),
  ]);
  if (!credits) return EMPTY;

  // Notable other work: for up to two leads and the top three cast members.
  const leadPeople = [
    ...credits.directors.map((d) => ({ ...d, role: 'Director' as const })),
    ...credits.creators.map((c) => ({ ...c, role: 'Creator' as const })),
  ].slice(0, 2);
  const topCast = credits.cast.slice(0, 6);
  const castWithNotable = topCast.slice(0, 3);

  const [leadNotable, castNotable, franchise] = await Promise.all([
    Promise.all(
      leadPeople.map((p) =>
        getPersonNotable(p.id, 'directing', id, 3).catch(() => [] as NotableCredit[]),
      ),
    ),
    Promise.all(
      castWithNotable.map((p) => getPersonNotable(p.id, 'cast', id, 3).catch(() => [] as NotableCredit[])),
    ),
    collectionId ? getCollection(collectionId).catch(() => null) : Promise.resolve(null),
  ]);

  const leads: BriefingPerson[] = leadPeople.map((p, i) => ({
    id: p.id,
    name: p.name,
    role: p.role,
    profilePath: null,
    notableFor: leadNotable[i] ?? [],
  }));

  const cast: BriefingPerson[] = topCast.map((c, i) => ({
    id: c.id,
    name: c.name,
    role: c.character ?? 'Cast',
    profilePath: c.profilePath,
    notableFor: i < castNotable.length ? castNotable[i]! : [],
  }));

  return {
    leads,
    cast,
    franchise: franchise && franchise.parts.length > 1 ? franchise : null,
  };
}
