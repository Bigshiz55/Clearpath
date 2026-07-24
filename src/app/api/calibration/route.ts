import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { discoverTitles } from '@/lib/tmdb/client';
import { tmdbImage } from '@/lib/tmdb/image';
import { getProfile, regionFor } from '@/lib/profile';
import { buildCalibrationPlan, calibrationProgress, CALIBRATION_SIZE } from '@/lib/preference/calibration';
import { CALIBRATION_BUCKETS, taggedFromBucket, type FetchedTitle } from '@/lib/preference/calibrationPool';
import { countCalibrationAnswers } from '@/lib/preference/dnaSignals';

export const dynamic = 'force-dynamic';

/**
 * FINITE Watch-DNA calibration. Unlike the old endless quiz, this returns a
 * capped, diverse plan of at most 20 titles TOTAL for onboarding. It is:
 *   • Finite     — never more than CALIBRATION_SIZE across the whole onboarding.
 *   • Resumable  — excludes titles already answered (by count) so refresh/logout
 *                  pick up where you left off; when 20 are answered it returns
 *                  an empty plan with `complete: true`.
 *   • Diverse    — sourced by construction from fixed genre/format/era buckets,
 *                  then trimmed by the greedy planner (caps: anime ≤1, ≤3/genre).
 *
 * Progress here is ONLY the onboarding Quiz Progress. DNA Confidence is computed
 * separately (see dnaSignals) and never mirrors this number.
 */
export async function GET(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

    const sessionId = new URL(request.url).searchParams.get('session') ?? undefined;

    const profile = await getProfile(supabase, user.id);
    const region = regionFor(profile);
    const domestic = region || 'US';

    // How many onboarding calibration answers already recorded → drives progress.
    const answered = await countCalibrationAnswers(supabase, user.id, sessionId);
    const progress = calibrationProgress(answered);

    // Finished onboarding: never present more titles.
    if (answered >= CALIBRATION_SIZE) {
      return NextResponse.json({ items: [], answered, size: CALIBRATION_SIZE, progress, complete: true });
    }

    // Exclude everything already rated/saved so we never re-ask.
    const { data: existing } = await supabase
      .from('watchlist_items')
      .select('tmdb_id, media_type')
      .eq('user_id', user.id);
    const seen = new Set((existing ?? []).map((r) => `${r.media_type}:${r.tmdb_id}`));

    // Fetch every bucket (by construction we know each title's tags).
    const fetched = await Promise.all(
      CALIBRATION_BUCKETS.map(async (b) => {
        const rows = await discoverTitles(b.mediaType, {
          region: domestic,
          genreIds: b.genreIds,
          sortBy: b.minYear ? 'vote_average.desc' : 'popularity.desc',
          minVotes: b.minVotes,
          minYear: b.minYear,
          maxYear: b.maxYear,
          originalLanguage: b.originalLanguage,
          originCountry: b.originCountry,
        }).catch(() => [] as Awaited<ReturnType<typeof discoverTitles>>);
        return rows.slice(0, Math.max(b.take + 2, b.take)).map((r) => {
          const t: FetchedTitle = { id: r.id, mediaType: r.mediaType, title: r.title, year: r.year, posterPath: r.posterPath };
          return { cand: taggedFromBucket(t, b, domestic), t };
        });
      }),
    );

    // Union, drop already-seen, dedupe by key.
    const byKey = new Map<string, { cand: ReturnType<typeof taggedFromBucket>; t: FetchedTitle }>();
    for (const group of fetched) {
      for (const item of group) {
        if (seen.has(item.cand.key) || byKey.has(item.cand.key)) continue;
        byKey.set(item.cand.key, item);
      }
    }

    // Plan a full, balanced 20 from the union, then return the still-needed slice.
    const pool = Array.from(byKey.values());
    const plan = buildCalibrationPlan(
      pool.map((p) => p.cand),
      { domestic },
    );

    const remaining = Math.max(0, CALIBRATION_SIZE - answered);
    const items = plan.items.slice(0, remaining).map((c) => {
      const src = byKey.get(c.key)!;
      return {
        id: src.t.id,
        mediaType: src.t.mediaType,
        title: src.t.title,
        year: src.t.year,
        posterPath: src.t.posterPath,
        posterUrl: tmdbImage(src.t.posterPath, 'w342'),
        genre: c.genres[0] ?? null,
      };
    });

    return NextResponse.json({
      items,
      answered,
      size: CALIBRATION_SIZE,
      progress,
      complete: false,
      report: plan.report,
    });
  } catch {
    return NextResponse.json({ error: 'Could not load calibration right now.' }, { status: 500 });
  }
}
