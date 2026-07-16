import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getDetectivePicks } from '@/lib/detective';

export const dynamic = 'force-dynamic';
export const maxDuration = 45;

/** The TV Detective's 48-hour scan. */
export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const picks = await getDetectivePicks(supabase, user?.id ?? '');

    let remindedIds: number[] = [];
    if (user) {
      const { data } = await supabase.from('tv_reminders').select('airing_id').eq('user_id', user.id);
      remindedIds = (data ?? []).map((r) => r.airing_id as number);
    }

    return NextResponse.json({ picks, remindedIds });
  } catch {
    return NextResponse.json({ picks: [], remindedIds: [] });
  }
}
