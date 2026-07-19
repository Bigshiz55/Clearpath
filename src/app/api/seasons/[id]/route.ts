import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getProfile, regionFor } from '@/lib/profile';
import { getWatchmodeSeasons } from '@/lib/watchmode/client';

export const runtime = 'nodejs';

/**
 * Per-season streaming availability for a TV show (Watchmode episode-level),
 * in the signed-in user's region. Returns { seasons: [] } when there's no key,
 * no data, or the show isn't split — the UI just doesn't render the block.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ seasons: [] });

  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const region = regionFor(user ? await getProfile(supabase, user.id) : null);
    const seasons = (await getWatchmodeSeasons(id, region)) ?? [];
    return NextResponse.json({ seasons });
  } catch {
    return NextResponse.json({ seasons: [] });
  }
}
