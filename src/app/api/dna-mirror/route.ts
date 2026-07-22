import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserDimensionProfile } from '@/lib/titleDimensions';
import { getWatchStats } from '@/lib/watchStats';
import { tasteDials, dnaStrengthExact } from '@/lib/scoring/dimensions';
import { describePersonality } from '@/lib/scoring/personality';
import { getRecommendations, type Recommendation } from '@/lib/recommend';
import { tmdbImage } from '@/lib/tmdb/image';

export const dynamic = 'force-dynamic';

/**
 * The "DNA Mirror" payoff — reflects the user back to themselves right after they
 * build their taste: their watch personality, the axes they lean on, and a
 * handful of picks that visibly *follow* from it (each with its "because"). This
 * is the trust moment — the goal is a genuine "…that's me." Everything here is
 * already computed elsewhere; this endpoint just assembles it in one place.
 * Honest about thin profiles via `ready` so the UI never fakes confidence.
 */
function shapePick(r: Recommendation) {
  const because = r.because ? `Because you liked ${r.because}` : null;
  const reason = because && r.matchReason ? `${because} — ${r.matchReason}` : because ?? r.matchReason ?? null;
  return {
    id: r.id,
    mediaType: r.mediaType,
    title: r.title,
    year: r.year,
    posterUrl: tmdbImage(r.posterPath, 'w342'),
    personalScore: r.personalScore,
    tier: r.tier,
    reason,
  };
}

export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ready: false, samples: 0 });

    const stats = await getWatchStats(supabase, user.id);
    const profile = await getUserDimensionProfile(supabase, user.id, stats.rated);
    const persona = describePersonality(profile);
    const dials = tasteDials(profile, 6).map((d) => ({ key: d.dim.key, label: d.dim.label, lean: d.lean, tier: d.tier }));
    const recs = await getRecommendations(supabase, user.id, { limit: 8, seedLimit: 8, minScore: 30, perSeedCap: 3 });

    return NextResponse.json({
      // A real read needs at least a few titles behind it — otherwise the leans
      // are noise and we say so rather than pretending.
      ready: profile.samples >= 3,
      samples: profile.samples,
      strength: dnaStrengthExact(profile),
      persona,
      dials,
      picks: recs.map(shapePick),
    });
  } catch {
    return NextResponse.json({ ready: false, samples: 0 });
  }
}
