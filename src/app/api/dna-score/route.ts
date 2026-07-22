import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserDimensionProfile } from '@/lib/titleDimensions';
import { dnaStrength } from '@/lib/scoring/dimensions';

export const dynamic = 'force-dynamic';

/** The user's current Taste-DNA strength (0..100) — grows as they rate / give
 *  feedback, so the Pass popover can show little improvements in real time. */
export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ score: 0 });

    const { count } = await supabase
      .from('watchlist_items')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .not('rating', 'is', null);

    const profile = await getUserDimensionProfile(supabase, user.id, count ?? 0);
    return NextResponse.json({ score: dnaStrength(profile) });
  } catch {
    return NextResponse.json({ score: 0 });
  }
}
