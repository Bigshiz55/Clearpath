import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeFinalistsFromPicks, type CourtPick, type CourtWishMember } from '@/lib/court';
import { COURT_SIZES } from '@/lib/court/pool';
import { asCourtSize } from '@/lib/court/roomSettings';
import { combineTonight, type MemberTonight } from '@/lib/court/tonight';

export const dynamic = 'force-dynamic';

const schema = z.object({
  code: z.string().min(4).max(64),
  hostToken: z.string().min(8).max(80),
  // Accepted for backward compatibility and then IGNORED. The court size lives
  // on the room, written only by the host through court_set_size, so two
  // devices can never disagree about how big the court is.
  size: z.enum(['quick', 'standard', 'deep']).optional(),
});

/** Coerce a stored `tonight` jsonb blob into a MemberTonight. */
function toTonight(raw: unknown): MemberTonight | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Record<string, unknown>;
  const kind = t.kind === 'movie' || t.kind === 'tv' || t.kind === 'any' ? t.kind : undefined;
  const time = t.time === 'u90' || t.time === 'u120' || t.time === 'any' ? t.time : undefined;
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined);
  return { kind, time, moods: strings(t.moods), avoid: strings(t.avoid) };
}

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

export async function POST(request: Request) {
  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    // `court_size` only exists once 0030 is applied. Retry without it rather
    // than refusing to start a court on the older schema.
    let room: Record<string, unknown> | null = null;
    const full = await admin
      .from('court_rooms')
      .select('id, host_token, status, media_type, court_size')
      .eq('code', body.code)
      .maybeSingle();
    let error = full.error;
    if (error && error.code !== '42P01') {
      const legacy = await admin
        .from('court_rooms')
        .select('id, host_token, status, media_type')
        .eq('code', body.code)
        .maybeSingle();
      if (!legacy.error) { room = legacy.data as Record<string, unknown> | null; error = null; }
    } else {
      room = full.data as Record<string, unknown> | null;
    }
    if (error) {
      if (error.code === '42P01') return NextResponse.json({ error: 'Live Court isn’t set up yet (run migration 0004).' }, { status: 501 });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!room) return NextResponse.json({ error: 'Room not found.' }, { status: 404 });
    if (room.host_token !== body.hostToken) return NextResponse.json({ error: 'Only the host can start.' }, { status: 403 });
    if (room.status !== 'lobby') return NextResponse.json({ error: 'Already started.' }, { status: 409 });

    // `tonight` only exists once 0026 is applied; select it separately so a
    // room on the older schema still starts instead of erroring.
    let people: Record<string, unknown>[] = [];
    const withTonight = await admin
      .from('court_participants')
      .select('name, mood, picks, tonight')
      .eq('room_id', room.id);
    if (withTonight.error) {
      const legacy = await admin.from('court_participants').select('name, mood, picks').eq('room_id', room.id);
      people = (legacy.data ?? []) as Record<string, unknown>[];
    } else {
      people = (withTonight.data ?? []) as Record<string, unknown>[];
    }
    const members: CourtWishMember[] = people.map((p) => ({
      name: p.name as string,
      mood: (p.mood as string) ?? 'any',
      picks: toPicks(p.picks),
      tonight: toTonight(p.tonight),
    }));
    // A SOLO HOST MAY BUILD AND PREVIEW. The two-juror minimum guards the
    // final Verd1ct (the reveal), not the shortlist — a host waiting for
    // friends should be looking at candidate titles, not a locked door.
    if (members.length < 1) return NextResponse.json({ error: 'Join the room first.' }, { status: 400 });
    // NOBODY has to nominate. With no picks at all, WatchVerd1ct builds the
    // whole shortlist from the group's DNA + tonight's preferences, so a room
    // can never get stuck because nobody wants to search.

    // The ROOM is the authority on size — never the caller's body. A stale or
    // hostile client cannot build a different court than the room agreed on.
    // Falls back to the body (then Standard) only when 0030 has not been applied.
    const spec = COURT_SIZES[asCourtSize(room.court_size ?? body.size)];

    // Everyone's tonight setup, combined: exclusions union, strictest runtime,
    // media type only when unanimous.
    const tonight = combineTonight(members.map((m) => ({ name: m.name, tonight: m.tonight })));
    const roomMediaType = (room.media_type as 'any' | 'movie' | 'tv') ?? 'any';
    const effectiveMediaType = roomMediaType !== 'any' ? roomMediaType : tonight.mediaType;

    const result = await computeFinalistsFromPicks(members, effectiveMediaType, [], 'US', spec.total, tonight);
    if (result.error || !result.finalists) return NextResponse.json({ error: result.error ?? 'Couldn’t build a shortlist — try broadening tonight’s preferences.' }, { status: 200 });

    const seenKeys = result.finalists.map((f) => `${f.mediaType}-${f.id}`);
    // → REACTING (stored as 'veto' for schema compatibility). The group reacts
    // to the shortlist together; the Verd1ct is revealed afterwards.
    const { error: upErr } = await admin
      .from('court_rooms')
      .update({ finalists: result.finalists, seen_keys: seenKeys, status: 'veto', updated_at: new Date().toISOString() })
      .eq('id', room.id);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to start.' }, { status: 500 });
  }
}
