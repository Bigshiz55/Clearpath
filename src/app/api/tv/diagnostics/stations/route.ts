import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isCarriedStationKey } from '@/lib/viewing/channels/carriedStations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * STATION IDENTITY DIAGNOSTIC — temporary, read-only, three channels wide.
 *
 * Three entries that are not television channels (`NBC.com`, `ABC News Live`,
 * `CBS News`) survived a purge that unit tests say should have removed them,
 * and every explanation for that was a guess because nothing exposed what is
 * actually stored. This answers exactly that, for exactly those three: the
 * identifiers the cleanup matches on, and the cleanup's own verdict.
 *
 * SCOPE IS THE SECURITY PROPERTY, NOT THE CONVENIENCE. An earlier revision
 * returned every row in `tv_stations` — the whole lineup, plus a `wouldPurge`
 * list — because that was useful to me while debugging. Useful to me is not
 * the standard: this is an UNAUTHENTICATED endpoint, and the authorisation it
 * was granted covers the three suspect channels and nothing else. The station
 * table is enumerated in the DATABASE and filtered to the three suspects
 * before anything is serialised, so a caller cannot page, widen, or diff their
 * way to the rest of the lineup. `/api/tv/coverage/channels` remains the
 * founder-gated endpoint for whole-table questions.
 *
 * It reads `tv_stations` only — no user rows, no credentials, no arbitrary
 * query, no table selection by the caller, no write path. Every field returned
 * is public channel metadata already visible on the rendered guide.
 *
 * TEMPORARY. It exists to prove the cleanup landed and is removed immediately
 * afterwards; the repo already gates the equivalent whole-table endpoint
 * behind founder auth, and leaving an ungated one alongside it would quietly
 * undo that decision.
 */

/** The three the cleanup is about. Matched as substrings, case-insensitively. */
const SUSPECTS = ['nbc.com', 'abc news live', 'cbs news'] as const;

export async function GET() {
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json(
      { error: 'Admin Supabase client unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  /* Filtered in the DATABASE, not after the fact.
     `or(...)` with `ilike` keeps the whole-table read from ever happening, so
     the endpoint cannot leak a lineup it never fetched. Matching runs across
     the four identity fields because "what is this row called" has four
     possible answers and the point is to find the row whichever one carries
     the name. Commas separate `or()` terms, so a pattern may not contain one —
     none of these do, and `SUSPECTS` is a literal, not caller input. */
  const filter = SUSPECTS.flatMap((s) => [
    `name.ilike.%${s}%`,
    `provider_station_id.ilike.%${s.replace(/[.\s]/g, '-')}%`,
    `call_sign.ilike.%${s}%`,
    `network.ilike.%${s}%`,
  ]).join(',');

  // The columns `tv_stations` ACTUALLY has (migration 0032). An earlier
  // revision asked for `lineup_id`, which does not exist on this table, and
  // PostgREST rejects the whole select when one column is unknown — so the
  // endpoint built to stop the guessing shipped a guess of its own and
  // returned nothing but an error. See src/lib/schemaColumns.test.ts.
  const { data, error } = await admin
    .from('tv_stations')
    .select('id, provider_id, provider_station_id, name, call_sign, network')
    .or(filter)
    .order('name');

  if (error) {
    /* 502, NOT 200. A failed read used to come back 200 with an `{error}` body,
       which is how `{"error":"column tv_stations.lineup_id does not exist"}`
       was mistaken for a successful empty answer. A diagnostic that returns
       "OK" when it learned nothing is worse than no diagnostic: it converts a
       broken query into apparent evidence of absence. */
    return NextResponse.json(
      { error: error.message.slice(0, 200) },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const suspects = (data ?? []).map((r) => ({
    id: r.id as string,
    providerId: r.provider_id as string,
    providerStationId: r.provider_station_id as string,
    name: r.name as string,
    callSign: (r.call_sign as string | null) ?? null,
    network: (r.network as string | null) ?? null,
    // The cleanup's verdict on this exact key — so a mismatch between what the
    // purge believes and what is stored is visible instead of inferred.
    carried: isCarriedStationKey(r.provider_station_id as string),
  }));

  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      scope: 'suspect channels only',
      matched: suspects.length,
      suspects,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
