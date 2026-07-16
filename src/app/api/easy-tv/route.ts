import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getProfile, regionFor } from '@/lib/profile';
import { getUpcomingTv } from '@/lib/onTv';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Upcoming notable TV airings for Easy Mode — today + the next couple days. */
export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const region = regionFor(user ? await getProfile(supabase, user.id) : null);

    const airings = await getUpcomingTv(region, Date.now(), 3);

    // Which the user already has a reminder for (guarded pre-migration).
    let remindedIds: number[] = [];
    if (user) {
      const { data } = await supabase.from('tv_reminders').select('airing_id').eq('user_id', user.id);
      remindedIds = (data ?? []).map((r) => r.airing_id as number);
    }

    return NextResponse.json({
      region,
      remindedIds,
      airings: airings.slice(0, 15).map((a) => ({
        id: a.id,
        showName: a.showName,
        network: a.network,
        airstamp: a.airstamp,
        rating: a.rating,
        image: a.image,
        showType: a.showType,
        episodeName: a.episodeName,
      })),
    });
  } catch {
    return NextResponse.json({ airings: [], remindedIds: [], region: 'US' });
  }
}
