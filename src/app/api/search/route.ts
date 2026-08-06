import { NextResponse } from 'next/server';
import { z } from 'zod';
import { searchTitles, searchPeople, TmdbError, tmdbImage } from '@/lib/tmdb/client';
import { splitTitleQualifiers, misspellingCandidates, insertionCandidates, extractPersonName } from '@/lib/nlu/queryRepair';
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
  // Qualifiers ("Fargo the series", "It 1990 miniseries", "the first Rocky",
  // "CSI NY not CSI Miami") and years are INSTRUCTIONS, not name fragments.
  // Both readings are searched and exact catalog evidence decides: "The First
  // Lady" resolves exactly as typed and is untouched; "the first Rocky"
  // resolves to nothing as typed and the stripped reading rescues it.
  const { title: bare, year, mediaType, qualified } = splitTitleQualifiers(raw);

  const [rawResults, bareResults] = await Promise.all([
    searchTitles(raw),
    qualified && bare !== raw ? searchTitles(bare).catch(() => []) : Promise.resolve([]),
  ]);

  // Order by the evidence the qualifier stated: requested media type first,
  // then the requested year (±1 — release-year conventions genuinely differ by
  // one: the Haggis "Crash" premiered 2004, TMDB dates its wide release 2005),
  // otherwise the catalog's own order untouched.
  const ordered = (rs: typeof bareResults) => {
    const yd = (r: { year?: number | null }) => (year == null || r.year == null ? 99 : Math.abs(r.year - year));
    const tier = (r: { mediaType: string; year?: number | null }) => {
      let t = 0;
      if (mediaType != null && r.mediaType !== mediaType) t += 4;
      if (year != null) t += yd(r) === 0 ? 0 : yd(r) === 1 ? 1 : 2;
      return t;
    };
    return rs.map((r, i) => ({ r, i })).sort((a, b) => tier(a.r) - tier(b.r) || a.i - b.i).map((x) => x.r);
  };

  // The stripped reading is used ONLY on exact evidence. Returning non-exact
  // bare results turned over-stripped conversational asks ("Severance but…")
  // into navigable junk; with no exact match the honest answer is the raw
  // results or nothing, and nothing is what routes a request to the Judge.
  const exactForBare = qualified && bareResults.some((r) => isExactTitle(bare, r.title));
  if (exactForBare && !rawResults.some((r) => isExactTitle(raw, r.title))) {
    return { results: ordered(bareResults), correctedTo: bare, year };
  }
  if (rawResults.length > 0) return { results: rawResults, correctedTo: null, year };
  if (exactForBare) return { results: ordered(bareResults), correctedTo: bare, year };
  if (bareResults.length > 0) return { results: [], correctedTo: null, year };

  // Zero results anywhere: bounded corrections in two waves — cheap slips
  // (doubles, space shifts, transpositions) first, then the deletion-class
  // insertions ONLY if the first wave also found nothing. Every candidate is
  // judged by the catalog; the first that returns anything wins.
  const deadline = Date.now() + 6_000; // repair may add latency, never a hang
  for (const wave of [misspellingCandidates(bare || raw), insertionCandidates(bare || raw)]) {
    if (wave.length === 0) continue;
    // Chunked so a dead query never fires one giant burst at the provider.
    for (let at = 0; at < wave.length && Date.now() < deadline; at += 10) {
      const chunk = wave.slice(at, at + 10);
      const settled = await Promise.all(chunk.map((c) => searchTitles(c).catch(() => [])));
      for (let i = 0; i < chunk.length; i++) {
        if (settled[i]!.length > 0) return { results: ordered(settled[i]!), correctedTo: chunk[i]!, year };
      }
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
