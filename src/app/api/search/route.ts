import { NextResponse } from 'next/server';
import { z } from 'zod';
import { searchTitles, searchPeople, TmdbError, tmdbImage } from '@/lib/tmdb/client';
import { splitTitleYear, misspellingCandidates, extractPersonName } from '@/lib/nlu/queryRepair';
import { isExactTitle } from '@/lib/nlu/titleNormalize';

/**
 * Find results for what the user MEANT, not only what they typed.
 *
 * The audit's largest failure clusters all came from this endpoint passing the
 * raw string to TMDB verbatim: "Creed 2015" → 0 results, "Roocky" → 0 results,
 * "It 2017" → junk. The repairs are tried in a strict order and the catalog
 * itself is the judge — a candidate only wins by actually returning titles, so
 * a legitimate query can never be corrected into something that doesn't exist.
 *
 *   1. The raw query, exactly as before. A hit here changes nothing.
 *   2. A year beside a title is a DISAMBIGUATOR: search the bare title and
 *      prefer candidates from that year.
 *   3. Zero results → bounded misspelling candidates, tried concurrently,
 *      first (most-likely) hit wins.
 */
async function searchWithRepair(raw: string): Promise<{
  results: Awaited<ReturnType<typeof searchTitles>>;
  correctedTo: string | null;
  year: number | null;
}> {
  const { title: bare, year } = splitTitleYear(raw);

  // A stated year means BOTH searches run: the literal string can return junk
  // that merely contains the digits ("It 2017" → "Security"), and junk being
  // non-empty must not stop the real candidates from being found. The bare
  // title wins whenever it produces an exact match for the name that was
  // actually typed; the raw results remain the fallback so a title that
  // genuinely contains a year ("Blade Runner 2049" typed in full… still exact
  // via the raw search) is never lost.
  const [rawResults, bareResults] = await Promise.all([
    searchTitles(raw),
    year != null && bare !== raw ? searchTitles(bare).catch(() => []) : Promise.resolve([]),
  ]);
  if (year != null && bareResults.length > 0) {
    const exactForBare = bareResults.some((r) => isExactTitle(bare, r.title));
    const rawIsBetter = rawResults.some((r) => isExactTitle(raw, r.title));
    if (exactForBare && !rawIsBetter) {
      const sameYear = bareResults.filter((r) => r.year === year);
      return {
        results: sameYear.length > 0 ? [...sameYear, ...bareResults.filter((r) => r.year !== year)] : bareResults,
        correctedTo: bare,
        year,
      };
    }
  }
  if (rawResults.length > 0) return { results: rawResults, correctedTo: null, year };
  if (bareResults.length > 0) return { results: bareResults, correctedTo: bare, year };

  // Zero results anywhere: try bounded corrections, most-likely first.
  const candidates = misspellingCandidates(bare || raw);
  if (candidates.length > 0) {
    const settled = await Promise.all(candidates.map((c) => searchTitles(c).catch(() => [])));
    for (let i = 0; i < candidates.length; i++) {
      if (settled[i]!.length > 0) return { results: settled[i]!, correctedTo: candidates[i]!, year };
    }
  }
  return { results: [], correctedTo: null, year };
}

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
    // Role phrasing ("Gary Sinise movies", "who is …") searched the person
    // index for the whole sentence and found nobody. The stripped name is
    // tried FIRST and the raw string only as the fallback, so bare-name
    // behaviour is byte-identical to before.
    const personName = extractPersonName(parsed.data.q);
    const [{ results, correctedTo }, people] = await Promise.all([
      searchWithRepair(parsed.data.q),
      (async () => {
        if (personName) {
          const named = await searchPeople(personName).catch(() => []);
          if (named.length > 0) return named;
        }
        return searchPeople(parsed.data.q).catch(() => []);
      })(),
    ]);
    return NextResponse.json({
      correctedTo,
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
      people: people.slice(0, 4).map((p) => ({
        id: p.id,
        name: p.name,
        knownFor: p.knownFor,
        profileUrl: tmdbImage(p.profilePath, 'w185'),
      })),
    });
  } catch (e) {
    if (e instanceof TmdbError) {
      return NextResponse.json({ error: e.userMessage }, { status: e.status });
    }
    return NextResponse.json({ error: 'Search failed. Please try again.' }, { status: 500 });
  }
}
