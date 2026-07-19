import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeFinalistsFromPicks, type CourtPick, type CourtWishMember, type RankedFinalist } from '@/lib/court';

export const dynamic = 'force-dynamic';

const schema = z.object({
  code: z.string().min(4).max(64),
  action: z.enum(['veto', 'more']),
  index: z.number().int().min(0).max(2).optional(),
  hostToken: z.string().min(8).max(80).optional(),
  participantId: z.string().uuid().optional(),
});

/** Coerce a stored `picks` jsonb blob into clean CourtPick[]. */
function toPicks(raw: unknown): CourtPick[] {
  if (!Array.isArray(raw)) return [];
  const out: CourtPick[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const p = r as Record<string, unknown>;
    const id = Number(p.id);
    const mt = p.mediaType;
    if (!Number.isFinite(id) || (mt !== 'movie' && mt !== 'tv')) continue;
    out.push({
      id,
      mediaType: mt,
      title: typeof p.title === 'string' ? p.title : 'Untitled',
      year: typeof p.year === 'number' ? p.year : null,
      posterPath: typeof p.posterPath === 'string' ? p.posterPath : null,
    });
  }
  return out;
}

const keyOf = (f: RankedFinalist) => `${f.mediaType}-${f.id}`;

/**
 * Re-rule an in-progress Court. "veto" drops one finalist and pulls in the
 * next-best replacement; "more" swaps all three for the next-best trio. The
 * room's `seen_keys` ledger guarantees nothing already shown comes back.
 * Any player in the room (or the host) can trigger it — one tap.
 */
export async function POST(request: Request) {
  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }
  if (body.action === 'veto' && body.index === undefined) {
    return NextResponse.json({ error: 'Which one?' }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const { data: room, error } = await admin
      .from('court_rooms')
      .select('id, host_token, status, media_type, finalists, seen_keys')
      .eq('code', body.code)
      .maybeSingle();
    if (error) {
      if (error.code === '42P01') return NextResponse.json({ error: 'Live Court isn’t set up yet (run migration 0004/0005).' }, { status: 501 });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!room) return NextResponse.json({ error: 'Room not found.' }, { status: 404 });
    if (room.status !== 'verdict') return NextResponse.json({ error: 'Court isn’t in session.' }, { status: 409 });

    // Authorize: the host, or any participant that belongs to this room.
    const isHost = !!body.hostToken && room.host_token === body.hostToken;
    let ok = isHost;
    if (!ok && body.participantId) {
      const { data: part } = await admin
        .from('court_participants')
        .select('id')
        .eq('id', body.participantId)
        .eq('room_id', room.id)
        .maybeSingle();
      ok = !!part;
    }
    if (!ok) return NextResponse.json({ error: 'Join the room to change the ruling.' }, { status: 403 });

    const current = (room.finalists as RankedFinalist[] | null) ?? [];
    const seen = new Set<string>((room.seen_keys as string[] | null) ?? current.map(keyOf));

    const { data: people } = await admin
      .from('court_participants')
      .select('name, mood, picks')
      .eq('room_id', room.id);
    const members: CourtWishMember[] = (people ?? []).map((p) => ({
      name: p.name as string,
      mood: (p.mood as string) ?? 'any',
      picks: toPicks(p.picks),
    }));

    const mt = (room.media_type as 'any' | 'movie' | 'tv') ?? 'any';

    let finalists: RankedFinalist[];
    if (body.action === 'more') {
      const result = await computeFinalistsFromPicks(members, mt, [...seen], 'US');
      if (result.error || !result.finalists?.length) {
        return NextResponse.json({ error: result.error ?? 'Nothing new to show.' }, { status: 200 });
      }
      finalists = result.finalists;
    } else {
      // Veto one: keep the other two, find the single best replacement.
      const kept = current.filter((_, i) => i !== body.index);
      const result = await computeFinalistsFromPicks(members, mt, [...seen], 'US');
      const replacement = result.finalists?.[0];
      if (!replacement) {
        return NextResponse.json({ error: result.error ?? 'No fresh title to swap in.' }, { status: 200 });
      }
      finalists = [...kept, replacement].sort((a, b) => b.fit - a.fit || b.avgScore - a.avgScore);
    }

    // Re-number ranks and record every shown title so it never recurs.
    finalists = finalists.slice(0, 3).map((f, i) => ({ ...f, rank: i + 1 }));
    for (const f of finalists) seen.add(keyOf(f));

    const { error: upErr } = await admin
      .from('court_rooms')
      .update({ finalists, seen_keys: [...seen], updated_at: new Date().toISOString() })
      .eq('id', room.id);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to re-rule.' }, { status: 500 });
  }
}
