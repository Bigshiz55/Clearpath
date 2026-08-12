import { NextResponse } from 'next/server';
import { serverEnv } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';
import { listStationsForPack } from '@/lib/packs/stations';
import { CANONICAL_PACK_SLUGS } from '@/lib/packs/identity';
import {
  matchProgrammeRow,
  PROGRAMME_MATCH_COLUMNS,
  type ProgrammeMatchRow,
} from '@/lib/packs/dna';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * PACK IDENTITY BACKFILL — the job whose absence was the whole problem.
 *
 * ── THE MEASUREMENT ───────────────────────────────────────────────────────
 * On the real Lifetime stations: 20 distinct programmes, 2 with a TMDB id, 18
 * with a null media type. The Movie Vault fails closed on anything it cannot
 * confirm is a film, so it removed everything, and the obvious reading — "the
 * filter is too strict" — was wrong.
 *
 * `tmdb_media_type` is written in exactly ONE place: `resolveProgrammeTmdbId`,
 * called from `/api/packs/similar` when a user opens a single title page.
 * There has never been a batch pass. The 2 matched rows were 2 titles somebody
 * clicked. The column was not sparse because matching is hard; it was sparse
 * because nothing was asking.
 *
 * ── WHAT THIS DOES, AND WHAT IT REFUSES TO DO ─────────────────────────────
 * Walks the programmes that actually air on Pack stations and asks the strict
 * matcher about the ones with no id yet. Every acceptance requires an exact
 * normalized title and an unambiguous winner (`pickMatch`), narrowed by the
 * provider's own declared type. It writes `tmdb_id` and `tmdb_media_type` ONLY
 * on a match and never writes a guess — a wrong media type fails open, which is
 * worse than the null it replaced.
 *
 * It also never writes `programme_type`: that is the provider's field, and
 * inferring one would be manufacturing the evidence the filter then reads.
 *
 * Bounded per run and resumable by construction — a matched row is skipped
 * forever after, so coverage accumulates across ticks instead of re-scanning.
 * Protected by CRON_SECRET, dormant without a TMDB key.
 */

/** Bounded per tick: each match is a TMDB search, and the budget is shared. */
const MAX_PER_RUN = 40;
const CONCURRENCY = 4;
/** How deep into each Pack's schedule to look for unmatched rows. */
const AIRING_SCAN = 3000;

export async function GET(request: Request) {
  const secret = serverEnv.cronSecret();
  if (!secret) return NextResponse.json({ error: 'Not configured (missing CRON_SECRET).' }, { status: 503 });
  const auth = request.headers.get('authorization');
  const key = new URL(request.url).searchParams.get('key');
  if (auth !== `Bearer ${secret}` && key !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!serverEnv.tmdbKeyOptional()) return NextResponse.json({ ok: true, skipped: 'no TMDB_API_KEY' });

  const admin = createAdminClient();

  /* EVERY PACK, FROM THE CANONICAL LIST. No slug is written here — iterating
     `CANONICAL_PACK_SLUGS` is what stops this becoming the next place that
     invents a Pack name, and CLAUDE.md forbids branching on a slug anyway. */
  const { data: packRows, error: packErr } = await admin
    .from('packs')
    .select('id, slug')
    .in('slug', [...CANONICAL_PACK_SLUGS]);
  if (packErr) {
    return NextResponse.json({ error: `pack lookup failed: ${packErr.message}` }, { status: 502 });
  }

  const stationIds = new Set<string>();
  for (const p of (packRows ?? []) as Array<{ id: string; slug: string }>) {
    for (const s of await listStationsForPack(admin, p.id)) stationIds.add(s);
  }
  if (stationIds.size === 0) {
    return NextResponse.json({ ok: true, packs: (packRows ?? []).length, stations: 0, skipped: 'no pack stations' });
  }

  const { data: airings, error: airErr } = await admin
    .from('tv_airings')
    .select('programme_id')
    .in('station_id', [...stationIds])
    .order('start_at_utc', { ascending: false })
    .limit(AIRING_SCAN);
  if (airErr) {
    return NextResponse.json({ error: `airings query failed: ${airErr.message}` }, { status: 502 });
  }

  const programmeIds = [...new Set((airings ?? []).map((a) => a.programme_id as string))];
  if (programmeIds.length === 0) {
    return NextResponse.json({ ok: true, stations: stationIds.size, candidates: 0 });
  }

  const { data: rows, error: progErr } = await admin
    .from('tv_programmes')
    .select(PROGRAMME_MATCH_COLUMNS)
    .in('id', programmeIds)
    .is('tmdb_id', null)
    .limit(MAX_PER_RUN);
  if (progErr) {
    return NextResponse.json({ error: `programme query failed: ${progErr.message}` }, { status: 502 });
  }

  const pending = (rows ?? []) as unknown as ProgrammeMatchRow[];
  let matchedCount = 0;
  let unmatchedCount = 0;
  const byBasis: Record<string, number> = {};
  const failed: string[] = [];

  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    const batch = pending.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (row) => {
        const match = await matchProgrammeRow(row).catch(() => null);
        if (!match) {
          unmatchedCount += 1;
          /* NAMED, NOT JUST COUNTED. "18 unmatched" is a number nobody can act
             on; the titles are what tell an owner whether the matcher is too
             strict or the schedule genuinely is paid programming. */
          if (failed.length < 25) failed.push(row.title);
          return;
        }
        const { error } = await admin
          .from('tv_programmes')
          .update({ tmdb_id: match.tmdbId, tmdb_media_type: match.mediaType })
          .eq('id', row.id);
        if (error) {
          unmatchedCount += 1;
          return;
        }
        matchedCount += 1;
        byBasis[match.basis] = (byBasis[match.basis] ?? 0) + 1;
      }),
    );
  }

  return NextResponse.json({
    ok: true,
    stations: stationIds.size,
    programmesOnPackStations: programmeIds.length,
    examined: pending.length,
    matched: matchedCount,
    unmatched: unmatchedCount,
    byBasis,
    unmatchedExamples: failed,
  });
}
