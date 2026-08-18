import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getScoringData } from '@/lib/titleData';
import { computeGeneralScore } from '@/lib/scoring/general';
import { getUserDnaForTitle, dimensionFitFor } from '@/lib/dna';
import { getPersonalContext } from '@/lib/profile';
import { computePersonalMatch } from '@/lib/scoring/personal';
import { canonicalScore } from '@/lib/scoring/canonical';
import type { MediaType } from '@/lib/types';

export const runtime = 'nodejs';

/**
 * The WatchVerd1ct DNA Score for the signed-in user on one title — a 0..100
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
    // The agree/clash axes for the card's "why it fits you" line, from the
    // SAME request the card already makes — a second endpoint would mean a
    // second fetch per placard. Best-effort and cache-only: a title we have
    // not fingerprinted yet gets no fit, and the UI says so rather than
    // inventing one.
    const fit = await dimensionFitFor(supabase, user.id, mediaType, id, dna.sampleSize).catch(() => null);

    // THE CANONICAL HEADLINE, from the one contract every surface reads.
    //
    // `dna.score` is the TASTE view of this title and stays exactly what it
    // was — the DNA panel, the fit axes and the progress meter all still mean
    // it. What it is NOT is the headline number, because the briefing and the
    // title page compute theirs from the Standard Score plus this user's
    // explicit deterministic rules, and a card that showed the taste blend
    // instead was the other half of "Your Verdict 79" vs "83 · STREAM IT".
    //
    // Taste is deliberately not folded into the headline here: resolving it
    // costs a per-title embedding, which the briefing's bulk path may never
    // spend, so a headline that included it would be a number one surface
    // could produce and another could not. The deterministic contract is the
    // one every surface can honour identically.
    const personal = await getPersonalContext(supabase, user.id, null).catch(() => null);
    const match = personal ? computePersonalMatch(meta, objective, personal) : null;
    const canonical = canonicalScore({ objective, adjustments: match?.adjustments ?? [] });

    return NextResponse.json({ dna: { ...dna, fit, canonical } });
  } catch {
    return NextResponse.json({ dna: null });
  }
}
