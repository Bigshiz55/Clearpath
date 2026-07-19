import { NextResponse } from 'next/server';
import { serverEnv } from '@/lib/env';
import { getPopular, getTitle } from '@/lib/tmdb/client';
import { getCachedDimensions, getTitleDimensions } from '@/lib/titleDimensions';
import type { MediaType } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Bounded per-run cost/time: gpt-4o-mini is cheap, but keep each cron tick small
// and let coverage build over days (page window rotates below).
const MAX_PER_RUN = 20;
const CONCURRENCY = 5;

/**
 * Content-fingerprint backfill. Pre-classifies popular movies & TV into
 * `title_dimensions` so the ranking nudge works catalog-wide, not just on titles
 * a rated user happens to open. Skips anything already fingerprinted, rotates
 * which popularity pages it scans by day, and caps how many it classifies per
 * run. Protected by CRON_SECRET. Dormant without an OpenAI key or the table.
 */
export async function GET(request: Request) {
  const secret = serverEnv.cronSecret();
  if (!secret) return NextResponse.json({ error: 'Not configured (missing CRON_SECRET).' }, { status: 503 });
  const auth = request.headers.get('authorization');
  const key = new URL(request.url).searchParams.get('key');
  if (auth !== `Bearer ${secret}` && key !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!serverEnv.openaiKey()) return NextResponse.json({ ok: true, skipped: 'no OPENAI_API_KEY' });

  const region = 'US';
  // Pages 1 & 2 (the titles everyone sees) plus one day-rotated deeper page, so
  // coverage widens across the week without re-scanning the same slice.
  const day = Math.floor(Date.now() / 86_400_000);
  const extra = (day % 8) + 3; // 3..10
  const pages = [1, 2, extra];

  try {
    const pools = await Promise.all([
      ...pages.map((p) => getPopular('movie', region, p)),
      ...pages.map((p) => getPopular('tv', region, p)),
    ]);
    const seen = new Set<string>();
    const candidates = pools
      .flat()
      .filter((d) => d.posterPath)
      .filter((d) => {
        const k = `${d.mediaType}-${d.id}`;
        return seen.has(k) ? false : (seen.add(k), true);
      });

    const have = await getCachedDimensions(candidates.map((c) => ({ tmdb_id: c.id, media_type: c.mediaType as MediaType })));
    const todo = candidates.filter((c) => !have.has(`${c.mediaType}-${c.id}`)).slice(0, MAX_PER_RUN);

    let classified = 0;
    for (let i = 0; i < todo.length; i += CONCURRENCY) {
      const batch = todo.slice(i, i + CONCURRENCY);
      const res = await Promise.all(
        batch.map(async (c) => {
          try {
            const meta = await getTitle(c.mediaType, c.id, region);
            return (await getTitleDimensions(meta)) ? 1 : 0;
          } catch {
            return 0;
          }
        }),
      );
      classified += res.reduce<number>((a, b) => a + b, 0);
    }

    return NextResponse.json({ ok: true, scanned: candidates.length, pending: todo.length, classified });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Backfill failed.' }, { status: 500 });
  }
}
