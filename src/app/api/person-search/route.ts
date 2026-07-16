import { NextResponse } from 'next/server';
import { searchPeople } from '@/lib/tmdb/client';
import { tmdbImage } from '@/lib/tmdb/image';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q') ?? '';
  try {
    const people = await searchPeople(q);
    return NextResponse.json({
      people: people.map((p) => ({ id: p.id, name: p.name, knownFor: p.knownFor, profileUrl: tmdbImage(p.profilePath, 'w185') })),
    });
  } catch {
    return NextResponse.json({ people: [] });
  }
}
