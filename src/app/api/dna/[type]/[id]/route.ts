import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getScoringData } from '@/lib/titleData';
import { computeGeneralScore } from '@/lib/scoring/general';
import { getUserDnaForTitle } from '@/lib/dna';
import type { MediaType } from '@/lib/types';

export const runtime = 'nodejs';

/**
 * The WatchVrdikt DNA Score for the signed-in user on one title — a 0..100
 * "odds you'll love it" from their Taste-DNA. Returns { dna: null } for guests
 * or when embeddings are unavailable, so the UI falls back cleanly.
 */
export async function GET(req: Request, { params }: { params: { type: string; id: string } }) {
  const mediaType: MediaType = params.type === 'tv' ? 'tv' : 'movie';
  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ dna: null });

  // `?ai=1` turns on the bounded AI adjustment layer — reserved for the title
  // page (one call), not the many-card grids that fetch this per placard.
  const ai = new URL(req.url).searchParams.get('ai') === '1';

  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ dna: null });

    const { meta, providers } = await getScoringData(mediaType, id, 'US');
    const general = computeGeneralScore(meta, providers);
    const objective = general.standardScore ?? general.score;
    const dna = await getUserDnaForTitle(supabase, user.id, mediaType, id, objective, {
      ai,
      title: meta.title,
      year: meta.year,
      genres: meta.genres,
    });
    return NextResponse.json({ dna });
  } catch {
    return NextResponse.json({ dna: null });
  }
}
