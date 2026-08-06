import { NextResponse } from 'next/server';
import { searchPeople } from '@/lib/tmdb/client';
import { extractPersonName, misspellingCandidates } from '@/lib/nlu/queryRepair';
import { tmdbImage } from '@/lib/tmdb/image';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q') ?? '';
  try {
    // "who is Sylvester Stallone" and "Gary Sinise movies" are person
    // queries wearing a sentence; strip the phrasing before searching, and
    // fall back through the raw string and bounded typo corrections. Every
    // candidate is judged by the index itself — no guessing.
    const name = extractPersonName(q);
    let people = name ? await searchPeople(name).catch(() => []) : [];
    if (people.length === 0) people = await searchPeople(q);
    if (people.length === 0) {
      for (const c of misspellingCandidates(name ?? q, 4)) {
        people = await searchPeople(c).catch(() => []);
        if (people.length > 0) break;
      }
    }
    return NextResponse.json({
      people: people.map((p) => ({ id: p.id, name: p.name, knownFor: p.knownFor, profileUrl: tmdbImage(p.profilePath, 'w185') })),
    });
  } catch {
    return NextResponse.json({ people: [] });
  }
}
