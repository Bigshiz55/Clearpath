import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEasyPicks, type EasyAudience } from '@/lib/easyPicks';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const AUD = new Set<EasyAudience>(['me', 'partner', 'family']);

export async function POST(req: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

    let audience: EasyAudience = 'me';
    try {
      const body = (await req.json()) as { audience?: string };
      if (AUD.has(body.audience as EasyAudience)) audience = body.audience as EasyAudience;
    } catch {
      /* default */
    }
    const picks = await getEasyPicks(supabase, user.id, audience);
    return NextResponse.json({ picks });
  } catch {
    return NextResponse.json({ error: 'Could not get picks.' }, { status: 500 });
  }
}
