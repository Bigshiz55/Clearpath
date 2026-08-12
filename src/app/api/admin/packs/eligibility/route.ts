import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizeTvAdmin } from '@/lib/tv/platform/adminAuth';
import { listStationsForPack } from '@/lib/packs/stations';
import { partitionEligible, shapeForPack, type ProgrammeFacts } from '@/lib/packs/eligibility';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * ADMIN — WHAT WOULD THE ELIGIBILITY FILTER ACTUALLY DO?
 *
 * A filter that empties a Pack is not a fix, it is a different failure with
 * better manners. `eligibility.ts` fails CLOSED on unmatched programmes — no
 * `tmdb_media_type` means it cannot confirm the row is a film, so the Lifetime
 * Movie Vault drops it. That is the right default and it is only safe if most
 * rows are matched. Nobody knew whether they were.
 *
 * So this measures it against real data before the filter is trusted: how many
 * airings the Pack has, how many are matched to TMDB, the null rate on media
 * type, the movie/TV split, exactly how many survive, and named examples on
 * both sides. If the survivor count is near zero the answer is not to loosen the
 * filter — it is that the matching pipeline, not the filter, is the problem.
 *
 * READ-ONLY AND ADMIN-GATED. It runs SELECTs and returns counts plus a handful
 * of titles; it writes nothing, takes no identifiers from the caller beyond a
 * pack slug, and exposes no user data — there is no user in any of these tables.
 * Same `authorizeTvAdmin` door as every other admin route, so there is one
 * answer to "who is an admin here".
 */

/** Bounded so a query string cannot turn a diagnostic into a table scan. */
const MAX_AIRINGS = 4000;
const EXAMPLES = 12;

interface ProgrammeRow {
  id: string;
  title: string;
  genres: string[] | null;
  release_year: number | null;
  tmdb_id: number | null;
  tmdb_media_type: 'movie' | 'tv' | null;
}

export async function GET(request: Request) {
  const auth = await authorizeTvAdmin(request);
  if (!auth.authorized) return NextResponse.json({ error: auth.reason }, { status: 403 });

  const url = new URL(request.url);
  const slug = (url.searchParams.get('pack') ?? 'lifetime-movie-vault').slice(0, 64);

  const admin = createAdminClient();

  const { data: packRow, error: packErr } = await admin
    .from('packs')
    .select('id, slug, display_name')
    .eq('slug', slug)
    .maybeSingle();
  if (packErr) {
    return NextResponse.json({ error: `pack lookup failed: ${packErr.message}` }, { status: 502 });
  }
  if (!packRow) {
    const { data: all } = await admin.from('packs').select('slug').limit(50);
    return NextResponse.json(
      { error: `no pack with slug "${slug}"`, known: (all ?? []).map((p) => p.slug) },
      { status: 404 },
    );
  }

  const stationIds = await listStationsForPack(admin, packRow.id as string);
  if (stationIds.length === 0) {
    return NextResponse.json({
      pack: slug,
      shape: shapeForPack(slug),
      stations: 0,
      note: 'no stations mapped to this pack — eligibility is not the reason it is empty',
    });
  }

  const { data: airings, error: airErr } = await admin
    .from('tv_airings')
    .select('programme_id')
    .in('station_id', stationIds)
    .order('start_at_utc', { ascending: false })
    .limit(MAX_AIRINGS);
  if (airErr) {
    return NextResponse.json({ error: `airings query failed: ${airErr.message}` }, { status: 502 });
  }

  const programmeIds = [...new Set((airings ?? []).map((a) => a.programme_id as string))];
  if (programmeIds.length === 0) {
    return NextResponse.json({
      pack: slug,
      shape: shapeForPack(slug),
      stations: stationIds.length,
      distinctProgrammes: 0,
      note: 'stations are mapped but carry no airings — an ingest problem, not an eligibility one',
    });
  }

  /* SELECTED COLUMN BY COLUMN AGAINST THE REAL SCHEMA. A select naming a column
     that does not exist returns 200 with an error body, which is how a broken
     diagnostic once reported healthy numbers in this codebase. The error is
     surfaced as a 502 rather than degraded into an empty result. */
  const { data: rows, error: progErr } = await admin
    .from('tv_programmes')
    .select('id, title, genres, release_year, tmdb_id, tmdb_media_type')
    .in('id', programmeIds.slice(0, MAX_AIRINGS));
  if (progErr) {
    return NextResponse.json({ error: `programme query failed: ${progErr.message}` }, { status: 502 });
  }

  const programmes = (rows ?? []) as ProgrammeRow[];
  const matched = programmes.filter((p) => p.tmdb_id != null);
  const mediaTypeNull = programmes.filter((p) => p.tmdb_media_type == null);
  const movies = programmes.filter((p) => p.tmdb_media_type === 'movie');
  const tv = programmes.filter((p) => p.tmdb_media_type === 'tv');

  const shape = shapeForPack(slug);
  const facts: Array<ProgrammeFacts & { id: string }> = programmes.map((p) => ({
    id: p.id,
    title: p.title,
    mediaType: p.tmdb_media_type,
    genres: p.genres ?? [],
    releaseYear: p.release_year,
  }));
  const { kept, rejected } = partitionEligible(shape, facts);

  const byReason: Record<string, number> = {};
  for (const r of rejected) byReason[r.reason] = (byReason[r.reason] ?? 0) + 1;

  const pct = (n: number) => (programmes.length > 0 ? Math.round((n / programmes.length) * 100) : 0);

  return NextResponse.json(
    {
      pack: slug,
      name: packRow.display_name,
      shape,
      stations: stationIds.length,
      airingsSampled: (airings ?? []).length,
      distinctProgrammes: programmes.length,
      identity: {
        tmdbMatched: matched.length,
        tmdbMatchedPct: pct(matched.length),
        unmatched: programmes.length - matched.length,
        mediaTypeNull: mediaTypeNull.length,
        mediaTypeNullPct: pct(mediaTypeNull.length),
        movies: movies.length,
        tv: tv.length,
      },
      eligibility: {
        survivors: kept.length,
        survivorsPct: pct(kept.length),
        rejected: rejected.length,
        byReason,
      },
      examples: {
        included: kept.slice(0, EXAMPLES).map((k) => k.title),
        excluded: rejected.slice(0, EXAMPLES).map((r) => `${r.row.title} — ${r.reason}`),
      },
      /* THE VERDICT, STATED RATHER THAN LEFT TO THE READER. The whole reason
         this endpoint exists is to answer one question, and a wall of counts
         invites the reader to find the answer they wanted. */
      verdict:
        kept.length === 0
          ? 'EMPTY — the filter removes everything. Fix identity/matching before shipping it.'
          : kept.length < 20
            ? 'THIN — technically non-empty but not a browsable destination. Needs a catalog fallback.'
            : 'VIABLE — enough survivors to build a page from.',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
