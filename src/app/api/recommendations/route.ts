import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getRecommendations } from '@/lib/recommend';
import { tmdbImage } from '@/lib/tmdb/image';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
    }

    const recs = await getRecommendations(supabase, user.id);
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
      })),
    });
  } catch {
    return NextResponse.json(
      { error: 'Could not build recommendations right now.' },
      { status: 500 },
    );
  }
}
