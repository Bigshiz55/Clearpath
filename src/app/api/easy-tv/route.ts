import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getProfile, regionFor } from '@/lib/profile';
import { getUpcomingTv } from '@/lib/onTv';
import { getUpcomingTvIngested, INGESTED_MIN } from '@/lib/tv/ingestedGuide';

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

    // Canonical source first: the ingested national guide. If it yields too few
    // rows (or errors → []), fall back to the live TVmaze fetch so Easy Mode is
    // never blank.
    const now = Date.now();
    const ingested = await getUpcomingTvIngested(supabase, region, now).catch(() => [] as Awaited<ReturnType<typeof getUpcomingTv>>);
    const airings = ingested.length >= INGESTED_MIN ? ingested : await getUpcomingTv(region, now);

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
