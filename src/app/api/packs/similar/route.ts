import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveProgrammeTmdbId } from '@/lib/packs/dna';
import { getSimilar } from '@/lib/tmdb/client';

export const dynamic = 'force-dynamic';

/**
 * "More like this" for a Pack checklist item — on-demand only (never
 * prefetched for a whole checklist), so the cost is one TMDB resolution +
 * one recommendations call, and only when a visitor actually asks. Real
 * TMDB recommendations, not a curated plot match — framed that way in the UI.
 */
export async function GET(request: Request) {
  const programmeId = new URL(request.url).searchParams.get('programmeId') ?? '';
  if (!programmeId) return NextResponse.json({ results: [] });
  try {
    const supabase = createClient();
    const resolved = await resolveProgrammeTmdbId(supabase, programmeId);
    if (!resolved) return NextResponse.json({ results: [] });
    const similar = await getSimilar(resolved.mediaType, resolved.tmdbId);
    return NextResponse.json({
      results: similar.slice(0, 6).map((s) => ({
        id: s.id,
        mediaType: s.mediaType,
        title: s.title,
        year: s.year,
        posterPath: s.posterPath,
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Lookup failed.' }, { status: 500 });
  }
}
