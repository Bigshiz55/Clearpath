import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isCarriedStationKey } from '@/lib/viewing/channels/carriedStations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * STATION IDENTITY DIAGNOSTIC — read-only, and deliberately narrow.
 *
 * Three entries that are not television channels (`NBC.com`, `ABC News Live`,
 * `CBS News`) survived a purge that unit-tests say should have removed them,
 * and every explanation for that was a guess because nothing exposed what is
 * actually stored. This is the smallest thing that ends the guessing: for each
 * station row, the identifiers the cleanup matches on, and the cleanup's own
 * verdict on it.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It reads `tv_stations` only — no user
 * rows, no credentials, no arbitrary query, no table selection by the caller.
 * Every field returned is public channel metadata or a non-secret identifier
 * that already appears in the rendered guide. There is no write path.
 *
 * It is worth keeping past this incident: "what does the database think this
 * channel is, and would the cleanup keep it?" is the question every future
 * channel-identity bug starts with, and having to add an endpoint to answer it
 * is what turned a one-line fix into three deploys.
 */
export async function GET() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('tv_stations')
    .select('id, provider_id, provider_station_id, name, lineup_id')
    .order('name');

  if (error) {
    return NextResponse.json({ error: error.message.slice(0, 200) }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  }

  const rows = (data ?? []).map((r) => ({
    id: r.id as string,
    providerId: r.provider_id as string,
    providerStationId: r.provider_station_id as string,
    name: r.name as string,
    lineupId: r.lineup_id as string | null,
    // The cleanup's verdict on this exact key — so a mismatch between what the
    // purge believes and what is stored is visible instead of inferred.
    carried: isCarriedStationKey(r.provider_station_id as string),
  }));

  // The three that started this, called out by name so the answer is one read.
  const SUSPECT = ['NBC.com', 'ABC News Live', 'CBS News'];
  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      total: rows.length,
      suspects: rows.filter((r) => SUSPECT.some((s) => r.name.toLowerCase() === s.toLowerCase())),
      wouldPurge: rows.filter((r) => !r.carried),
      stations: rows,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
