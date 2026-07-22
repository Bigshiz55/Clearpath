import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getRecommendations, type Recommendation } from '@/lib/recommend';
import { parseRecFeedback, describeFilters, NO_FILTERS } from '@/lib/recFeedback';
import { tmdbImage } from '@/lib/tmdb/image';

export const dynamic = 'force-dynamic';

// The big "quiz payoff" build — more seeds, a lower fit floor, capped per seed.
const FULL_OPTS = { limit: 60, seedLimit: 12, candidatePool: 72, minScore: 35, perSeedCap: 8 } as const;

function shape(recs: Recommendation[]) {
  return recs.map((r) => ({
    id: r.id,
    mediaType: r.mediaType,
    title: r.title,
    year: r.year,
    posterPath: r.posterPath,
    posterUrl: tmdbImage(r.posterPath, 'w342'),
    personalScore: r.personalScore,
    tier: r.tier,
    primaryCall: r.primaryCall,
    because: r.because,
    matchReason: r.matchReason,
    ratings: r.ratings,
  }));
}

export async function GET(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
    }

    // `?full=1` — the Taste Quiz payoff: a big, broad DNA reveal (~60 titles).
    // Default stays the tight hub list.
    const full = new URL(request.url).searchParams.get('full') === '1';
    const recs = await getRecommendations(supabase, user.id, full ? FULL_OPTS : {});
    // Cold start = we have picks but none are seeded from something you rated
    // (no "because you liked …"). Let the UI say so honestly instead of faking
    // a personalized read.
    const cold = recs.length > 0 && recs.every((r) => !r.because);
    return NextResponse.json({ recommendations: shape(recs), cold });
  } catch {
    return NextResponse.json({ error: 'Could not build recommendations right now.' }, { status: 500 });
  }
}

/**
 * Recalculate the big reveal from plain-English feedback ("too many old movies,
 * no westerns"). Parses the note into real filters (genre / recency / type /
 * length), reruns the recommender, and echoes back what it changed.
 */
export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as { feedback?: unknown };
    const feedback = typeof body.feedback === 'string' ? body.feedback.slice(0, 400) : '';
    const filters = feedback.trim() ? await parseRecFeedback(feedback) : NO_FILTERS;

    const recs = await getRecommendations(supabase, user.id, { ...FULL_OPTS, filters });
    return NextResponse.json({ recommendations: shape(recs), note: describeFilters(filters) });
  } catch {
    return NextResponse.json({ error: 'Could not recalculate right now.' }, { status: 500 });
  }
}
