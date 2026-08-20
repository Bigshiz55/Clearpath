import { NextResponse } from 'next/server';
import { serverEnv } from '@/lib/env';
import { getPopular, getTitle } from '@/lib/tmdb/client';
import { getTitleDimensions, readCachedDimensions } from '@/lib/titleDimensions';
import type { MediaType } from '@/lib/types';
import { assessCoverage, diagnosticDimensionKeys } from '@/lib/showdown/dimensionCoverage';
import { fingerprintKey } from '@/lib/taste/fingerprint';

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
  /* REPORT MODE — MEASURE WITHOUT SPENDING, AND MEASURE EVEN WHEN THE
     CLASSIFIER CANNOT RUN.
     The bug this closes is silence, not cost. Coverage was only ever reported
     as a by-product of a run that classifies, and the no-key branch below
     returned before measuring anything at all — so precisely the deployment
     with a coverage problem was the one that reported nothing about it. A
     comparative answer measured 0 fingerprints out of 43 candidates and there
     was no way to tell whether that was an empty catalog, a missing table or an
     unreachable client. `?report=1` computes the same numbers, classifies
     nothing, writes nothing, spends nothing, and keeps the same CRON_SECRET
     gate: no new surface, no new pipeline. */
  const reportOnly = new URL(request.url).searchParams.get('report') === '1';
  if (!reportOnly && !serverEnv.openaiKey()) {
    return NextResponse.json({ ok: true, skipped: 'no OPENAI_API_KEY', hint: 'add ?report=1 to measure coverage without classifying' });
  }

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

    /* THE DIAGNOSTIC CATALOGUE JUMPS THE QUEUE.
       Popularity backfill widens coverage across the whole catalogue over days,
       which is right for browsing — but Showdown depends on a FIXED set of 46
       titles, and until those carry fingerprints a completed calibration
       contributes nothing to ranking while looking like a success. Forty-six
       titles is a one-off cost of roughly two runs, after which this is a no-op
       forever. Same generator, same cache, same cron: no second pipeline. */
    const diagnostic = diagnosticDimensionKeys().map((k) => ({ id: k.tmdb_id, mediaType: k.media_type }));
    const merged = [
      ...diagnostic,
      ...candidates.map((c) => ({ id: c.id, mediaType: c.mediaType as MediaType })),
    ].filter((c) => {
      const k = `${c.mediaType}-${c.id}`;
      return seen.has(`dedup-${k}`) ? false : (seen.add(`dedup-${k}`), true);
    });

    const evidence = await readCachedDimensions(merged.map((c) => ({ tmdb_id: c.id, media_type: c.mediaType })));
    const have = evidence.dims;
    const coverage = assessCoverage(have);
    const todo = merged
      .filter((c) => !have.has(fingerprintKey({ mediaType: c.mediaType, tmdbId: c.id })))
      .slice(0, MAX_PER_RUN);

    /* CATALOG COVERAGE, NOT JUST THE DIAGNOSTIC SET. `showdownCoverage` answers
       "is the game live?" over 46 fixed titles; this answers "can the ranker
       say anything about the titles we actually recommend?" over the whole
       scanned pool. `evidence.status` separates a real miss from a read that
       never happened — a count of zero means nothing if we could not look. */
    const catalogCoverage = {
      scanned: merged.length,
      fingerprinted: have.size,
      missing: merged.length - have.size,
      ratio: merged.length > 0 ? +(have.size / merged.length).toFixed(3) : 0,
      evidence: evidence.status,
    };

    if (reportOnly) {
      return NextResponse.json({
        ok: true,
        mode: 'report',
        classified: 0,
        pending: merged.length - have.size,
        catalogCoverage,
        showdownCoverage: {
          covered: coverage.covered,
          total: coverage.total,
          usable: coverage.usable,
          missing: coverage.missing,
        },
      });
    }

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

    /* Coverage is reported EVERY run, classified or not, so an operator can
       answer "is Showdown live?" from the cron's own output instead of
       inferring it from a ranking that quietly does nothing. */
    return NextResponse.json({
      ok: true,
      scanned: merged.length,
      pending: todo.length,
      classified,
      catalogCoverage,
      showdownCoverage: {
        covered: coverage.covered,
        total: coverage.total,
        usable: coverage.usable,
        missing: coverage.missing,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Backfill failed.' }, { status: 500 });
  }
}
