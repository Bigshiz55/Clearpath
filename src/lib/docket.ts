import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCredits, getDirectorFilmography } from '@/lib/tmdb/client';

export interface Mission {
  id: string;
  icon: string;
  title: string;
  detail: string;
  progress: number;
  target: number;
  done: boolean;
}

export interface Docket {
  monthLabel: string;
  missions: Mission[];
  closed: number;
  total: number;
  allClosed: boolean;
}

interface WatchedRow {
  tmdb_id: number;
  media_type: 'movie' | 'tv';
  year: number | null;
  rating: number | null;
  watched_at: string | null;
  title: string;
}

const DECADES = [
  { start: 1970, label: 'the 1970s' },
  { start: 1980, label: 'the 1980s' },
  { start: 1990, label: 'the 1990s' },
  { start: 2000, label: 'the 2000s' },
];

/** Small stable string hash → non-negative int. */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * This month's Docket — a small set of viewing "cases" to close, generated
 * deterministically from the user's real data so it's stable within the month.
 * Progress is computed from actual watched items (and, for the director case,
 * real TMDB filmography), never fabricated.
 */
export async function getMonthlyDocket(
  supabase: SupabaseClient,
  userId: string,
  now: Date,
): Promise<Docket> {
  const monthLabel = now.toLocaleString('en-US', { month: 'long' });
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const seed = (now.getUTCFullYear() * 12 + now.getUTCMonth()) ^ hash(userId || 'anon');

  const { data } = await supabase
    .from('watchlist_items')
    .select('tmdb_id, media_type, year, rating, watched_at, title')
    .eq('user_id', userId)
    .eq('status', 'watched');
  const watched = (data as WatchedRow[] | null) ?? [];
  const watchedThisMonth = watched.filter((w) => w.watched_at && Date.parse(w.watched_at) >= monthStart);
  const watchedMovieIds = new Set(watched.filter((w) => w.media_type === 'movie').map((w) => w.tmdb_id));

  const missions: Mission[] = [];

  // 1) Volume — pure count of what you finish this month.
  {
    const target = 4;
    const progress = Math.min(watchedThisMonth.length, target);
    missions.push({
      id: 'volume',
      icon: '🎬',
      title: `Watch ${target} titles this month`,
      detail: 'Any movie or show you mark as watched counts.',
      progress,
      target,
      done: watchedThisMonth.length >= target,
    });
  }

  // 2) Era run — verifiable from the release year we already store.
  {
    const decade = DECADES[seed % DECADES.length]!;
    const target = 2;
    const inEra = watchedThisMonth.filter(
      (w) => w.media_type === 'movie' && w.year != null && w.year >= decade.start && w.year <= decade.start + 9,
    ).length;
    missions.push({
      id: 'era',
      icon: '🎞️',
      title: `Watch ${target} films from ${decade.label}`,
      detail: `Close the case on ${decade.label}. Progress counts films you finish this month.`,
      progress: Math.min(inEra, target),
      target,
      done: inEra >= target,
    });
  }

  // 3) Close out a director — the featured "deep cut" case (real filmography).
  const director = await pickDirectorMission(watched, watchedMovieIds).catch(() => null);
  if (director) {
    missions.push(director);
  } else {
    // Fallback: an "older classic" era case, always verifiable from stored year.
    const target = 1;
    const inEra = watchedThisMonth.filter((w) => w.media_type === 'movie' && w.year != null && w.year < 1980).length;
    missions.push({
      id: 'classic',
      icon: '🏛️',
      title: 'Watch a film made before 1980',
      detail: 'Dig into the classics — one pre-1980 film closes this case.',
      progress: Math.min(inEra, target),
      target,
      done: inEra >= target,
    });
  }

  const closed = missions.filter((m) => m.done).length;
  return { monthLabel, missions, closed, total: missions.length, allClosed: closed === missions.length && missions.length > 0 };
}

/** "Close out <Director>": seed from a highly-rated watched movie, real filmography. */
async function pickDirectorMission(watched: WatchedRow[], watchedMovieIds: Set<number>): Promise<Mission | null> {
  const seeds = watched
    .filter((w) => w.media_type === 'movie' && (w.rating ?? 0) >= 7)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, 4);
  for (const s of seeds) {
    const credits = await getCredits('movie', s.tmdb_id).catch(() => null);
    const dir = credits?.directors[0];
    if (!dir) continue;
    const films = await getDirectorFilmography(dir.id).catch(() => []);
    if (films.length < 3) continue; // not enough of a body of work to "close out"
    const seen = films.filter((f) => watchedMovieIds.has(f.id)).length;
    if (seen >= films.length) continue; // already complete — pick someone else
    return {
      id: `director-${dir.id}`,
      icon: '🎥',
      title: `Close out ${dir.name}`,
      detail: `You’ve seen ${seen} of ${films.length} of their notable films. Watch the rest to close the case.`,
      progress: seen,
      target: films.length,
      done: false,
    };
  }
  return null;
}
