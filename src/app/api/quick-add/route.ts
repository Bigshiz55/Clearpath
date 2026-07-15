import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveTitleFromText } from '@/lib/quickResolve';

export const dynamic = 'force-dynamic';

async function handle(token: string | null, q: string | null) {
  if (!token) return NextResponse.json({ ok: false, error: 'Missing key.' }, { status: 401 });
  if (!q || !q.trim()) return NextResponse.json({ ok: false, error: 'Nothing to add.' }, { status: 400 });

  const admin = createAdminClient();
  const { data: profile, error } = await admin
    .from('profiles')
    .select('id')
    .eq('quick_add_token', token)
    .maybeSingle();
  if (error) {
    if (error.code === '42P01' || /quick_add_token/.test(error.message)) {
      return NextResponse.json({ ok: false, error: 'Quick Add not set up (migration 0005).' }, { status: 501 });
    }
    return NextResponse.json({ ok: false, error: 'Lookup failed.' }, { status: 500 });
  }
  if (!profile) return NextResponse.json({ ok: false, error: 'Invalid key.' }, { status: 401 });
  const userId = profile.id as string;

  let m;
  try {
    m = await resolveTitleFromText(q);
  } catch {
    return NextResponse.json({ ok: false, error: 'Couldn’t reach the movie database.' }, { status: 502 });
  }
  if (!m) return NextResponse.json({ ok: false, error: 'Couldn’t find a matching title.' }, { status: 404 });

  // Default watchlist for this user.
  let watchlistId: string;
  const { data: wl } = await admin
    .from('watchlists')
    .select('id')
    .eq('user_id', userId)
    .eq('is_default', true)
    .maybeSingle();
  if (wl) watchlistId = wl.id as string;
  else {
    const { data: created, error: cErr } = await admin
      .from('watchlists')
      .insert({ user_id: userId, name: 'My Watchlist', is_default: true })
      .select('id')
      .single();
    if (cErr) return NextResponse.json({ ok: false, error: cErr.message }, { status: 500 });
    watchlistId = created!.id as string;
  }

  const { error: insErr } = await admin.from('watchlist_items').upsert(
    {
      watchlist_id: watchlistId,
      user_id: userId,
      tmdb_id: m.id,
      media_type: m.mediaType,
      title: m.title,
      year: m.year,
      poster_path: m.posterPath,
      status: 'possible',
    },
    { onConflict: 'watchlist_id,tmdb_id,media_type' },
  );
  if (insErr) return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, added: `${m.title}${m.year ? ` (${m.year})` : ''}` });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  return handle(searchParams.get('token'), searchParams.get('q'));
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  let bodyToken: string | null = null;
  let bodyQ: string | null = null;
  try {
    const body = (await request.json()) as { token?: string; q?: string };
    bodyToken = body.token ?? null;
    bodyQ = body.q ?? null;
  } catch {
    /* allow query-only */
  }
  return handle(searchParams.get('token') ?? bodyToken, searchParams.get('q') ?? bodyQ);
}
