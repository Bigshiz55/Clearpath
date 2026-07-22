import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getRecommendations } from '@/lib/recommend';
import { tmdbImage } from '@/lib/tmdb/image';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
    }

    // `?full=1` — the Taste Quiz payoff: a big, broad DNA reveal (~60 titles,
    // more seeds, a lower fit floor, capped per seed for variety). Default stays
    // the tight hub list.
    const full = new URL(request.url).searchParams.get('full') === '1';
    const recs = await getRecommendations(
      supabase,
      user.id,
      full ? { limit: 60, seedLimit: 12, candidatePool: 72, minScore: 35, perSeedCap: 8 } : {},
    );
    return NextResponse.json({
      recommendations: recs.map((r) => ({
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
      })),
    });
  } catch {
    return NextResponse.json(
      { error: 'Could not build recommendations right now.' },
      { status: 500 },
    );
  }
}
