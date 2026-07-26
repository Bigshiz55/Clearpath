import { NextResponse } from 'next/server';
import { z } from 'zod';
import { searchTitles, TmdbError, tmdbImage } from '@/lib/tmdb/client';
import { GENRE_IDS } from '@/lib/finderGenres';

/**
 * Title lookup for the taste interview.
 *
 * Separate from `/api/search` because the interview needs two things that
 * endpoint does not return: a stable `titleId` in the form the reason graph
 * uses ("movie:603"), and genre slugs — the genres decide which "why" chips the
 * follow-up shows, so someone who names Sherlock is asked about deduction and
 * the cases rather than about spectacle.
 *
 * When TMDB is not configured this returns `available: false` and an empty
 * list. The interview then keeps the hand-typed title as an unconfirmed guess
 * that review must resolve — it never invents a match.
 */

export const dynamic = 'force-dynamic';

const schema = z.object({ q: z.string().min(1).max(120) });

/** TMDB genre id → the slug the lexicon speaks. */
const SLUG_BY_ID = new Map<number, string>();
for (const [name, id] of Object.entries(GENRE_IDS)) {
  if (!SLUG_BY_ID.has(id)) SLUG_BY_ID.set(id, name.replace(/\s+/g, '-'));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = schema.safeParse({ q: searchParams.get('q') ?? '' });
  if (!parsed.success) {
    return NextResponse.json({ available: true, results: [] });
  }

  try {
    const results = await searchTitles(parsed.data.q);
    return NextResponse.json({
      available: true,
      results: results.slice(0, 8).map((r) => ({
        titleId: `${r.mediaType}:${r.id}`,
        text: r.title,
        year: r.year,
        mediaType: r.mediaType,
        posterUrl: tmdbImage(r.posterPath, 'w185'),
        genres: (r.genreIds ?? [])
          .map((id) => SLUG_BY_ID.get(id))
          .filter((s): s is string => Boolean(s)),
      })),
    });
  } catch (e) {
    // Honest degradation: say search is off, do not fake a result set.
    const message =
      e instanceof TmdbError
        ? e.userMessage
        : 'Title search is unavailable right now — type the name and I will confirm it with you at the end.';
    return NextResponse.json({ available: false, results: [], message }, { status: 200 });
  }
}
