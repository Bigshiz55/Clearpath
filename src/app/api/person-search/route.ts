import { NextResponse } from 'next/server';
import { searchPeople, searchTitles, getCredits } from '@/lib/tmdb/client';
import { extractPersonName, misspellingCandidates } from '@/lib/nlu/queryRepair';
import { isExactTitle } from '@/lib/nlu/titleNormalize';

/**
 * "Who played Rocky?" names a CHARACTER or a title, not a person — searching
 * the person index for "Rocky" finds nobody. The honest resolution is the
 * catalog's own credits: resolve the title exactly, return its top-billed
 * cast. Only an EXACT title match may answer; a guess about which film was
 * meant would attribute the wrong actors with total confidence.
 */
const WHO_PLAYED = /^\s*who\s+(?:played|plays|starred\s+as|was)\s+(?:in\s+)?(.{2,60}?)[?!.\s]*$/i;

/** "Tom Hanks and Meg Ryan together" — two names, one relationship ask. */
const TOGETHER = /^\s*(.{3,40}?)\s+and\s+(.{3,40}?)(?:\s+together|\s+in the same movie|\s+movies)?[?!.\s]*$/i;
import { tmdbImage } from '@/lib/tmdb/image';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q') ?? '';
  try {
    // "who is Sylvester Stallone" and "Gary Sinise movies" are person
    // queries wearing a sentence; strip the phrasing before searching, and
    // fall back through the raw string and bounded typo corrections. Every
    // candidate is judged by the index itself — no guessing.
    const played = q.match(WHO_PLAYED);
    if (played) {
      const titleAsk = played[1]!.trim();
      const results = await searchTitles(titleAsk).catch(() => []);
      const hit = results.find((r) => isExactTitle(titleAsk, r.title));
      if (hit) {
        const credits = await getCredits(hit.mediaType, hit.id).catch(() => null);
        if (credits && credits.cast.length > 0) {
          return NextResponse.json({
            people: credits.cast.slice(0, 4).map((c) => ({
              id: c.id,
              name: c.name,
              knownFor: c.character ? `${c.character} in ${hit.title}` : hit.title,
              profileUrl: tmdbImage(c.profilePath, 'w185'),
            })),
          });
        }
      }
      // No exact title → fall through to ordinary person handling below, so
      // "who played Sherlock Holmes" (a character, not a title) still tries
      // the person index rather than dead-ending.
    }

    const together = !played ? q.match(TOGETHER) : null;
    if (together) {
      const [a, b] = await Promise.all([
        searchPeople(together[1]!.trim()).catch(() => []),
        searchPeople(together[2]!.trim()).catch(() => []),
      ]);
      if (a.length > 0 && b.length > 0) {
        return NextResponse.json({
          people: [a[0]!, b[0]!].map((p) => ({ id: p.id, name: p.name, knownFor: p.knownFor, profileUrl: tmdbImage(p.profilePath, 'w185') })),
        });
      }
    }

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
