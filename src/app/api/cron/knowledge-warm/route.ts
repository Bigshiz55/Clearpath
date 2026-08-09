import { NextResponse } from 'next/server';
import { serverEnv } from '@/lib/env';
import { getPopular, getTitle } from '@/lib/tmdb/client';
import { runKnowledgeWarmJob } from '@/lib/knowledge/warmStore';
import type { WarmCandidate } from '@/lib/knowledge/warm';
import type { MediaType } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Bounded per-run: compile at most this many titles per tick; coverage widens
// across days as the page window rotates. Idempotent — titles already compiled
// at the current COMPILER_VERSION are skipped inside the job.
const MAX_PER_RUN = 15;

/**
 * KNOWLEDGE-LAYER WARM cron. Pre-compiles durable subject facts for popular
 * titles into title_knowledge / title_subject_facts, so eligibility reads them
 * back instead of re-adjudicating. This is the SCHEDULED counterpart to the
 * request-path compile-on-demand; it never runs in a user request.
 *
 * Protected by CRON_SECRET. Dormant without a TMDB key or the tables (the job is
 * safe-absent and simply reports zero). Bounded + idempotent + version-gated.
 */
export async function GET(request: Request) {
  const secret = serverEnv.cronSecret();
  if (!secret) return NextResponse.json({ error: 'Not configured (missing CRON_SECRET).' }, { status: 503 });
  const auth = request.headers.get('authorization');
  const key = new URL(request.url).searchParams.get('key');
  if (auth !== `Bearer ${secret}` && key !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!serverEnv.tmdbKeyOptional()) return NextResponse.json({ ok: true, skipped: 'no TMDB_API_KEY' });

  const region = 'US';
  const day = Math.floor(Date.now() / 86_400_000);
  const extra = (day % 8) + 3; // 3..10 — rotate deeper pages across the week
  const pages = [1, extra];

  try {
    const pools = await Promise.all([
      ...pages.map((p) => getPopular('movie', region, p)),
      ...pages.map((p) => getPopular('tv', region, p)),
    ]);
    const seen = new Set<string>();
    const heads = pools
      .flat()
      .filter((d) => {
        const k = `${d.mediaType}-${d.id}`;
        return seen.has(k) ? false : (seen.add(k), true);
      })
      .slice(0, MAX_PER_RUN * 3); // hydrate a modest pool; the job caps compiles

    // Hydrate evidence (title/overview/genres/keywords) — the same shape the
    // finder builds for eligibility.
    const candidates: WarmCandidate[] = [];
    for (const h of heads) {
      try {
        const meta = await getTitle(h.mediaType as MediaType, h.id, region);
        candidates.push({
          tmdbId: h.id,
          mediaType: h.mediaType as MediaType,
          evidence: { title: meta.title, altTitle: meta.originalTitle ?? null, overview: meta.overview, genres: meta.genres, keywords: meta.keywords },
        });
      } catch {
        /* skip a title that won't hydrate */
      }
    }

    const report = await runKnowledgeWarmJob(candidates, { maxPerRun: MAX_PER_RUN });
    return NextResponse.json({ ok: true, ...report });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Warm failed.' }, { status: 500 });
  }
}
