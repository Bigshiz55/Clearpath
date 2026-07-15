import { NextResponse } from 'next/server';
import { z } from 'zod';
import { searchTitles, TmdbError, tmdbImage } from '@/lib/tmdb/client';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  q: z.string().min(1).max(120),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({ q: searchParams.get('q') ?? '' });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter something to search for.' }, { status: 400 });
  }

  try {
    const results = await searchTitles(parsed.data.q);
    return NextResponse.json({
      results: results.map((r) => ({
        id: r.id,
        mediaType: r.mediaType,
        title: r.title,
        year: r.year,
        overview: r.overview.slice(0, 220),
        posterPath: r.posterPath,
        posterUrl: tmdbImage(r.posterPath, 'w185'),
        voteAverage: r.voteAverage,
      })),
    });
  } catch (e) {
    if (e instanceof TmdbError) {
      return NextResponse.json({ error: e.userMessage }, { status: e.status });
    }
    return NextResponse.json({ error: 'Search failed. Please try again.' }, { status: 500 });
  }
}
