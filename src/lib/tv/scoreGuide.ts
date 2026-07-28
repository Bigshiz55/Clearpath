import 'server-only';
import { unstable_cache } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildVerdict } from '@/lib/scoring';
import { getPersonalContext } from '@/lib/profile';
import { getScoringData } from '@/lib/titleData';
import { searchTitles, type SearchResultItem } from '@/lib/tmdb/client';
import { applyScores, pickScoringCandidates, scoreKeyFor, SCORE_BUDGET } from '@/lib/tv/guideScoring';
import type { Airing } from '@/lib/onTv';
import type { MediaType } from '@/lib/types';

/**
 * PER-PROGRAMME SCORING FOR THE GUIDE — the I/O half.
 *
 * For a bounded set of the window's programmes (chosen by the pure candidate
 * picker: on-now first, one spend per title): resolve the listing to a TMDB
 * title, hydrate it through the SAME shared 12h cache every card uses, and run
 * the SAME deterministic engine, with this user's own preference rules. The
 * result is the personal match the rest of the app already means by "Your NN".
 *
 * COSTS, HONESTLY: the resolution is cached 7 days per distinct title and the
 * hydration 12 hours per title ACROSS USERS, so the cold-cache worst case is
 * one guide visit warming ~40 titles and every visit after that is nearly
 * free. `SCORE_BUDGET` caps the cold case; `CONCURRENCY` keeps the burst
 * polite.
 *
 * HONESTY: a listing is only scored when its title matches a TMDB result
 * EXACTLY (normalized), of the right media type, preferring the release year
 * when the grid supplied one — the same conservative rule the cable-movie
 * Save buttons use. No clean match → no score → the channel falls back to its
 * affinity rank. Every failure is a skip, never a guess.
 */
const CONCURRENCY = 8;

const normTitle = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function pickExact(results: SearchResultItem[], title: string, year: number | null, mediaType: MediaType): SearchResultItem | null {
  const nt = normTitle(title);
  const exact = results.filter((r) => r.mediaType === mediaType && normTitle(r.title) === nt);
  if (exact.length === 0) return null;
  const byPop = (a: SearchResultItem, b: SearchResultItem) => (b.popularity ?? 0) - (a.popularity ?? 0);
  if (year != null) {
    const near = exact.filter((m) => m.year != null && Math.abs(m.year - year) <= 1);
    if (near.length) return [...near].sort(byPop)[0]!;
  }
  return [...exact].sort(byPop)[0]!;
}

/** Cached listing→TMDB resolution (7d), keyed by title+year+type. */
function resolveGuideTitle(title: string, year: number | null, mediaType: MediaType): Promise<{ id: number; mediaType: MediaType } | null> {
  const key = `${mediaType}|${title.toLowerCase()}|${year ?? ''}`;
  return unstable_cache(
    async () => {
      const results = await searchTitles(title).catch(() => [] as SearchResultItem[]);
      const m = pickExact(results, title, year, mediaType);
      return m ? { id: m.id, mediaType: m.mediaType } : null;
    },
    ['guide-title', key],
    { revalidate: 60 * 60 * 24 * 7 },
  )();
}

/**
 * Score the guide's airings for one user. Returns the same list with `match`
 * (and the resolved TMDB identity) attached wherever a programme could be
 * scored honestly. Fail-open: any error anywhere returns the input untouched.
 */
export async function scoreGuideAirings(
  supabase: SupabaseClient,
  userId: string,
  airings: Airing[],
  nowMs: number,
  region: string,
  budget = SCORE_BUDGET,
): Promise<Airing[]> {
  if (airings.length === 0) return airings;
  try {
    const personal = await getPersonalContext(supabase, userId, null);
    const candidates = pickScoringCandidates(airings, nowMs, budget);
    const scores = new Map<string, { tmdbId: number; mediaType: 'movie' | 'tv'; match: number }>();

    // Bounded concurrency: a polite burst, not four hundred parallel fetches.
    let i = 0;
    async function worker() {
      while (i < candidates.length) {
        const a = candidates[i++]!;
        try {
          const wantType: MediaType = a.showType === 'Movie' ? 'movie' : 'tv';
          const resolved = await resolveGuideTitle(a.showName, a.year ?? null, wantType);
          if (!resolved) continue;
          const { meta, providers } = await getScoringData(resolved.mediaType, resolved.id, region);
          const report = buildVerdict({ meta, providers, personal: { ...personal, collectionId: null } });
          scores.set(scoreKeyFor(a), { tmdbId: resolved.id, mediaType: resolved.mediaType, match: report.personal.score });
        } catch {
          // One programme failing to score is a skip, never a broken guide.
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, candidates.length) }, worker));

    return scores.size > 0 ? applyScores(airings, scores) : airings;
  } catch {
    return airings;
  }
}
