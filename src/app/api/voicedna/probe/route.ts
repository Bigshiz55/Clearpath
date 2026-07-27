import { NextResponse } from 'next/server';
import { z } from 'zod';
import { discoverByGenres, tmdbImage } from '@/lib/tmdb/client';
import { genreIdFromName } from '@/lib/finderGenres';

/**
 * Resolves the movie check to an actual title.
 *
 * The pure half — what to look for and why — is decided client-side from the
 * profile (`voicedna/probe.ts`). This only turns that into a real film.
 *
 * If nothing comes back, it returns `available: false` and the interview skips
 * the step. Showing a random poster and claiming it was chosen for the user
 * would be exactly the kind of thing this feature exists to stop.
 */

export const dynamic = 'force-dynamic';

const schema = z.object({
  genres: z.array(z.string().max(40)).max(6).default([]),
  exclude: z.array(z.string().max(40)).max(6).default([]),
  seen: z.array(z.string().max(64)).max(20).default([]),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ available: false, message: 'Bad request.' }, { status: 200 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ available: false }, { status: 200 });

  const wanted = parsed.data.genres
    .map((g) => genreIdFromName(g.replace(/-/g, ' ')))
    .filter((n): n is number => typeof n === 'number');
  const excluded = new Set(
    parsed.data.exclude
      .map((g) => genreIdFromName(g.replace(/-/g, ' ')))
      .filter((n): n is number => typeof n === 'number'),
  );
  if (wanted.length === 0) return NextResponse.json({ available: false }, { status: 200 });

  const seen = new Set(parsed.data.seen);

  try {
    const [movies, shows] = await Promise.all([
      discoverByGenres('movie', wanted).catch(() => []),
      discoverByGenres('tv', wanted).catch(() => []),
    ]);
    // Interleave so a card is not always a film.
    const pool = [...movies, ...shows]
      .map((r) => ({ ...r, titleId: `${r.mediaType}:${r.id}` }))
      .filter((r) => !seen.has(r.titleId) && r.posterPath);

    const pick = pool[0];
    if (!pick) return NextResponse.json({ available: false }, { status: 200 });

    return NextResponse.json({
      available: true,
      title: {
        titleId: pick.titleId,
        text: pick.title,
        year: pick.year,
        mediaType: pick.mediaType,
        posterUrl: tmdbImage(pick.posterPath, 'w342'),
        // `discoverByGenres` does not carry overviews; the card reads fine
        // without one and an invented premise is not an option.
        overview: '',
        genres: [],
      },
      excludedGenres: Array.from(excluded),
    });
  } catch {
    return NextResponse.json({ available: false }, { status: 200 });
  }
}
