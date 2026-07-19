import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getDetectivePicks, coerceHorizon } from '@/lib/detective';

export const dynamic = 'force-dynamic';
export const maxDuration = 45;

/** The TV Detective's scan over a chosen window (?hours=12|24|48, default 48). */
export async function GET(req: Request) {
  try {
    const hours = coerceHorizon(new URL(req.url).searchParams.get('hours'));
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const picks = await getDetectivePicks(supabase, user?.id ?? '', hours);

    let remindedIds: number[] = [];
    if (user) {
      const { data } = await supabase.from('tv_reminders').select('airing_id').eq('user_id', user.id);
      remindedIds = (data ?? []).map((r) => r.airing_id as number);
    }

    return NextResponse.json({ picks, remindedIds, hours });
  } catch {
    return NextResponse.json({ picks: [], remindedIds: [], hours: 48 });
  }
}
