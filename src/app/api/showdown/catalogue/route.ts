import { NextResponse } from 'next/server';
import { TITLES } from '@/lib/voice/quickdna/definition';
import { resolveCatalogue } from '@/lib/showdown/catalogueResolver';

export const runtime = 'nodejs';
/** The catalogue is fixed and identical for every player. */
export const revalidate = 86400;

/**
 * THE VERIFIED DIAGNOSTIC CATALOGUE — the only source the game may deal from.
 *
 * REPLACES `/api/showdown/posters`, which fetched each title's hand-authored
 * `tmdbId` and rendered whatever came back. That is how anime artwork appeared
 * beside "Making a Murderer": the id was a typo, TMDB returned a real series
 * with a real poster, and nothing ever compared the name it got to the name it
 * was about to print. The fetch was never the bug — the missing comparison was.
 *
 * So this answers a different question. Not "what poster is at this id" but
 * "which of our titles can we prove we have correctly identified".
 *
 * A TITLE WITH NO ARTWORK IS STILL PLAYABLE. Identity and artwork are separate
 * facts: we can be certain a record is The Last Dance and still have no usable
 * poster, and the typographic treatment is a designed state. What is not
 * allowed is the third case the old route produced — confident artwork
 * belonging to a different work.
 */
export async function GET() {
  try {
    const cat = await resolveCatalogue();

    /* LOGGED BECAUSE THE PERSON WHO FIXES `definition.ts` IS NOT THE PERSON
       HOLDING THIS RESPONSE. A correction that only lives in a JSON body gets
       re-derived on every cache miss forever and never gets repaired. */
    if (cat.corrected.length > 0) {
      console.warn(
        `[showdown] ${cat.corrected.length} catalogue ids point at the wrong work. Fix in definition.ts:\n` +
          cat.corrected
            .map((c) => `  ${c.id}: tmdbId ${c.recorded} is "${c.wasShowing}" — should be ${c.actual}`)
            .join('\n'),
      );
    }
    if (cat.unverified.length > 0) {
      console.warn(
        `[showdown] ${cat.unverified.length}/${TITLES.length} titles withheld from the pool:\n` +
          cat.unverified.map((u) => `  ${u.id}: ${u.reason}`).join('\n'),
      );
    }

    return NextResponse.json(
      {
        posters: cat.posters,
        verified: cat.verified.map((v) => v.id),
        unverified: cat.unverified.map((u) => ({ id: u.id, reason: u.reason })),
        corrected: cat.corrected,
        total: TITLES.length,
      },
      { headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400' } },
    );
  } catch {
    /* THE CHECKER IS DOWN, WHICH IS NOT THE SAME AS EVERY TITLE BEING WRONG.
       Returning empty `verified` tells the client to play with typographic
       tiles rather than showing it an empty catalogue — see `poolExclusions`. */
    return NextResponse.json(
      { posters: {}, verified: [], unverified: [], corrected: [], total: TITLES.length },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
