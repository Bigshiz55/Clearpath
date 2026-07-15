import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getActiveJudge } from '@/lib/sponsors';
import { getProfile, regionFor } from '@/lib/profile';

export const dynamic = 'force-dynamic';

/** Resolve the presiding judge for a location (used when the user shares GPS). */
export async function POST(req: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ judge: null });

    let body: { lat?: number; lng?: number } = {};
    try {
      body = await req.json();
    } catch {
      /* empty */
    }
    const lat = typeof body.lat === 'number' && Math.abs(body.lat) <= 90 ? body.lat : undefined;
    const lng = typeof body.lng === 'number' && Math.abs(body.lng) <= 180 ? body.lng : undefined;

    const profile = await getProfile(supabase, user.id).catch(() => null);
    const judge = await getActiveJudge(supabase, { region: regionFor(profile), lat, lng, nowMs: Date.now() });
    return NextResponse.json({ judge });
  } catch {
    return NextResponse.json({ judge: null });
  }
}
