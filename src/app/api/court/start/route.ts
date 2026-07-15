import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeFinalists } from '@/lib/court';

export const dynamic = 'force-dynamic';

const schema = z.object({ code: z.string().min(4).max(64), hostToken: z.string().min(8).max(80) });

export async function POST(request: Request) {
  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const { data: room, error } = await admin
      .from('court_rooms')
      .select('id, host_token, status, media_type')
      .eq('code', body.code)
      .maybeSingle();
    if (error) {
      if (error.code === '42P01') return NextResponse.json({ error: 'Live Court isn’t set up yet (run migration 0004).' }, { status: 501 });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!room) return NextResponse.json({ error: 'Room not found.' }, { status: 404 });
    if (room.host_token !== body.hostToken) return NextResponse.json({ error: 'Only the host can start.' }, { status: 403 });
    if (room.status !== 'lobby') return NextResponse.json({ error: 'Already started.' }, { status: 409 });

    const { data: people } = await admin
      .from('court_participants')
      .select('name, love, avoid, mood')
      .eq('room_id', room.id);
    const members = (people ?? []).map((p) => ({
      name: p.name as string,
      love: (p.love as string[]) ?? [],
      avoid: (p.avoid as string[]) ?? [],
      mood: (p.mood as string) ?? 'any',
    }));
    if (members.length < 2) return NextResponse.json({ error: 'Need at least 2 players.' }, { status: 400 });

    const result = await computeFinalists(members, (room.media_type as 'any' | 'movie' | 'tv') ?? 'any', [], [], 'US');
    if (result.error || !result.finalists) return NextResponse.json({ error: result.error ?? 'No finalists.' }, { status: 200 });

    const { error: upErr } = await admin
      .from('court_rooms')
      .update({ finalists: result.finalists, status: 'veto', updated_at: new Date().toISOString() })
      .eq('id', room.id);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to start.' }, { status: 500 });
  }
}
