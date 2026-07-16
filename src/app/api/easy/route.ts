import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEasyPicks, DEFAULT_PREFS, EASY_ERAS, EASY_CONTENT, type EasyPrefs, type EasyAudience, type EasyEra, type EasyContent } from '@/lib/easyPicks';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const AUD = new Set<EasyAudience>(['me', 'partner', 'family']);
const ERA = new Set<EasyEra>(EASY_ERAS);
const CONTENT = new Set<EasyContent>(EASY_CONTENT);

function coerce(raw: unknown): EasyPrefs {
  const b = (raw ?? {}) as Partial<EasyPrefs>;
  return {
    audience: AUD.has(b.audience as EasyAudience) ? (b.audience as EasyAudience) : 'me',
    mediaType: b.mediaType === 'movie' || b.mediaType === 'tv' ? b.mediaType : 'any',
    maxRuntime: typeof b.maxRuntime === 'number' ? b.maxRuntime : null,
    content: CONTENT.has(b.content as EasyContent) ? (b.content as EasyContent) : 'any',
    era: ERA.has(b.era as EasyEra) ? (b.era as EasyEra) : 'any',
    actorIds: Array.isArray(b.actorIds) ? b.actorIds.map(Number).filter((n) => Number.isFinite(n)).slice(0, 8) : [],
    moodGenres: Array.isArray(b.moodGenres) ? b.moodGenres.map(Number).filter((n) => Number.isFinite(n)).slice(0, 4) : [],
    excludeKeys: Array.isArray(b.excludeKeys) ? b.excludeKeys.map(String).slice(0, 100) : [],
  };
}

export async function POST(req: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

    let prefs: EasyPrefs = DEFAULT_PREFS;
    try {
      prefs = coerce(await req.json());
    } catch {
      /* defaults */
    }
    const picks = await getEasyPicks(supabase, user.id, prefs);
    return NextResponse.json({ picks });
  } catch {
    return NextResponse.json({ error: 'Could not get picks.' }, { status: 500 });
  }
}
